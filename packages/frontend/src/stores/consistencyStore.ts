import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { storageKey } from '../lib/runtime';
import type { ConsistencyDisposition, ConsistencyEvidence, ConsistencyFact, ConsistencyIssue, ConsistencyRun } from '../lib/bookConsistency';

export interface ConsistencyReport { novelId: string; fingerprint: string; checkedAt: number; localIssues: ConsistencyIssue[]; run?: ConsistencyRun; dispositions: Record<string, ConsistencyDisposition> }
type Reports = Record<string, ConsistencyReport>;
type Envelope = { version: 1; reports: Reports };
type Mutation = (reports: Reports) => Reports;
export interface ConsistencyState {
  reports: Reports; ready: boolean; saving: boolean; error: string; unreadable: boolean;
  flush: () => Promise<void>;
  saveLocal: (novelId: string, fingerprint: string, issues: ConsistencyIssue[]) => Promise<void>;
  saveRun: (novelId: string, run: ConsistencyRun) => Promise<void>;
  setDisposition: (novelId: string, issueId: string, value: ConsistencyDisposition) => Promise<void>;
  clearReport: (novelId: string) => Promise<void>;
  retrySave: () => Promise<void>;
  resetUnreadable: () => Promise<void>;
}
export interface ConsistencyPersistence {
  read: (key: string) => Promise<unknown>;
  write: (key: string, value: unknown) => Promise<void>;
  /** The browser adapter performs this callback inside one read/write transaction. */
  update?: (key: string, apply: (raw: unknown) => Envelope) => Promise<unknown>;
}
const DB = 'novel-agent-consistency-v1', OBJECT_STORE = 'workspaces', MAX_SIZE = 12_000_000;
const dispositionNames = new Set<ConsistencyDisposition>(['open', 'resolved', 'ignored']);
const sourceTypes = new Set(['chapter', 'character', 'world', 'outline', 'foreshadow']);
const cached = new Map<string, StoreApi<ConsistencyState>>();
const fallbackQueues = new Map<string, Promise<unknown>>();
const emptyReports = (): Reports => Object.create(null);
const envelope = (reports: Reports): Envelope => ({ version: 1, reports });
const invalid = (): never => { throw new Error('检查报告内容无法读取，原资料未被覆盖。'); };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
const string = (value: unknown, max = 1200): string => typeof value === 'string' && value.length <= max ? value : invalid();
const integer = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid();
const strings = (value: unknown, max = 200): string[] => Array.isArray(value) ? value.map(item => string(item, max)) : invalid();
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : invalid();

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    let blocked = false;
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(OBJECT_STORE)) request.result.createObjectStore(OBJECT_STORE); };
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    request.onerror = () => reject(new Error('本机检查报告库无法打开，请检查浏览器存储权限。'));
    request.onblocked = () => { blocked = true; reject(new Error('检查报告库被其他标签页阻止，请关闭其他 NovelAgent 页面后重试。')); };
  });
}
const browserPersistence: ConsistencyPersistence = {
  read: async key => {
    const db = await database();
    try { return await new Promise((resolve, reject) => { const tx = db.transaction(OBJECT_STORE, 'readonly'), request = tx.objectStore(OBJECT_STORE).get(key); tx.oncomplete = () => resolve(request.result); tx.onerror = tx.onabort = () => reject(new Error('本机检查报告读取失败，原资料未被覆盖。')); }); } finally { db.close(); }
  },
  write: async (key, value) => {
    const db = await database();
    try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(OBJECT_STORE, 'readwrite'); tx.objectStore(OBJECT_STORE).put(value, key); tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(new Error('检查报告未保存，请先导出当前结果再重试保存。')); }); } finally { db.close(); }
  },
  update: async (key, apply) => {
    const db = await database();
    try {
      return await new Promise<Envelope>((resolve, reject) => {
        const tx = db.transaction(OBJECT_STORE, 'readwrite'), objectStore = tx.objectStore(OBJECT_STORE), request = objectStore.get(key);
        let next: Envelope, failure: unknown;
        request.onsuccess = () => { try { next = apply(request.result); objectStore.put(next, key); } catch (error) { failure = error; tx.abort(); } };
        tx.oncomplete = () => resolve(next);
        tx.onerror = tx.onabort = () => reject(failure || new Error('检查报告未保存，可能是浏览器空间不足。结果仍保留在本页，请先导出报告再重试保存。'));
      });
    } finally { db.close(); }
  },
};

