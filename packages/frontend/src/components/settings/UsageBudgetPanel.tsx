import { useEffect, useMemo, useState } from 'react';
import { Download, Pencil, RefreshCw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUsageStore } from '@/stores/usageStore';
import { API_PRESETS, PROTOCOL_NAMES } from '@/lib/modelConfig';
import type { APIProvider, ModelProtocol } from '@/lib/modelConfig';
import { USAGE_RECORD_LIMIT, usageSummary } from '@/lib/modelUsage';
import type { UsageBudget, UsageCurrency, UsagePeriod, UsagePrice, UsageRecord, UsageStatus } from '@/lib/modelUsage';

const control = 'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm';
const number = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 8 });
const money = (value: number | undefined, currency: UsageCurrency) => value === undefined ? '未定价' : value > 0 && value < .00000001 ? `<${currency === 'CNY' ? '¥' : '$'}0.00000001` : `${currency === 'CNY' ? '¥' : '$'}${number(value)}`;
const dateTime = (value: number) => new Date(value).toLocaleString('zh-CN', { hour12: false });
const providerName = (provider: string) => API_PRESETS[provider as APIProvider]?.name || '自定义服务';
const statuses: Record<UsageStatus, string> = { running: '进行中', succeeded: '成功', failed: '失败', cancelled: '已取消', blocked: '预算拦截', interrupted: '未完成' };
const sources = { reported: '接口返回', mixed: '部分估算', estimated: '文本估算' } as const;
const statusClass: Record<UsageStatus, string> = { running: 'bg-primary/10 text-primary', succeeded: 'bg-emerald-50 text-emerald-800', failed: 'bg-red-50 text-red-800', cancelled: 'bg-muted text-muted-foreground', blocked: 'bg-amber-50 text-amber-900', interrupted: 'bg-amber-50 text-amber-900' };
const errors: Record<string, string> = { budget_blocked: '未发送：预算检查未通过', cancelled: '请求已取消', timeout: '请求超时', request_failed: '模型请求失败', invalid_response: '响应格式无效', interrupted: '页面关闭或刷新，请求未确认完成', storage_failed: '本机记录保存失败', output_limit: '达到输出上限，结果未完成', provider_rejected: '模型服务拒绝本次请求', network_error: '连接中断或网络不可用' };

interface PriceDraft { provider: string; protocol: string; model: string; currency: UsageCurrency; input: string; output: string }
interface BudgetDraft { currency: UsageCurrency; mode: UsageBudget['mode']; monthly: string; perCall: string; warning: string }
const budgetDraft = (value: UsageBudget): BudgetDraft => ({ currency: value.currency, mode: value.mode, monthly: value.monthlyLimit === undefined ? '' : String(value.monthlyLimit), perCall: value.perCallLimit === undefined ? '' : String(value.perCallLimit), warning: String(value.warningPercent) });
const rate = (value: string) => { if (!value.trim()) throw new Error('输入和输出单价都需要填写；免费模型请明确填 0。'); return Number(value); };
const limit = (value: string) => value.trim() ? Number(value) : undefined;
const hasPartialOutput = (record: UsageRecord) => record.outputCharacters > 0 && ['failed', 'cancelled', 'interrupted'].includes(record.status);

function PeriodCard({ title, period, currency, kind }: { title: string; period: UsagePeriod; currency: UsageCurrency; kind: string }) {
  return <div data-usage-summary={kind} className="min-w-0 rounded-xl border bg-card p-4">
    <h4 className="text-sm font-medium">{title}</h4>
    <p className="mt-2 break-all text-xl font-semibold tabular-nums">{money(period.cost, currency)}<span className="ml-2 text-xs font-normal text-muted-foreground">费用估算</span></p>
    <p className="mt-2 text-sm">{number(period.calls)} 次请求 · {number(period.outputCharacters)} 输出字符</p>
    <p className="mt-1 break-words text-xs text-muted-foreground">输入 {number(period.inputTokens)} / 输出 {number(period.outputTokens)} tokens</p>
    {!!period.unknownCostCalls && <p className="mt-2 text-xs text-amber-800">另有 {number(period.unknownCostCalls)} 次未定价，未计入金额</p>}
    {!!period.estimatedCalls && <p className="mt-1 text-xs text-muted-foreground">{number(period.estimatedCalls)} 次含估算 token 用量</p>}
  </div>;
}

