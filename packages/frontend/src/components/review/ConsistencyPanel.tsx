import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Download, ExternalLink, ListChecks, Play, RotateCcw, ShieldAlert, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/authStore';
import { useNovelStore } from '@/stores/novelStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { createConsistencyWorkspace } from '@/stores/consistencyStore';
import { ModelService } from '@/services/modelService';
import { isModelConfigured } from '@/lib/modelConfig';
import { IS_DEMO } from '@/lib/runtime';
import { flushActiveEditor } from '@/lib/editorEvents';
import { openCharacterTimeline } from '@/lib/reviewNavigation';
import { buildConsistencyPlan, CONSISTENCY_CALL_LIMIT, consistencyFingerprint, consistencyModelKey, localConsistencyIssues, revalidateConsistencyIssue, runConsistencyCheck } from '@/lib/bookConsistency';
import type { ConsistencyBook, ConsistencyIssue, ConsistencyPlan } from '@/lib/bookConsistency';

const selectClass = 'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm';
const count = (value: number) => value.toLocaleString('zh-CN');
const date = (value: number) => new Date(value).toLocaleString('zh-CN', { hour12: false });
const categoryNames: Record<string, string> = { structure: '资料结构', name: '姓名与称谓', state: '人物状态', chapter: '章节', character: '人物', world: '世界观', outline: '大纲', foreshadow: '伏笔', foreshadowing: '伏笔', timeline: '时间线', relationship: '人物关系', continuity: '情节衔接', other: '其他' };
const severityNames = { error: '需处理', warning: '需留意', info: '提示' };
const severityStyles = { error: 'border-red-200 bg-red-50 text-red-800', warning: 'border-amber-200 bg-amber-50 text-amber-900', info: 'border-primary/20 bg-primary/5 text-primary' };
const dispositionNames = { open: '待复核', resolved: '已处理', ignored: '已忽略' };

type BookData = Pick<ReturnType<typeof useNovelStore.getState>, 'novels' | 'chapters' | 'characters' | 'worldSettings' | 'plotCards' | 'foreshadowings'>;
function bookFromData(novelId: string, data: BookData): ConsistencyBook | undefined {
  const novel = data.novels.find(value => value.id === novelId);
  if (!novel) return;
  return {
    novel,
    chapters: data.chapters.filter(value => value.novelId === novelId).sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id)),
    characters: data.characters.filter(value => value.novelId === novelId),
    worldSettings: data.worldSettings.filter(value => value.novelId === novelId),
    plotCards: data.plotCards.filter(value => value.novelId === novelId),
    foreshadowings: data.foreshadowings.filter(value => value.novelId === novelId),
  };
}

function SourceButton({ chapterId, book, disabled = false }: { chapterId: string; book: ConsistencyBook; disabled?: boolean }) {
  const chapter = book.chapters.find(value => value.id === chapterId);
  if (!chapter) return <span className="text-xs text-amber-800">关联章节已删除或不在本书</span>;
  return <Button variant="outline" size="sm" className="h-auto min-h-8 max-w-full justify-start whitespace-normal break-words text-left text-xs" disabled={disabled} onClick={() => {
    const latest = useNovelStore.getState();
    if (latest.currentNovelId !== book.novel.id || !latest.chapters.some(value => value.id === chapterId && value.novelId === book.novel.id)) return;
    flushActiveEditor(); latest.setCurrentChapter(chapterId); latest.setCurrentView('chapters');
  }}><ExternalLink className="mr-1 h-3 w-3 shrink-0" />查看章节：{chapter.title}</Button>;
}