function evidence(value: unknown): ConsistencyEvidence {
  const row = record(value);
  if (!sourceTypes.has(String(row.sourceType))) invalid();
  return { sourceType: row.sourceType as ConsistencyEvidence['sourceType'], sourceId: string(row.sourceId, 200), ...(row.chapterId === undefined ? {} : { chapterId: string(row.chapterId, 200) }), quote: string(row.quote, 600), verified: row.verified === true };
}
function issue(value: unknown, origin: 'local' | 'ai'): ConsistencyIssue {
  const row = record(value);
  if (row.origin !== origin || !['error', 'warning', 'info'].includes(String(row.severity)) || !['structure', 'name', 'timeline', 'state', 'relationship', 'world', 'foreshadow', 'other'].includes(String(row.category)) || !Array.isArray(row.evidence) || row.evidence.length > 10) invalid();
  return { id: string(row.id, 500), origin, category: row.category as ConsistencyIssue['category'], severity: row.severity as ConsistencyIssue['severity'], title: string(row.title, 10000), detail: string(row.detail, 100000), suggestion: string(row.suggestion, 100000), chapterIds: strings(row.chapterIds), characterIds: strings(row.characterIds), evidence: array(row.evidence).map(evidence), verified: row.verified === true };
}
function fact(value: unknown): ConsistencyFact {
  const row = record(value);
  return { id: string(row.id, 200), entity: string(row.entity, 80), ...(row.characterId === undefined ? {} : { characterId: string(row.characterId, 200) }), dimension: string(row.dimension, 60), value: string(row.value, 240), evidence: evidence(row.evidence) };
}
function validate(raw: unknown, recoverRunning = false): Reports {
  const document = record(raw), data = record(document.reports);
  if (document.version !== 1 || JSON.stringify(raw).length > MAX_SIZE || Object.keys(data).length > 20) invalid();
  const reports = emptyReports();
  for (const [key, value] of Object.entries(data)) {
    const row = record(value);
    if (row.novelId !== key || !Array.isArray(row.localIssues)) invalid();
    const dispositions = Object.fromEntries(Object.entries(record(row.dispositions || {})).filter(([, value]) => dispositionNames.has(value as ConsistencyDisposition))) as Record<string, ConsistencyDisposition>;
    let run: ConsistencyRun | undefined;
    if (row.run) {
      const saved = record(row.run);
      if (saved.version !== 1 || saved.novelId !== key || !['running', 'failed', 'cancelled', 'completed'].includes(String(saved.status)) || !Array.isArray(saved.issues)) invalid();
      const batches: ConsistencyRun['batches'] = Object.create(null), comparisonBatches: ConsistencyRun['comparisonBatches'] = Object.create(null);
      for (const [id, value] of Object.entries(record(saved.batches))) {
        const batch = record(value);
        if (!Array.isArray(batch.issues) || batch.issues.length > 50 || !Array.isArray(batch.facts) || batch.facts.length > 8) invalid();
        batches[id] = { reviewedSegmentIds: strings(batch.reviewedSegmentIds, 500), issues: array(batch.issues).map(value => issue(value, 'ai')), facts: array(batch.facts).map(fact) };
      }
      for (const [id, value] of Object.entries(record(saved.comparisonBatches))) {
        if (!Array.isArray(value) || value.length > 50) invalid();
        comparisonBatches[id] = array(value).map(value => issue(value, 'ai'));
      }
      let lastAttempt: ConsistencyRun['lastAttempt'];
      if (saved.lastAttempt) { const attempt = record(saved.lastAttempt); lastAttempt = { text: string(attempt.text, 100000), error: string(attempt.error), at: integer(attempt.at) }; }
      const recovered = recoverRunning && saved.status === 'running';
      run = { version: 1, novelId: key, fingerprint: string(saved.fingerprint, 200), modelKey: string(saved.modelKey, 200), status: recovered ? 'failed' : saved.status as ConsistencyRun['status'], batches, comparisonBatches, issues: array(saved.issues).map(value => issue(value, 'ai')), completedBatches: integer(saved.completedBatches), totalBatches: integer(saved.totalBatches), updatedAt: integer(saved.updatedAt), limitations: strings(saved.limitations, 2000), lastAttempt: recovered ? { text: lastAttempt?.text || '', error: '页面上次关闭或刷新，检查未确认完成。请主动继续，不会自动调用模型。', at: Date.now() } : lastAttempt };
    }
    reports[key] = { novelId: key, fingerprint: string(row.fingerprint, 200), checkedAt: integer(row.checkedAt), localIssues: array(row.localIssues).map(value => issue(value, 'local')), run, dispositions };
  }
  return reports;
}
function fallbackPersistence(): ConsistencyPersistence {
  const memory = new Map<string, unknown>();
  return {
    read: async key => {
      if (typeof localStorage !== 'undefined') { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : undefined; }
      if (typeof window !== 'undefined') throw new Error('浏览器无法使用检查报告库，请检查本机存储权限。');
      return memory.get(key);
    },
    write: async (key, value) => {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
      else if (typeof window !== 'undefined') throw new Error('检查报告无法保存，请导出结果并检查浏览器存储权限。');
      else memory.set(key, structuredClone(value));
    },
  };
}