/** Local metadata only: never export request bodies, headers, API keys, or model text. */
function publicRecord(record: UsageRecord) {
  return {
    id: record.id, provider: record.provider, protocol: record.protocol, model: record.model, operation: record.operation,
    context: { novelId: record.context.novelId, sessionId: record.context.sessionId, sourceId: record.context.sourceId, retryOf: record.context.retryOf },
    startedAt: record.startedAt, endedAt: record.endedAt, durationMs: record.durationMs, status: record.status,
    outputCharacters: record.outputCharacters, inputTokens: record.inputTokens, outputTokens: record.outputTokens, totalTokens: record.totalTokens,
    usageSource: record.usageSource, dispatched: record.dispatched, currency: record.currency, cost: record.cost, reservedCost: record.reservedCost,
    estimatedInputTokens: record.estimatedInputTokens, outputTokenLimit: record.outputTokenLimit, errorCode: record.errorCode, warning: record.warning,
    price: record.price ? publicPrice(record.price) : undefined,
  };
}
function publicPrice(price: UsagePrice) {
  return { key: price.key, provider: price.provider, protocol: price.protocol, model: price.model, currency: price.currency, inputPerMillion: price.inputPerMillion, outputPerMillion: price.outputPerMillion, updatedAt: price.updatedAt };
}

