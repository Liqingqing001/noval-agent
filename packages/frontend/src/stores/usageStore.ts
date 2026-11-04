import { create } from 'zustand';
import { storageKey } from '../lib/runtime';
import { cleanUsageErrorCode, DEFAULT_USAGE_BUDGET, emptyUsagePeriod, safeUsageInput, usageCost, usageCount, usagePeriodKeys, usagePriceKey, usageSummary, USAGE_RECORD_LIMIT, validatedBudget, validatedPrice } from '../lib/modelUsage';
import type { SafeCallInput, UsageBudget, UsageData, UsageFinish, UsagePrice, UsageRecord, UsageSource, UsageStatus, UsageUpdate } from '../lib/modelUsage';

export const USAGE_STORAGE_KEY = storageKey('novel-agent-usage');
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export interface UsageStore extends UsageData {
  beginCall: (input: SafeCallInput) => Promise<{ id: string; blockedReason?: string; warning?: string }>;
  updateCall: (id: string, patch: UsageUpdate) => Promise<void>;
  finishCall: (id: string, outcome: UsageFinish) => Promise<void>;
  savePrice: (price: Omit<UsagePrice, 'key' | 'updatedAt'>) => Promise<void>;
  removePrice: (key: string) => Promise<void>;
  saveBudget: (budget: Partial<UsageBudget>) => Promise<void>;
  clearRecords: () => Promise<void>;
  resetStatistics: () => Promise<void>;
  retryPersistence: () => Promise<void>;
}
interface StoreOptions { storage?: StorageLike | null; key?: string; now?: () => number; id?: () => string; ownerId?: string; recordLimit?: number }
const statusNames = new Set<UsageStatus>(['running', 'succeeded', 'failed', 'cancelled', 'blocked', 'interrupted']);
const sources = new Set<UsageSource>(['reported', 'estimated', 'mixed']);
let fallbackId = 0;
const identifier = () => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `usage-${Date.now()}-${++fallbackId}`;
const initialData = (at: number): UsageData => ({ records: [], prices: [], budget: { ...DEFAULT_USAGE_BUDGET }, statisticsSince: at, periods: {} });
function ownerIdentifier(): { ownerId: string; recoveryOwnerId?: string } {
  if (typeof window === 'undefined') return { ownerId: 'node', recoveryOwnerId: 'node' };
  const ownerId = identifier();
  try {
    const key = storageKey('novel-agent-usage-tab');
    const old = sessionStorage.getItem(key);
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    // Duplicated tabs inherit sessionStorage, so a new document always receives
    // its own owner. Only a real reload may settle the previous document's work.
    sessionStorage.setItem(key, ownerId);
    return { ownerId, recoveryOwnerId: old && navigation?.type === 'reload' ? old : undefined };
  } catch { return { ownerId }; }
}

