export type UsageCurrency = 'CNY' | 'USD';
export type UsageSource = 'reported' | 'estimated' | 'mixed';
export type UsageStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'blocked' | 'interrupted';
export type UsageErrorCode = 'budget_blocked' | 'cancelled' | 'timeout' | 'request_failed' | 'invalid_response' | 'interrupted' | 'storage_failed' | 'output_limit' | 'provider_rejected' | 'network_error';

export interface UsageContext { novelId?: string; sessionId?: string; sourceId?: string; retryOf?: string }
export interface UsageTokens { inputTokens: number; outputTokens: number; totalTokens: number }
export interface UsagePrice {
  key: string; provider: string; protocol: string; model: string; currency: UsageCurrency;
  inputPerMillion: number; outputPerMillion: number; updatedAt: number;
}
export interface UsageBudget {
  currency: UsageCurrency;
  mode: 'off' | 'warn' | 'block';
  monthlyLimit?: number;
  perCallLimit?: number;
  warningPercent: number;
}
export interface UsageRecord extends UsageTokens {
  id: string; provider: string; protocol: string; model: string; operation: string;
  context: UsageContext; startedAt: number; endedAt?: number; durationMs?: number;
  status: UsageStatus; outputCharacters: number; usageSource: UsageSource;
  dispatched: boolean; price?: UsagePrice; currency: UsageCurrency; cost?: number;
  reservedCost?: number; estimatedInputTokens: number; outputTokenLimit?: number;
  errorCode?: UsageErrorCode; warning?: string;
  ownerId?: string; recoveryAt?: number;
}
export interface SafeCallInput {
  provider: string; protocol: string; model: string; operation?: string; context?: UsageContext;
  estimatedInputTokens: number; outputTokenLimit?: number;
}
export interface UsageUpdate {
  outputCharacters?: number; usage?: Partial<UsageTokens>; usageSource?: UsageSource; dispatched?: boolean;
}
export interface UsageFinish extends UsageUpdate {
  status: 'succeeded' | 'failed' | 'cancelled'; errorCode?: UsageErrorCode;
}
export interface UsagePeriod {
  calls: number; inputTokens: number; outputTokens: number; outputCharacters: number;
  cost: number; unknownCostCalls: number; estimatedCalls: number;
}
export interface UsageData {
  records: UsageRecord[]; prices: UsagePrice[]; budget: UsageBudget;
  statisticsSince: number; periods: Record<string, UsagePeriod>; storageError?: string;
}

export const USAGE_RECORD_LIMIT = 500;
export const DEFAULT_USAGE_BUDGET: UsageBudget = { currency: 'CNY', mode: 'off', warningPercent: 80 };
export const emptyUsagePeriod = (): UsagePeriod => ({ calls: 0, inputTokens: 0, outputTokens: 0, outputCharacters: 0, cost: 0, unknownCostCalls: 0, estimatedCalls: 0 });
export const usagePriceKey = (provider: string, protocol: string, model: string, currency: UsageCurrency): string => JSON.stringify([provider, protocol, model.trim(), currency]);

/** Fallback only. Real provider usage always takes precedence; this is not a tokenizer. */
export function estimateTextTokens(text: string): number {
  let ascii = 0, other = 0;
  for (const character of text) { if (character.codePointAt(0)! <= 127) ascii++; else other++; }
  return text ? Math.max(1, Math.ceil(ascii / 4 + other * 1.2)) : 0;
}
export const estimateChatTokens = (messages: readonly { content: string }[]): number => 16 + messages.reduce((sum, message) => sum + estimateTextTokens(message.content) + 8, 0);
export const countOutputCharacters = (text: string): number => Array.from(text).filter(character => !/\s/u.test(character)).length;