export function UsageBudgetPanel() {
  const state = useUsageStore();
  const activeProvider = useSettingsStore(value => value.apiProvider);
  const activeProtocol = useSettingsStore(value => value.protocol);
  const activeModel = useSettingsStore(value => value.model);
  const [currency, setCurrency] = useState<UsageCurrency>(state.budget.currency);
  const [price, setPrice] = useState<PriceDraft>({ provider: activeProvider, protocol: activeProtocol, model: activeModel, currency: state.budget.currency, input: '', output: '' });
  const [budget, setBudget] = useState(() => budgetDraft(state.budget));
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ error: boolean; text: string }>();
  const [now, setNow] = useState(Date.now);
  const summary = usageSummary(state, now, currency);
  const running = state.records.some(record => record.status === 'running');
  const visible = useMemo(() => state.records.filter(record => (status === 'all' || record.status === status) && `${record.model} ${record.operation} ${providerName(record.provider)}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => b.startedAt - a.startedAt), [state.records, status, query]);
  const pages = Math.max(1, Math.ceil(visible.length / 20));
  const currentPage = Math.min(page, pages - 1);
  const records = visible.slice(currentPage * 20, currentPage * 20 + 20);
  const retainedStatuses = state.records.reduce((counts, record) => ({ ...counts, [record.status]: (counts[record.status] || 0) + 1 }), {} as Partial<Record<UsageStatus, number>>);
  const retainedPartialOutputs = state.records.filter(hasPartialOutput).length;
  const monthlyLimit = state.budget.currency === currency ? state.budget.monthlyLimit : undefined;
  const knownCommitted = summary.month.cost + summary.active.reservedCost;

  useEffect(() => { setBudget(budgetDraft(state.budget)); }, [state.budget.currency, state.budget.mode, state.budget.monthlyLimit, state.budget.perCallLimit, state.budget.warningPercent]);
  useEffect(() => { setCurrency(state.budget.currency); }, [state.budget.currency]);
  useEffect(() => { setPage(0); }, [status, query]);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), running ? 1000 : 30_000);
    return () => clearInterval(timer);
  }, [running]);

  const act = async (name: string, action: () => Promise<void>, success: string) => {
    if (busy) return;
    setBusy(name); setNotice(undefined);
    try { await action(); setNotice({ error: false, text: success }); }
    catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : '操作未保存，请重试。' }); }
    finally { setBusy(''); }
  };
  const savePrice = () => void act('price', async () => {
    await state.savePrice({ provider: price.provider, protocol: price.protocol, model: price.model.trim(), currency: price.currency, inputPerMillion: rate(price.input), outputPerMillion: rate(price.output) });
  }, '模型单价已保存，仅影响后续调用；历史费用保持原快照。');
  const saveBudget = () => void act('budget', async () => {
    const monthlyLimit = limit(budget.monthly), perCallLimit = limit(budget.perCall);
    if (budget.mode !== 'off' && monthlyLimit === undefined && perCallLimit === undefined) throw new Error('开启预算提醒或拦截前，请至少填写每月预算或单次预算。');
    await state.saveBudget({ currency: budget.currency, mode: budget.mode, monthlyLimit, perCallLimit, warningPercent: Number(budget.warning) });
  }, '预算已保存，后续模型请求会使用这份设置。');
  const fillActivePrice = () => {
    const existing = state.prices.find(item => item.provider === activeProvider && item.protocol === activeProtocol && item.model === activeModel && item.currency === price.currency);
    setPrice({ provider: activeProvider, protocol: activeProtocol, model: activeModel, currency: price.currency, input: existing ? String(existing.inputPerMillion) : '', output: existing ? String(existing.outputPerMillion) : '' });
  };
  const exportRecords = () => {
    const data = { version: 1, exportedAt: Date.now(), scope: '本浏览器调用记录与估算预算', records: state.records.map(publicRecord), prices: state.prices.map(publicPrice), budget: { currency: state.budget.currency, mode: state.budget.mode, monthlyLimit: state.budget.monthlyLimit, perCallLimit: state.budget.perCallLimit, warningPercent: state.budget.warningPercent }, statisticsSince: state.statisticsSince, periods: state.periods };
    const url = URL.createObjectURL(new Blob(['\uFEFF', JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `NovelAgent-调用记录-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section aria-label="AI 调用记录与预算" className="min-w-0 space-y-5">
    <div>
      <h3 className="text-xl font-semibold">AI 调用记录与预算</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">记录本浏览器实际发起的模型调用。测试连接会计入，示例文字回放不计入。</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">金额均按你填写的模型单价估算；未配置单价显示“未定价”，不当作免费。</p>
    </div>
    {state.storageError && <div role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-800"><p>{state.storageError} 请先导出备份，再释放本浏览器存储空间。</p><Button size="sm" variant="outline" className="mt-3" disabled={!!busy} onClick={() => void act('persist', state.retryPersistence, '调用记录已重新保存。')}>重新保存调用记录</Button></div>}
    {notice && <p role={notice.error ? 'alert' : 'status'} className={`rounded-lg border p-3 text-sm leading-relaxed ${notice.error ? 'border-red-300 text-red-800' : 'text-primary'}`}>{notice.text}</p>}

    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">统计自 {dateTime(summary.statisticsSince)} 起累计</p>
      <label className="flex items-center gap-2 text-sm">统计币种<select aria-label="统计币种" value={currency} onChange={event => setCurrency(event.target.value as UsageCurrency)} className={control} style={{ width: '8rem' }}><option value="CNY">人民币 CNY</option><option value="USD">美元 USD</option></select></label>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <PeriodCard title="今日" kind="today" period={summary.today} currency={currency} />
      <PeriodCard title="本月" kind="month" period={summary.month} currency={currency} />
    </div>
    <div data-usage-summary="active" className="rounded-xl border bg-card p-4 text-sm">
      <p className="font-medium">进行中 {summary.active.calls} 次 · 已知预留 {money(summary.active.reservedCost, currency)}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">调用前按输入与最大输出估算预留，完成后按实际可得用量结算。{summary.active.unknownCostCalls > 0 && `另有 ${summary.active.unknownCostCalls} 次未定价。`}</p>
      {monthlyLimit !== undefined && <div className="mt-3">
        <p className="mb-2 text-xs">本月已知费用 + 在途预留 {money(knownCommitted, currency)} / 预算 {money(monthlyLimit, currency)}</p>
        <div role="progressbar" aria-label="本月预算使用比例" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(knownCommitted / monthlyLimit * 100))} className="h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.min(100, knownCommitted / monthlyLimit * 100)}%` }} /></div>
      </div>}
    </div>

    <details className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer text-sm font-medium">用量、费用和预算怎样计算</summary>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
        <p>token 优先采用接口返回值；接口未返回完整用量时，用文本长度估算并标记来源。输出字符不含空白和隐藏推理，token 不等于中文字数。</p>
        <p>费用是输入、输出 token 乘以自填单价的估算，不是服务商账单；不自动计算缓存折扣、工具费用或网关加价。不同币种分别统计，不做汇率转换。</p>
        <p>拦截模式在发送前检查已知费用和在途预留；缺少单价或存在未定价费用时，会要求补齐信息或明确重新开始统计。上游未报告的用量、页面关闭与已经发出的请求可能导致估算偏差，预算不能替代服务商账户限额。</p>
        <p>记录和统计只保存在当前浏览器，不跨设备同步；日志不保存 API Key、请求头、提示词或正文。关闭页面后没有后台续跑，未确认完成的调用保留为“未完成”。</p>
      </div>
    </details>

    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <h4 className="font-semibold">模型单价</h4>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">按你使用的服务商或网关报价填写每百万 token 单价，输入与输出分别计价。免费模型请明确填 0；留空表示尚未配置。</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">新调用按已保存的预算币种（{state.budget.currency}）匹配单价；上方“统计币种”只改变汇总显示。</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">单价服务商<select aria-label="单价服务商" className={control} value={price.provider} onChange={event => setPrice({ ...price, provider: event.target.value })}>{Object.entries(API_PRESETS).map(([key, preset]) => <option key={key} value={key}>{preset.name}</option>)}</select></label>
        <label className="space-y-1 text-sm">单价协议<select aria-label="单价协议" className={control} value={price.protocol} onChange={event => setPrice({ ...price, protocol: event.target.value })}>{Object.entries(PROTOCOL_NAMES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        <label className="space-y-1 text-sm">单价模型<Input aria-label="单价模型" value={price.model} onChange={event => setPrice({ ...price, model: event.target.value })} placeholder="模型 ID / 部署名称" autoComplete="off" /></label>
        <label className="space-y-1 text-sm">单价币种<select aria-label="单价币种" className={control} value={price.currency} onChange={event => setPrice({ ...price, currency: event.target.value as UsageCurrency, input: '', output: '' })}><option value="CNY">人民币 CNY</option><option value="USD">美元 USD</option></select></label>
        <label className="space-y-1 text-sm">输入单价（每百万 tokens）<Input aria-label="输入单价（每百万 tokens）" type="number" min="0" max="1000000000" step="any" inputMode="decimal" value={price.input} onChange={event => setPrice({ ...price, input: event.target.value })} placeholder="未配置" /></label>
        <label className="space-y-1 text-sm">输出单价（每百万 tokens）<Input aria-label="输出单价（每百万 tokens）" type="number" min="0" max="1000000000" step="any" inputMode="decimal" value={price.output} onChange={event => setPrice({ ...price, output: event.target.value })} placeholder="未配置" /></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><Button disabled={!!busy} onClick={savePrice}><Save size={16} />保存模型单价</Button><Button variant="outline" onClick={fillActivePrice}>填入当前模型</Button></div>
      <p className="mt-2 text-xs text-muted-foreground">相同服务商、协议、模型和币种会更新单价；历史调用保留当时单价，不会重新计费。</p>
      {state.prices.length > 0 && <details className="mt-4 rounded-lg border p-3" open>
        <summary className="cursor-pointer text-sm font-medium">已保存单价（{state.prices.length}）</summary>
        <div className="mt-3 space-y-2">{state.prices.map(item => <div key={item.key} data-usage-price={item.key} className="min-w-0 rounded-lg bg-muted/30 p-3">
          <p className="break-all text-sm font-medium">{providerName(item.provider)} · {item.model}</p>
          <p className="mt-1 break-words text-xs text-muted-foreground">{item.currency} / 每百万 tokens：输入 {number(item.inputPerMillion)}，输出 {number(item.outputPerMillion)}</p>
          <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="ghost" aria-label={`编辑单价：${item.provider}/${item.model}/${item.currency}`} onClick={() => setPrice({ provider: item.provider, protocol: item.protocol, model: item.model, currency: item.currency, input: String(item.inputPerMillion), output: String(item.outputPerMillion) })}><Pencil size={14} />编辑</Button><Button size="sm" variant="ghost" disabled={!!busy} aria-label={`删除单价：${item.provider}/${item.model}/${item.currency}`} onClick={() => { if (confirm('删除这份模型单价？历史费用不变，后续调用可能显示未定价。')) void act('remove-price', () => state.removePrice(item.key), '单价已删除，历史费用保持不变。'); }}><Trash2 size={14} />删除</Button></div>
        </div>)}</div>
      </details>}
    </div>

    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <h4 className="font-semibold">调用预算</h4>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">默认关闭。可只提醒，也可在预计超出预算时阻止新请求；不取消已经执行的请求。</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">预算币种<select aria-label="预算币种" className={control} value={budget.currency} onChange={event => setBudget({ ...budget, currency: event.target.value as UsageCurrency, monthly: '', perCall: '' })}><option value="CNY">人民币 CNY</option><option value="USD">美元 USD</option></select></label>
        <label className="space-y-1 text-sm">预算策略<select aria-label="预算策略" className={control} value={budget.mode} onChange={event => setBudget({ ...budget, mode: event.target.value as UsageBudget['mode'] })}><option value="off">关闭</option><option value="warn">仅提醒，继续调用</option><option value="block">预计超额时拦截新调用</option></select></label>
        <label className="space-y-1 text-sm">每月预算<Input aria-label="每月预算" type="number" min="0" step="any" inputMode="decimal" value={budget.monthly} onChange={event => setBudget({ ...budget, monthly: event.target.value })} placeholder="留空表示不限制" /></label>
        <label className="space-y-1 text-sm">单次预算<Input aria-label="单次预算" type="number" min="0" step="any" inputMode="decimal" value={budget.perCall} onChange={event => setBudget({ ...budget, perCall: event.target.value })} placeholder="留空表示不限制" /></label>
        <label className="space-y-1 text-sm">预算提醒比例（%）<Input aria-label="预算提醒比例（%）" type="number" min="1" max="100" step="1" value={budget.warning} onChange={event => setBudget({ ...budget, warning: event.target.value })} /></label>
      </div>
      <Button className="mt-4" disabled={!!busy} onClick={saveBudget}><Save size={16} />保存预算</Button>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">新调用按这里保存的币种匹配单价，即使预算关闭也生效。切换币种会清空未保存的预算金额，请重新填写；不会换算历史费用。</p>
    </div>

    <div className="min-w-0 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold">调用历史</h4><Button size="sm" variant="outline" onClick={exportRecords}><Download size={15} />导出调用记录</Button></div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">保留最近 {USAGE_RECORD_LIMIT} 条元数据。列表清空不清除已累计的预算用量。</p>
      {state.records.length > 0 && <p className="mt-2 text-xs text-muted-foreground">最近记录：成功 {retainedStatuses.succeeded || 0} · 失败 {retainedStatuses.failed || 0} · 已取消 {retainedStatuses.cancelled || 0} · 未完成 {retainedStatuses.interrupted || 0} · 预算拦截 {retainedStatuses.blocked || 0}；其中 {retainedPartialOutputs} 次保留了部分输出。</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm">筛选调用状态<select aria-label="筛选调用状态" className={control} value={status} onChange={event => setStatus(event.target.value)}><option value="all">全部状态</option>{Object.entries(statuses).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label className="space-y-1 text-sm">搜索模型或任务<Input aria-label="搜索模型或任务" value={query} onChange={event => setQuery(event.target.value)} placeholder="模型、服务商或任务" /></label></div>
      <div className="mt-4 space-y-3">
        {records.map(record => <article key={record.id} data-usage-record={record.id} data-usage-source={record.usageSource} data-usage-status={record.status} className="min-w-0 rounded-xl border p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><h5 className="font-medium">{record.operation}</h5><p className="mt-1 break-all text-sm text-muted-foreground">{providerName(record.provider)} · {record.model || '未指定模型'}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-xs ${statusClass[record.status]}`}>{statuses[record.status]}</span></div>
          <p className="mt-2 text-xs text-muted-foreground">{dateTime(record.startedAt)}</p>
          {hasPartialOutput(record) && <p className="mt-2 text-xs text-amber-800">已保留部分输出，尚未完成。</p>}
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <p className="min-w-0 break-all">{money(record.status === 'running' ? record.reservedCost : record.cost, record.currency)}<span className="block text-xs text-muted-foreground">{record.status === 'running' ? '在途预留估算' : '费用估算'} · {record.currency}</span></p>
            <p>{record.status === 'running' ? `${number(Math.max(0, now - record.startedAt) / 1000)} 秒` : `${number((record.durationMs || 0) / 1000)} 秒`}<span className="block text-xs text-muted-foreground">耗时 · {number(record.outputCharacters)} 输出字符</span></p>
            <p>{number(record.inputTokens)} / {number(record.outputTokens)}<span className="block text-xs text-muted-foreground">输入 / 输出 tokens</span></p>
            <p>{number(record.totalTokens)}<span className="block text-xs text-muted-foreground">总 tokens · {sources[record.usageSource]}</span></p>
          </div>
          {record.warning && <p className="mt-3 text-xs leading-relaxed text-amber-800">{record.warning}</p>}
          {record.errorCode && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{errors[record.errorCode] || '本次调用未确认完成'}。{record.dispatched ? '失败或中断不代表服务商没有计费，已接收文字请在原任务查看。' : '本次未发送模型请求。'}</p>}
          <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">查看调用详情</summary><dl className="mt-2 space-y-1 break-words"><div><dt className="inline font-medium">协议：</dt><dd className="inline">{PROTOCOL_NAMES[record.protocol as ModelProtocol] || record.protocol}</dd></div><div><dt className="inline font-medium">用量来源：</dt><dd className="inline">{sources[record.usageSource]}；金额始终为单价估算</dd></div>{record.price && <div><dt className="inline font-medium">当时单价：</dt><dd className="inline">{record.price.currency} / 百万 tokens，输入 {number(record.price.inputPerMillion)}，输出 {number(record.price.outputPerMillion)}</dd></div>}<div><dt className="inline font-medium">请求状态：</dt><dd className="inline">{record.dispatched ? '已交给网络发送' : '未发送模型请求'}</dd></div>{record.context.retryOf && <div><dt className="inline font-medium">重试来源：</dt><dd className="inline break-all">{record.context.retryOf}</dd></div>}<div><dt className="inline font-medium">调用编号：</dt><dd className="inline break-all">{record.id}</dd></div></dl></details>
        </article>)}
        {!records.length && <p className="rounded-lg bg-muted/30 px-3 py-8 text-center text-sm text-muted-foreground">{state.records.length ? '没有符合筛选条件的调用。' : '还没有 AI 调用记录。实际调用模型后会显示在这里。'}</p>}
      </div>
      {pages > 1 && <div className="mt-4 flex items-center justify-between gap-2 text-sm"><Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页记录</Button><span>{currentPage + 1} / {pages}</span><Button size="sm" variant="outline" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>下一页记录</Button></div>}
      <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!!busy || running || !state.records.length} onClick={() => { if (confirm('清空最近调用记录？模型单价、预算和已累计费用都会保留。')) void act('clear', () => state.clearRecords(), '调用列表已清空，累计费用和预算用量已保留。'); }}><Trash2 size={14} />清空调用记录</Button><Button size="sm" variant="outline" disabled={!!busy || running} onClick={() => { if (confirm('从现在重新累计预算统计？过去费用将不再计入新统计，调用历史和单价保留。')) void act('reset', () => state.resetStatistics(), '预算统计已从现在重新开始，历史调用和单价保持不变。'); }}><RefreshCw size={14} />重置预算统计</Button></div>
      {running && <p className="mt-2 text-xs text-muted-foreground">有请求正在执行，结束后可清空记录或重新开始统计。</p>}
    </div>
  </section>;
}