/** Rebuild only allowed metadata. Old or manually edited storage cannot inject request secrets into export. */
function sanitize(raw: unknown, now: number): UsageData {
  if (!raw || typeof raw !== 'object') throw new Error('调用记录格式无法识别。');
  const value = raw as Partial<UsageData>;
  const result = initialData(now);
  result.statisticsSince = usageCount(value.statisticsSince, now);
  try { result.budget = validatedBudget({ ...DEFAULT_USAGE_BUDGET, ...value.budget }); } catch { /* Retain safe disabled defaults. */ }
  for (const price of Array.isArray(value.prices) ? value.prices : []) {
    try { result.prices.push(validatedPrice(price, usageCount(price.updatedAt, now))); } catch { /* Ignore invalid stored rates. */ }
  }
  for (const row of Array.isArray(value.records) ? value.records : []) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !statusNames.has(row.status)) continue;
    const safe = safeUsageInput(row);
    let price: UsagePrice | undefined;
    try { if (row.price) price = validatedPrice(row.price, usageCount(row.price.updatedAt, now)); } catch { /* Unknown price is never free. */ }
    const record: UsageRecord = {
      ...safe, id: row.id.slice(0, 160), operation: safe.operation || '文本生成', context: safe.context || {},
      startedAt: usageCount(row.startedAt, now), status: row.status, inputTokens: usageCount(row.inputTokens), outputTokens: usageCount(row.outputTokens), totalTokens: usageCount(row.totalTokens),
      outputCharacters: usageCount(row.outputCharacters), usageSource: sources.has(row.usageSource) ? row.usageSource : 'estimated', dispatched: row.dispatched === true,
      currency: row.currency === 'USD' ? 'USD' : 'CNY', price,
      estimatedInputTokens: safe.estimatedInputTokens, outputTokenLimit: safe.outputTokenLimit,
      endedAt: row.endedAt === undefined ? undefined : usageCount(row.endedAt), durationMs: row.durationMs === undefined ? undefined : usageCount(row.durationMs),
      errorCode: cleanUsageErrorCode(row.errorCode),
      ownerId: typeof row.ownerId === 'string' ? row.ownerId.slice(0, 160) : undefined,
      recoveryAt: row.recoveryAt === undefined ? undefined : usageCount(row.recoveryAt),
    };
    if (typeof row.cost === 'number' && Number.isFinite(row.cost) && row.cost >= 0) record.cost = row.cost;
    if (typeof row.reservedCost === 'number' && Number.isFinite(row.reservedCost) && row.reservedCost >= 0) record.reservedCost = row.reservedCost;
    // Warnings are generated locally, rather than trusting arbitrary persisted upstream text.
    if (row.warning) record.warning = '本次请求触发了预算提醒，请核对调用与预算。';
    result.records.push(record);
  }
  for (const [key, period] of Object.entries(value.periods || {})) {
    if (!/^(?:CNY|USD):(?:day:\d{4}-\d{2}-\d{2}|month:\d{4}-\d{2})$/.test(key) || !period || typeof period !== 'object') continue;
    result.periods[key] = { calls: usageCount(period.calls), inputTokens: usageCount(period.inputTokens), outputTokens: usageCount(period.outputTokens), outputCharacters: usageCount(period.outputCharacters), cost: typeof period.cost === 'number' && Number.isFinite(period.cost) && period.cost >= 0 ? period.cost : 0, unknownCostCalls: usageCount(period.unknownCostCalls), estimatedCalls: usageCount(period.estimatedCalls) };
  }
  return result;
}
function addPeriod(data: UsageData, record: UsageRecord) {
  if (!record.dispatched || record.status === 'blocked' || record.startedAt < data.statisticsSince) return;
  const keys = usagePeriodKeys(record.startedAt, record.currency);
  for (const key of [keys.day, keys.month]) {
    const previous = data.periods[key] || emptyUsagePeriod();
    data.periods[key] = { calls: previous.calls + 1, inputTokens: previous.inputTokens + record.inputTokens, outputTokens: previous.outputTokens + record.outputTokens, outputCharacters: previous.outputCharacters + record.outputCharacters, cost: previous.cost + (record.cost || 0), unknownCostCalls: previous.unknownCostCalls + (record.cost === undefined ? 1 : 0), estimatedCalls: previous.estimatedCalls + (record.usageSource === 'reported' ? 0 : 1) };
  }
}
function recoverInterrupted(data: UsageData, ownerId: string, now: number): boolean {
  let changed = false;
  for (const record of data.records) {
    if (record.status !== 'running' || record.ownerId && record.ownerId !== ownerId && (record.recoveryAt || record.startedAt + 3_600_000) > now) continue;
    record.status = 'interrupted'; record.endedAt = now; record.durationMs = Math.max(0, now - record.startedAt); record.errorCode = 'interrupted';
    if (record.dispatched) {
      record.outputTokens = Math.max(record.outputTokens, record.outputTokenLimit || 0);
      record.totalTokens = Math.max(record.totalTokens, record.inputTokens + record.outputTokens);
      const observedCost = usageCost(record, record.price);
      record.cost = record.reservedCost === undefined ? undefined : Math.max(record.reservedCost, observedCost || 0);
      record.usageSource = record.usageSource === 'reported' ? 'mixed' : 'estimated';
    } else { record.inputTokens = 0; record.outputTokens = 0; record.totalTokens = 0; record.cost = 0; }
    delete record.reservedCost; addPeriod(data, record); changed = true;
  }
  return changed;
}
function updateRecord(record: UsageRecord, patch: UsageUpdate) {
  if (patch.dispatched === true) record.dispatched = true;
  if (patch.outputCharacters !== undefined) record.outputCharacters = usageCount(patch.outputCharacters, record.outputCharacters);
  for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) if (patch.usage?.[key] !== undefined) record[key] = usageCount(patch.usage[key], record[key]);
  record.totalTokens = Math.max(record.totalTokens, record.inputTokens + record.outputTokens);
  if (patch.usageSource && sources.has(patch.usageSource)) record.usageSource = patch.usageSource;
}
function pruneRecords(data: UsageData, limit: number) {
  data.records = [...data.records.filter(row => row.status === 'running'), ...data.records.filter(row => row.status !== 'running').slice(0, limit)].sort((a, b) => b.startedAt - a.startedAt || b.id.localeCompare(a.id));
}