export function usageCost(usage: Pick<UsageTokens, 'inputTokens' | 'outputTokens'>, price?: UsagePrice): number | undefined {
  return price ? (usage.inputTokens * price.inputPerMillion + usage.outputTokens * price.outputPerMillion) / 1_000_000 : undefined;
}
export function usagePeriodKeys(at: number, currency: UsageCurrency): { day: string; month: string } {
  const date = new Date(at), month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return { day: `${currency}:day:${month}-${String(date.getDate()).padStart(2, '0')}`, month: `${currency}:month:${month}` };
}
export function usageSummary(data: UsageData, now = Date.now(), currency: UsageCurrency = data.budget.currency) {
  const keys = usagePeriodKeys(now, currency);
  const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const active = data.records.filter(record => record.status === 'running' && record.currency === currency && record.startedAt >= monthStart.getTime()).reduce((total, record) => ({
    calls: total.calls + 1,
    reservedCost: total.reservedCost + (record.reservedCost || 0),
    unknownCostCalls: total.unknownCostCalls + (record.reservedCost === undefined ? 1 : 0),
  }), { calls: 0, reservedCost: 0, unknownCostCalls: 0 });
  return { today: data.periods[keys.day] || emptyUsagePeriod(), month: data.periods[keys.month] || emptyUsagePeriod(), active, retainedCount: data.records.length, statisticsSince: data.statisticsSince };
}

const providers = new Set(['deepseek', 'openai', 'anthropic', 'gemini', 'qwen', 'zhipu', 'moonshot', 'siliconflow', 'tencent', 'ollama', 'lmstudio', 'custom']);
const protocols = new Set(['openai', 'responses', 'anthropic', 'gemini']);
const operations = new Set(['文本生成', '创作对话', '生成大纲', '优化大纲', '续写章节', '续写一章', '续写三章', '检查章节', '参考分析', '参考提纲', '参考新稿', '连接测试', '续写回复', '重试请求']);
const errorCodes = new Set<UsageErrorCode>(['budget_blocked', 'cancelled', 'timeout', 'request_failed', 'invalid_response', 'interrupted', 'storage_failed', 'output_limit', 'provider_rejected', 'network_error']);
export const cleanUsageErrorCode = (code: unknown): UsageErrorCode | undefined => errorCodes.has(code as UsageErrorCode) ? code as UsageErrorCode : undefined;
export const usageCount = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(Math.min(value, Number.MAX_SAFE_INTEGER)) : fallback;
export function safeUsageInput(value: SafeCallInput): SafeCallInput {
  const context: UsageContext = {};
  for (const key of ['novelId', 'sessionId', 'sourceId', 'retryOf'] as const) {
    const id = value.context?.[key];
    if (typeof id === 'string' && /^[A-Za-z0-9._:-]{1,160}$/.test(id)) context[key] = id;
  }
  return {
    provider: providers.has(value.provider) ? value.provider : 'custom',
    protocol: protocols.has(value.protocol) ? value.protocol : 'openai',
    model: String(value.model || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 160),
    operation: operations.has(value.operation || '') ? value.operation : '文本生成', context,
    estimatedInputTokens: usageCount(value.estimatedInputTokens),
    outputTokenLimit: value.outputTokenLimit === undefined ? undefined : usageCount(value.outputTokenLimit),
  };
}
export function validatedPrice(value: Omit<UsagePrice, 'key' | 'updatedAt'>, now: number): UsagePrice {
  if (!['CNY', 'USD'].includes(value.currency) || !value.model?.trim()) throw new Error('请选择币种并填写模型 ID。');
  for (const rate of [value.inputPerMillion, value.outputPerMillion]) if (!Number.isFinite(rate) || rate < 0 || rate > 1_000_000_000) throw new Error('单价必须是有效的非负数字。');
  const safe = safeUsageInput({ ...value, estimatedInputTokens: 0 });
  return { key: usagePriceKey(safe.provider, safe.protocol, safe.model, value.currency), provider: safe.provider, protocol: safe.protocol, model: safe.model, currency: value.currency, inputPerMillion: value.inputPerMillion, outputPerMillion: value.outputPerMillion, updatedAt: now };
}
export function validatedBudget(value: UsageBudget): UsageBudget {
  if (!['CNY', 'USD'].includes(value.currency) || !['off', 'warn', 'block'].includes(value.mode)) throw new Error('预算币种或模式无效。');
  for (const limit of [value.monthlyLimit, value.perCallLimit]) if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) throw new Error('预算金额须大于零，留空表示不限制。');
  if (value.mode !== 'off' && value.monthlyLimit === undefined && value.perCallLimit === undefined) throw new Error('启用预算时，请至少设置一项限额。');
  if (!Number.isFinite(value.warningPercent) || value.warningPercent <= 0 || value.warningPercent > 100) throw new Error('提醒阈值应在 1% 到 100% 之间。');
  return { currency: value.currency, mode: value.mode, monthlyLimit: value.monthlyLimit, perCallLimit: value.perCallLimit, warningPercent: value.warningPercent };
}