/** Report text stays in this browser; namespaces separate demo and signed-in accounts. */
export function createConsistencyWorkspace(namespace: string, options: { persistence?: ConsistencyPersistence; key?: string; cache?: boolean } = {}) {
  const key = options.key || `${storageKey('novel-agent-consistency')}:${namespace}`;
  if (!options.persistence && options.cache !== false && cached.has(key)) return cached.get(key)!;
  const persistence = options.persistence || (typeof indexedDB !== 'undefined' ? browserPersistence : fallbackPersistence());
  let queue: Promise<void> = Promise.resolve(), unreadable = false;
  const pending: Mutation[] = [];
  const serialize = (reports: Reports): Envelope => {
    const next = envelope(reports);
    if (JSON.stringify(next).length > MAX_SIZE || Object.keys(reports).length > 20) throw new Error('本机检查报告已达容量上限（20 本或约 1200 万序列化字符），新结果仍保留在本页，可导出并清除不需要的报告后重试。');
    return envelope(validate(next));
  };
  const atomic = async (apply: (raw: unknown) => Envelope): Promise<Reports> => {
    if (persistence.update) return validate(await persistence.update(key, apply));
    // Fallback adapters are serialized across independently opened stores. Browser
    // IndexedDB uses its transaction above even where Web Locks are unavailable.
    const run = async () => { const next = apply(await persistence.read(key)); await persistence.write(key, next); return next; };
    const execute = () => typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(`${key}:write`, run) : run();
    const next = (fallbackQueues.get(key) || Promise.resolve()).catch(() => {}).then(execute);
    fallbackQueues.set(key, next);
    try { return validate(await next); } finally { if (fallbackQueues.get(key) === next) fallbackQueues.delete(key); }
  };
  const store = createStore<ConsistencyState>()((set, get) => {
    const existing = (reports: Reports, novelId: string): ConsistencyReport => Object.hasOwn(reports, novelId) ? reports[novelId] : { novelId, fingerprint: '', checkedAt: Date.now(), localIssues: [], dispositions: {} };
    const persist = async () => {
      const batch = pending.slice();
      if (!batch.length) { set({ saving: false }); return; }
      const reports = await atomic(raw => serialize(batch.reduce((data, operation) => operation(data), raw === undefined ? emptyReports() : validate(raw))));
      pending.splice(0, batch.length);
      set({ reports: pending.reduce((data, operation) => operation(data), reports), saving: false, error: '', unreadable: false });
    };
    const commit = (update?: Mutation): Promise<void> => {
      const operation = async () => {
        await load;
        if (unreadable) throw new Error(get().error || '检查报告无法读取，未覆盖原资料。');
        if (update) {
          const reports = update(get().reports);
          pending.push(update);
          // Retain the new paid result in memory even when quota or capacity
          // prevents a durable write; export and a later retry still include it.
          set({ reports, saving: true, error: '' });
        } else set({ saving: true });
        try { await persist(); }
        catch (error) { const message = error instanceof Error ? error.message : '检查报告未保存，请先导出当前结果再重试。'; set({ saving: false, error: message }); throw new Error(message); }
      };
      const result = queue.catch(() => {}).then(operation); queue = result; return result;
    };
    return {
      reports: emptyReports(), ready: false, saving: false, error: '', unreadable: false,
      flush: async () => { await load; await queue; },
      saveLocal: (novelId, fingerprint, issues) => commit(reports => ({ ...reports, [novelId]: { ...existing(reports, novelId), fingerprint, checkedAt: Date.now(), localIssues: issues, dispositions: existing(reports, novelId).fingerprint === fingerprint ? existing(reports, novelId).dispositions : {} } })),
      saveRun: (novelId, run) => run.novelId !== novelId ? Promise.reject(new Error('检查进度不属于当前作品。')) : commit(reports => ({ ...reports, [novelId]: { ...existing(reports, novelId), run } })),
      setDisposition: (novelId, issueId, value) => {
        if (!dispositionNames.has(value)) return Promise.reject(new Error('复核状态无效。'));
        const expected = get().reports[novelId];
        const target = expected && [...expected.localIssues, ...(expected.run?.issues || [])].find(issue => issue.id === issueId);
        if (!target) return Promise.reject(new Error('疑点已不存在，请重新打开当前报告。'));
        return commit(reports => {
          const report = reports[novelId];
          // Another tab may clear or replace the report after this UI rendered.
          // Do not resurrect it or leave an unreplayable pending review mutation.
          if (!report || (target.origin === 'local' ? report.fingerprint !== expected.fingerprint : report.run?.fingerprint !== expected.run?.fingerprint) || ![...report.localIssues, ...(report.run?.issues || [])].some(issue => issue.id === issueId)) return reports;
          return { ...reports, [novelId]: { ...report, dispositions: { ...report.dispositions, [issueId]: value } } };
        });
      },
      clearReport: novelId => commit(reports => { const next = { ...reports }; delete next[novelId]; return next; }),
      retrySave: async () => {
        await load;
        if (unreadable) {
          try { const raw = await persistence.read(key); set({ reports: raw === undefined ? emptyReports() : validate(raw, true), unreadable: false, error: '' }); unreadable = false; }
          catch (error) { const message = error instanceof Error ? error.message : '检查报告仍无法读取，未覆盖原资料。'; set({ error: message }); throw new Error(message); }
        }
        return commit();
      },
      resetUnreadable: async () => {
        await load;
        if (!unreadable) return;
        const reports = await atomic(raw => { try { return envelope(raw === undefined ? emptyReports() : validate(raw)); } catch { return envelope(emptyReports()); } });
        pending.splice(0); unreadable = false; set({ reports, ready: true, saving: false, error: '', unreadable: false });
      },
    };
  });
  const load = (async () => {
    try { const raw = await persistence.read(key); store.setState({ reports: raw === undefined ? emptyReports() : validate(raw, true), ready: true }); }
    catch (error) { unreadable = true; store.setState({ ready: true, unreadable: true, error: error instanceof Error ? error.message : '本机检查报告无法读取，原资料未被覆盖。' }); }
  })();
  if (!options.persistence && options.cache !== false) cached.set(key, store);
  return store;
}