export function createUsageStore(options: StoreOptions = {}) {
  const now = options.now || Date.now, makeId = options.id || identifier, ownership = options.ownerId ? { ownerId: options.ownerId, recoveryOwnerId: options.ownerId } : ownerIdentifier(), ownerId = ownership.ownerId, key = options.key || USAGE_STORAGE_KEY;
  const limit = Math.max(1, options.recordLimit || USAGE_RECORD_LIMIT);
  let storage: StorageLike | undefined;
  let storageError: string | undefined;
  try { storage = options.storage === null ? undefined : options.storage || (typeof window !== 'undefined' ? localStorage : undefined); }
  catch { storageError = '浏览器禁止保存调用记录，请允许本机存储后重试。'; }
  const read = (): UsageData | undefined => {
    if (!storage) return;
    const raw = storage.getItem(key);
    if (!raw) return;
    const envelope = JSON.parse(raw);
    if (envelope.version !== 1) throw new Error('调用记录版本无法识别。');
    return sanitize(envelope.state, now());
  };
  let initial = initialData(now()), unreadable = false;
  try { initial = read() || initial; }
  catch { unreadable = true; storageError = '调用记录无法读取，请先导出可见资料并明确清空记录后重试。'; }
  initial.storageError = storageError;
  let queue: Promise<unknown> = Promise.resolve();
  const store = create<UsageStore>()(() => ({
    ...initial,
    beginCall: async input => {
      let createdId: string | undefined;
      try { return await mutate(data => {
      const safe = safeUsageInput(input), at = now(), id = makeId(); createdId = id;
      const price = data.prices.find(candidate => candidate.key === usagePriceKey(safe.provider, safe.protocol, safe.model, data.budget.currency));
      const reservation = safe.outputTokenLimit === undefined ? undefined : usageCost({ inputTokens: safe.estimatedInputTokens, outputTokens: safe.outputTokenLimit }, price);
      const summary = usageSummary(data, at), warnings: string[] = [];
      const configured = data.budget.mode !== 'off';
      const perExceeded = data.budget.perCallLimit !== undefined && reservation !== undefined && reservation > data.budget.perCallLimit;
      const projected = summary.month.cost + summary.active.reservedCost + (reservation || 0);
      const monthExceeded = data.budget.monthlyLimit !== undefined && reservation !== undefined && projected > data.budget.monthlyLimit;
      const unknown = !price || safe.outputTokenLimit === undefined || summary.month.unknownCostCalls > 0 || summary.active.unknownCostCalls > 0;
      if (configured && unknown) warnings.push('用量或单价不完整，无法可靠计算预算；请设置当前模型单价和输出上限，或明确重新开始统计。');
      if (configured && perExceeded) warnings.push('本次预计费用超过单次预算。');
      if (configured && monthExceeded) warnings.push('本次预计费用加在途预留超过本月预算。');
      if (configured && !monthExceeded && data.budget.monthlyLimit !== undefined && projected >= data.budget.monthlyLimit * data.budget.warningPercent / 100) warnings.push(`本月预计支出已达到预算的 ${data.budget.warningPercent}%。`);
      const blockedReason = data.budget.mode === 'block' && (unknown || perExceeded || monthExceeded) ? warnings.join(' ') : undefined;
      const record: UsageRecord = { ...safe, id, operation: safe.operation || '文本生成', context: safe.context || {}, startedAt: at, status: blockedReason ? 'blocked' : 'running', inputTokens: safe.estimatedInputTokens, outputTokens: 0, totalTokens: safe.estimatedInputTokens, outputCharacters: 0, usageSource: 'estimated', dispatched: false, currency: data.budget.currency, price: price ? { ...price } : undefined, reservedCost: reservation, ownerId, recoveryAt: at + 3_600_000, warning: warnings.join(' ') || undefined };
      if (blockedReason) { record.endedAt = at; record.durationMs = 0; record.inputTokens = 0; record.totalTokens = 0; record.cost = 0; record.errorCode = 'budget_blocked'; delete record.reservedCost; }
      data.records.unshift(record);
      pruneRecords(data, limit);
      return { id, blockedReason, warning: warnings.join(' ') || undefined };
      }); } catch (error) {
        // A reservation that never reached durable storage must not survive as
        // an in-flight paid request or consume the next attempt's budget.
        if (createdId) {
          const data = dataFromStore(), record = data.records.find(row => row.id === createdId);
          if (record?.status === 'running' && !record.dispatched) {
            record.status = 'cancelled'; record.endedAt = now(); record.durationMs = Math.max(0, record.endedAt - record.startedAt);
            record.inputTokens = 0; record.outputTokens = 0; record.totalTokens = 0; record.cost = 0; record.errorCode = 'storage_failed'; delete record.reservedCost;
            store.setState(data);
          }
        }
        throw error;
      }
    },
    updateCall: (id, patch) => {
      // The service already throttles streaming updates. This second boundary keeps
      // callers that emit every token from synchronously writing browser storage.
      if (patch.dispatched !== true && now() - (updates.get(id) || 0) < 400) return Promise.resolve();
      updates.set(id, now());
      let wasDispatched = false;
      return mutate(data => { const record = data.records.find(row => row.id === id); if (record?.status === 'running') { wasDispatched = record.dispatched; updateRecord(record, patch); } }).catch(error => {
        if (patch.dispatched === true && !wasDispatched) {
          const data = dataFromStore(), record = data.records.find(row => row.id === id);
          if (record?.status === 'running') { record.dispatched = false; store.setState(data); }
        }
        throw error;
      });
    },
    finishCall: (id, outcome) => mutate(data => {
      const record = data.records.find(row => row.id === id);
      if (!record || record.status !== 'running') return;
      if (outcome.dispatched === false) record.dispatched = false;
      updateRecord(record, outcome);
      record.status = outcome.status; record.endedAt = now(); record.durationMs = Math.max(0, record.endedAt - record.startedAt); record.errorCode = cleanUsageErrorCode(outcome.errorCode);
      if (!record.dispatched) { record.inputTokens = 0; record.outputTokens = 0; record.totalTokens = 0; record.cost = 0; }
      else record.cost = usageCost(record, record.price);
      delete record.reservedCost; addPeriod(data, record); updates.delete(id); pruneRecords(data, limit);
    }),
    savePrice: price => mutate(data => { const next = validatedPrice(price, now()); data.prices = [...data.prices.filter(row => row.key !== next.key), next]; }),
    removePrice: priceKey => mutate(data => { data.prices = data.prices.filter(row => row.key !== priceKey); }),
    saveBudget: budget => mutate(data => { data.budget = validatedBudget({ ...data.budget, ...budget }); }),
    clearRecords: () => mutate(data => { data.records = data.records.filter(row => row.status === 'running'); unreadable = false; }, true),
    resetStatistics: () => mutate(data => { if (data.records.some(row => row.status === 'running')) throw new Error('仍有执行中的调用，请结束后再重新开始统计。'); data.periods = {}; data.statisticsSince = now(); unreadable = false; }, true),
    retryPersistence: () => mutate(() => {}),
  }));
  const updates = new Map<string, number>();
  const dataFromStore = (): UsageData => {
    const state = store.getState();
    return { records: state.records.map(record => ({ ...record, context: { ...record.context }, price: record.price ? { ...record.price } : undefined })), prices: state.prices.map(price => ({ ...price })), budget: { ...state.budget }, statisticsSince: state.statisticsSince, periods: Object.fromEntries(Object.entries(state.periods).map(([period, value]) => [period, { ...value }])) };
  };
  function mutate<T>(action: (data: UsageData) => T, explicitRecovery = false): Promise<T> {
    const run = async () => {
      if (unreadable && !explicitRecovery) throw new Error(store.getState().storageError || '调用记录暂时无法读取。');
      if (!storage && typeof window !== 'undefined' && options.storage !== null) throw new Error(store.getState().storageError || '浏览器存储不可用，未发送模型请求。');
      let data: UsageData;
      try { data = store.getState().storageError || explicitRecovery ? dataFromStore() : read() || dataFromStore(); }
      catch { throw new Error('调用记录读取失败，未发送新的模型请求。'); }
      // Other tabs retain their reservation until completion or expiry. Reload
      // recovery uses this same lock and a fresh read below.
      for (const row of data.records) if (row.status === 'running' && row.ownerId !== ownerId && (row.recoveryAt || 0) <= now()) recoverInterrupted(data, '', now());
      const result = action(data);
      try {
        storage?.setItem(key, JSON.stringify({ version: 1, state: data }));
        store.setState({ ...data, storageError: undefined });
      } catch {
        store.setState({ ...data, storageError: '调用记录保存失败，请导出可见记录并释放浏览器空间；新请求不会在预留失败时发送。' });
        throw new Error('调用记录保存失败，请检查浏览器存储后重试。');
      }
      return result;
    };
    const execute = () => typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(`${key}:write`, run) : run();
    const result = queue.then(execute);
    queue = result.catch(() => {});
    return result;
  }
  if (!unreadable && initial.records.some(row => row.status === 'running' && (!row.ownerId || row.ownerId === ownership.recoveryOwnerId || (row.recoveryAt || row.startedAt + 3_600_000) <= now()))) {
    // Enqueue before any caller can reserve a new request, and re-read under the
    // cross-tab write lock so a reload cannot overwrite another tab's settlement.
    void mutate(data => { recoverInterrupted(data, ownership.recoveryOwnerId || '', now()); }).catch(() => {});
  }
  if (typeof window !== 'undefined' && storage) window.addEventListener('storage', event => {
    if (event.key !== key || store.getState().storageError) return;
    void mutate(() => {}).catch(() => {});
  });
  return store;
}

export const useUsageStore = createUsageStore();