function IssueCard({ issue, book, disposition, busy, change }: { issue: ConsistencyIssue; book: ConsistencyBook; disposition: 'open' | 'resolved' | 'ignored'; busy: boolean; change: (value: 'open' | 'resolved' | 'ignored') => void }) {
  return <article data-consistency-issue={issue.id} className="min-w-0 rounded-xl border bg-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full border px-2 py-1 ${severityStyles[issue.severity]}`}>{severityNames[issue.severity]}</span>
          <span className="rounded-full bg-muted px-2 py-1">{issue.origin === 'local' ? '本机规则' : 'AI 提示'}</span>
          <span className="rounded-full bg-muted px-2 py-1">{categoryNames[issue.category] || issue.category}</span>
          <span className="rounded-full bg-muted px-2 py-1">{dispositionNames[disposition]}</span>
        </div>
        <h4 className="break-words font-semibold">{issue.title}</h4>
      </div>
    </div>
    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{issue.detail}</p>
    {!!issue.characterIds.length && <div className="mt-3 flex flex-wrap gap-2">{issue.characterIds.map(id => book.characters.find(character => character.id === id)).filter(character => !!character).map(character => <Button key={character.id} variant="outline" size="sm" className="h-auto min-h-8 max-w-full whitespace-normal break-words text-left text-xs" onClick={() => {
      const latest = useNovelStore.getState();
      if (latest.currentNovelId === book.novel.id && latest.characters.some(value => value.id === character.id && value.novelId === book.novel.id)) openCharacterTimeline(book.novel.id, character.id);
    }}>查看人物时间线：{character.name}</Button>)}</div>}
    {issue.suggestion && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-sm leading-relaxed"><span className="font-medium">建议：</span>{issue.suggestion}</p>}
    {issue.origin === 'ai' && <p className={`mt-3 text-xs leading-relaxed ${issue.verified ? 'text-muted-foreground' : 'text-amber-800'}`}>{issue.verified ? '引文已在本次检查的原文中核验；矛盾判断仍需人工复核。' : '证据未完全核实，仅供人工排查。'}</p>}
    {!!issue.evidence.length && <details className="mt-3 rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">查看依据（{issue.evidence.length}）</summary>
      <div className="mt-3 space-y-3">{issue.evidence.map((evidence, index) => <div key={`${evidence.sourceId}-${index}`} className="min-w-0 text-sm">
        <p className="mb-1 text-xs text-muted-foreground">{categoryNames[evidence.sourceType] || evidence.sourceType} · {evidence.verified ? '来源已核验' : '来源待核实'}</p>
        <blockquote className="whitespace-pre-wrap break-words border-l-2 border-primary/30 pl-3 leading-relaxed">{evidence.quote}</blockquote>
        {evidence.chapterId && <div className="mt-2"><SourceButton chapterId={evidence.chapterId} book={book} /></div>}
      </div>)}</div>
    </details>}
    {!!issue.chapterIds.length && <div className="mt-3 flex flex-wrap gap-2">{[...new Set(issue.chapterIds)].map(id => <SourceButton key={id} chapterId={id} book={book} />)}</div>}
    <label className="mt-4 block text-xs text-muted-foreground">复核状态<select aria-label={`复核状态：${issue.title}`} className={`${selectClass} mt-1`} value={disposition} disabled={busy} onChange={event => change(event.target.value as 'open' | 'resolved' | 'ignored')}><option value="open">待复核</option><option value="resolved">已处理</option><option value="ignored">已忽略</option></select></label>
  </article>;
}

export function ConsistencyPanel({ novelId }: { novelId: string }) {
  const userId = useAuthStore(state => state.user?.id);
  const workspace = useMemo(() => createConsistencyWorkspace(IS_DEMO ? 'browser' : userId || 'local'), [userId]);
  const state = useStore(workspace);
  const novels = useNovelStore(value => value.novels);
  const chapters = useNovelStore(value => value.chapters);
  const characters = useNovelStore(value => value.characters);
  const worldSettings = useNovelStore(value => value.worldSettings);
  const plotCards = useNovelStore(value => value.plotCards);
  const foreshadowings = useNovelStore(value => value.foreshadowings);
  const settings = useSettingsStore();
  const book = useMemo(() => bookFromData(novelId, { novels, chapters, characters, worldSettings, plotCards, foreshadowings }), [novelId, novels, chapters, characters, worldSettings, plotCards, foreshadowings]);
  const fingerprint = useMemo(() => book ? consistencyFingerprint(book) : '', [book]);
  const report = state.reports[novelId];
  const run = report?.run;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [notice, setNotice] = useState('');
  const [budgetWarning, setBudgetWarning] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('open');
  const [origin, setOrigin] = useState('all');
  const [page, setPage] = useState(0);
  const [plan, setPlan] = useState<ConsistencyPlan>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resumePlanned, setResumePlanned] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [received, setReceived] = useState(0);
  const job = useRef<{ controller: AbortController; novelId: string } | null>(null);
  const mounted = useRef(true);
  const configured = isModelConfigured(settings);
  const modelKey = consistencyModelKey(settings);
  const localStale = !!report?.fingerprint && report.fingerprint !== fingerprint;
  const aiStale = !!run && run.fingerprint !== fingerprint;
  const canResume = !!run && run.status !== 'completed' && run.fingerprint === fingerprint && run.modelKey === modelKey;
  const aiIssues = useMemo(() => (run?.issues || []).map(issue => book ? revalidateConsistencyIssue(issue, book) : issue), [run?.issues, book]);
  const allIssues = useMemo(() => [...(report?.localIssues || []), ...aiIssues], [report?.localIssues, aiIssues]);
  const visible = useMemo(() => allIssues.filter(issue => (status === 'all' || (report?.dispositions[issue.id] || 'open') === status) && (origin === 'all' || issue.origin === origin) && `${issue.title} ${issue.detail} ${issue.category}`.toLowerCase().includes(query.trim().toLowerCase())), [allIssues, report?.dispositions, status, origin, query]);
  const pages = Math.max(1, Math.ceil(visible.length / 12));
  const currentPage = Math.min(page, pages - 1);
  const openCount = allIssues.filter(issue => !report?.dispositions[issue.id] || report.dispositions[issue.id] === 'open').length;

  useEffect(() => {
    mounted.current = true; setBusy(false);
    return () => { mounted.current = false; const active = job.current; job.current = null; active?.controller.abort(); };
  }, [novelId, workspace]);
  useEffect(() => { setPage(0); }, [query, status, origin, novelId]);
  useEffect(() => { setNotice(''); setBudgetWarning(''); setConfirmOpen(false); }, [novelId]);
  useEffect(() => {
    if (!busy) return;
    const at = Date.now(); setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - at) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  const attempt = async (action: () => Promise<void>, success?: string) => {
    setNotice('');
    try { await action(); if (mounted.current && success) setNotice(success); }
    catch (error) { if (mounted.current) setNotice(error instanceof Error ? error.message : '操作未完成，请重试。'); }
  };
  const localCheck = () => {
    if (!book || busy || !state.ready) return;
    flushActiveEditor();
    const latest = useNovelStore.getState();
    const snapshot = latest.currentNovelId === novelId ? bookFromData(novelId, latest) : undefined;
    if (!snapshot) return;
    void attempt(() => workspace.getState().saveLocal(novelId, consistencyFingerprint(snapshot), localConsistencyIssues(snapshot)), '本机结构检查已完成。它检查已保存的数据关系，不代表情节和设定已全部通过。');
  };
  const prepareAI = (resume: boolean) => {
    if (!book || busy) return;
    setNotice('');
    flushActiveEditor();
    const latest = useNovelStore.getState();
    const snapshot = latest.currentNovelId === novelId ? bookFromData(novelId, latest) : undefined;
    if (!snapshot) return;
    try { setPlan(buildConsistencyPlan(snapshot)); setResumePlanned(resume); setConfirmOpen(true); }
    catch (error) { setNotice(error instanceof Error ? error.message : '无法规划检查范围。'); }
  };
  const startAI = async () => {
    if (!book || !plan || job.current || !state.ready || !configured) return;
    flushActiveEditor();
    const latest = useNovelStore.getState();
    const snapshot = latest.currentNovelId === novelId ? bookFromData(novelId, latest) : undefined;
    if (!snapshot || plan.fingerprint !== consistencyFingerprint(snapshot)) { setConfirmOpen(false); setNotice('作品在确认期间有更新，请重新预览检查范围。'); return; }
    const controller = new AbortController();
    const request = { controller, novelId }; job.current = request;
    let lastPartial = '';
    setBusy(true); setConfirmOpen(false); setNotice(''); setBudgetWarning(''); setReceived(0); setProgress('正在准备检查');
    try {
      await runConsistencyCheck({
        book: snapshot, plan, run: resumePlanned && canResume ? run : undefined, modelKey, signal: controller.signal,
        generate: async messages => {
          lastPartial = '';
          setReceived(0);
          return new ModelService(settings).generate({ messages, signal: controller.signal, usageContext: { operation: '全书检查', novelId },
            onBudgetWarning: warning => { if (mounted.current && job.current === request) setBudgetWarning(warning); },
            onStream: text => { lastPartial = text; if (mounted.current && job.current === request) setReceived(text.length); },
          });
        },
        partialText: () => lastPartial,
        save: next => workspace.getState().saveRun(novelId, next),
        progress: text => { if (mounted.current && job.current === request) setProgress(text); },
      });
      if (mounted.current && job.current === request) setNotice('AI 检查已完成。请逐条核对证据；没有提示也不代表全书没有矛盾。');
    } catch (error) {
      if (mounted.current && job.current === request) setNotice(controller.signal.aborted ? '检查已停止，已完成的批次保留，可在同一作品版本上主动继续。' : error instanceof Error ? error.message : '检查未完成，已完成的批次保留。');
    } finally {
      if (job.current === request) { job.current = null; if (mounted.current) setBusy(false); }
    }
  };
  const exportReport = () => {
    if (!book || !report) return;
    const data = { version: 1, exportedAt: Date.now(), novelId, title: book.novel.title, fingerprint: report.fingerprint, checkedAt: report.checkedAt, localIssues: report.localIssues,
      ai: run ? { status: run.status, fingerprint: run.fingerprint, completedBatches: run.completedBatches, totalBatches: run.totalBatches, updatedAt: run.updatedAt, issues: aiIssues, limitations: run.limitations } : undefined,
      stale: { local: localStale, ai: aiStale },
      dispositions: report.dispositions, scope: '本浏览器保存的检查报告；AI 判断需人工复核' };
    const url = URL.createObjectURL(new Blob(['\uFEFF', JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${book.novel.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')}-一致性检查.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!book) return <p className="text-sm text-muted-foreground">当前作品已不存在，请从书架选择作品。</p>;

  return <section aria-label="全书一致性检查" className="mx-auto min-w-0 max-w-4xl space-y-5">
    <div><h3 className="text-xl font-semibold">全书一致性检查</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">先检查章节、人物关系、伏笔和大纲的结构，再按需调用 AI 复核情节与设定。所有结论均供复核，修改由你决定。</p><p className="mt-1 text-xs text-muted-foreground">本书 {count(book.chapters.length)} 章 · {count(book.characters.length)} 位人物 · {count(book.worldSettings.length)} 条世界观。报告和批次进度保存在当前浏览器。</p></div>
    {!state.ready && <p role="status" className="rounded-lg border p-3 text-sm">正在读取本机检查报告…</p>}
    {state.error && <div role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-800"><p>{state.error}</p>{state.unreadable ? <Button size="sm" variant="outline" className="mt-3" disabled={busy || state.saving} onClick={() => { if (confirm('清空本浏览器当前账号下无法读取的全部一致性检查报告与续查缓存？此操作不可撤销。')) void attempt(workspace.getState().resetUnreadable, '无法读取的检查报告已清空，可以重新检查。'); }}>清空无法读取的检查报告</Button> : <Button size="sm" variant="outline" className="mt-3" disabled={busy || state.saving} onClick={() => void attempt(workspace.getState().retrySave, '检查报告已重新保存。')}>重试保存检查报告</Button>}</div>}
    {notice && <p role="status" className="whitespace-pre-wrap break-words rounded-lg border bg-primary/5 p-3 text-sm leading-relaxed">{notice}</p>}
    {budgetWarning && <p role="alert" className="break-words rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">{budgetWarning}</p>}

    <div className="flex flex-wrap gap-2">
      <Button disabled={!state.ready || busy || state.saving} onClick={localCheck}><ListChecks className="mr-2 h-4 w-4" />本机结构检查</Button>
      <Button variant="outline" disabled={!state.ready || busy || !configured || !book.chapters.length} onClick={() => prepareAI(false)}><Play className="mr-2 h-4 w-4" />AI 全书检查</Button>
      {canResume && <Button variant="outline" disabled={!state.ready || busy || !configured} onClick={() => prepareAI(true)}><RotateCcw className="mr-2 h-4 w-4" />继续未完成检查</Button>}
      {busy && <Button variant="outline" onClick={() => job.current?.controller.abort()}><Square className="mr-2 h-4 w-4" />停止检查</Button>}
    </div>
    {!configured && <p className="text-xs leading-relaxed text-muted-foreground">本机结构检查无需配置模型。使用 AI 前，请在<button type="button" className="mx-1 underline underline-offset-2" onClick={() => { flushActiveEditor(); useNovelStore.getState().setCurrentView('settings'); }}>设置</button>中配置并保存模型。</p>}
    <p className="text-xs leading-relaxed text-muted-foreground">AI 检查会将本书正文与相关设定分批发送给当前配置的模型，可能产生多次费用，并使用“调用与预算”的提醒或拦截设置。</p>
    {busy && <div role="status" className="rounded-xl border bg-primary/5 p-4 text-sm"><p className="font-medium">{progress}</p><p className="mt-2 text-xs text-muted-foreground">已等待 {elapsed} 秒 · 本次响应已收到 {count(received)} 字符</p></div>}

    {(localStale || aiStale) && <div role="alert" className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><p>{localStale && '本机结构报告'}{localStale && aiStale && '、'}{aiStale && 'AI 报告'}来自旧稿。请重新检查当前版本，旧记录仍可查看。</p></div>}
    {run && <div data-consistency-coverage className="rounded-xl border bg-card p-4">
      <h4 className="text-sm font-semibold">AI 覆盖进度</h4><p className="mt-2 text-sm">{run.status === 'completed' ? '检查已完成，结果待复核' : run.status === 'running' && busy ? '正在检查' : '检查未完成，可查看已完成批次'} · {run.completedBatches} / {run.totalBatches} 批次</p>
      <p className="mt-2 text-xs text-muted-foreground">更新时间 {date(run.updatedAt)}。只有全部规划批次完成才标为完成；分批检查不能保证发现所有跨章矛盾。</p>
      {!!run.limitations.length && <details className="mt-3 rounded-lg border p-3"><summary className="cursor-pointer text-sm">检查范围与局限</summary><ul className="mt-2 list-disc space-y-2 pl-5 text-xs leading-relaxed text-muted-foreground">{run.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></details>}
      {run.lastAttempt && <details className="mt-3 rounded-lg border p-3"><summary className="cursor-pointer text-sm">查看上次未完成结果</summary><p className="mt-2 break-words text-xs text-muted-foreground">{run.lastAttempt.error}</p>{run.lastAttempt.text && <textarea aria-label="上次未完成的检查文字" readOnly value={run.lastAttempt.text} className="mt-3 min-h-32 w-full min-w-0 rounded-lg border bg-background p-3 text-sm" />}</details>}
    </div>}

    <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-semibold">检查结果</h4><p className="mt-1 text-xs text-muted-foreground">{allIssues.length} 条提示 · {openCount} 条待复核{report ? ` · 记录时间 ${date(report.checkedAt)}` : ''}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!report || busy} onClick={exportReport}><Download className="mr-1 h-4 w-4" />导出检查报告</Button><Button size="sm" variant="ghost" disabled={!report || busy || state.saving} onClick={() => { if (confirm('清空本书检查报告和续查缓存？此操作不可撤销。')) void attempt(() => workspace.getState().clearReport(novelId), '本书检查报告已清空。'); }}><Trash2 className="mr-1 h-4 w-4" />清空报告</Button></div></div>
    <div className="grid min-w-0 gap-3 sm:grid-cols-3"><label className="block text-sm">复核状态<select aria-label="筛选复核状态" className={`${selectClass} mt-1`} value={status} onChange={event => setStatus(event.target.value)}><option value="open">待复核</option><option value="all">全部状态</option><option value="resolved">已处理</option><option value="ignored">已忽略</option></select></label><label className="block text-sm">提示来源<select aria-label="筛选提示来源" className={`${selectClass} mt-1`} value={origin} onChange={event => setOrigin(event.target.value)}><option value="all">全部来源</option><option value="local">本机规则</option><option value="ai">AI 提示</option></select></label><label className="block text-sm">搜索提示<Input aria-label="搜索检查提示" className="mt-1 h-10" placeholder="人物、章节或问题" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
    {!report ? <p className="rounded-xl border border-dashed p-5 text-sm leading-relaxed text-muted-foreground">还没有检查报告。先运行本机结构检查，或配置模型后预览 AI 全书检查范围。</p> : !visible.length ? <p className="rounded-xl border border-dashed p-5 text-sm leading-relaxed text-muted-foreground">{allIssues.length ? '当前筛选下没有提示。' : '当前检查未发现提示。这不代表全书没有设定或情节矛盾。'}</p> : <div className="space-y-3">{visible.slice(currentPage * 12, currentPage * 12 + 12).map(issue => <IssueCard key={issue.id} issue={issue} book={book} disposition={report.dispositions[issue.id] || 'open'} busy={state.saving} change={value => void attempt(() => workspace.getState().setDisposition(novelId, issue.id, value))} />)}</div>}
    {pages > 1 && <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{currentPage + 1} / {pages} 页 · {visible.length} 条</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</Button><Button size="sm" variant="outline" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>下一页</Button></div></div>}

    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl p-4 sm:max-w-xl sm:p-6">
        <DialogHeader><DialogTitle>{resumePlanned ? '继续 AI 全书检查' : '确认 AI 全书检查范围'}</DialogTitle><DialogDescription>请确认本次发送范围与预计调用次数。</DialogDescription></DialogHeader>
        {plan && <div className="space-y-3 text-sm leading-relaxed">
          <p>作品《{book.novel.title}》共 {book.chapters.length} 章，检查计划覆盖正文 {count(plan.totalCharacters)} 字符、相关设定 {count(plan.referenceCharacters)} 字符。</p>
          <p>完整读取正文与设定至少需要 {plan.batches.length} 批调用；还会根据提取的有效事实追加跨批比对。本次运行最多发起 {CONSISTENCY_CALL_LIMIT} 次请求，达到上限后保留进度，须主动继续。</p>
          {resumePlanned && run && <p>同版本已完成 {run.completedBatches} 批会复用缓存，从未完成处继续。</p>}
          <p>当前模型：<span className="break-all">{settings.model}</span>。请求使用当前单价与预算配置；每次调用分别计入记录。</p>
          {plan.limitations.length > 0 && <ul className="list-disc space-y-1 pl-5">{plan.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>}
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">AI 只生成检查建议，不直接改稿。离开此页或停止时保留已完成批次，后续须主动继续。</p>
        </div>}
        <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setConfirmOpen(false)}>返回</Button><Button disabled={!configured || busy || !state.ready || !plan} onClick={() => void startAI()}>{resumePlanned ? '确认继续 AI 检查' : '确认开始 AI 检查'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
