import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { Download, History, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNovelStore } from '@/stores/novelStore';
import { useAuthStore } from '@/stores/authStore';
import { getChapterHistoryStore, chapterHistoryNamespace } from '@/stores/chapterHistoryStore';
import { remapTimelineChapter } from '@/stores/timelineStore';
import { chapterHistoryDiff, chapterHistoryText, chapterVersionFingerprint, CHAPTER_HISTORY_LIMIT } from '@/lib/chapterHistory';
import { flushActiveEditor } from '@/lib/editorEvents';
import type { ChapterVersion, ChapterVersionKind } from '@/lib/chapterHistory';

const kindNames: Record<ChapterVersionKind, string> = { automatic: '自动版本', manual: '手动保存', 'before-restore': '恢复前备份', 'before-delete': '删除前备份' };
const dateTime = (at: number) => new Date(at).toLocaleString('zh-CN', { hour12: false });
const control = 'h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm';

export function VersionHistoryPanel({ novelId }: { novelId: string }) {
  const userId = useAuthStore(state => state.user?.id);
  const history = useMemo(() => getChapterHistoryStore(chapterHistoryNamespace()), [userId]);
  const state = useStore(history);
  const allChapters = useNovelStore(value => value.chapters);
  const currentChapterId = useNovelStore(value => value.currentChapterId);
  const chapters = useMemo(() => allChapters.filter(row => row.novelId === novelId).sort((a, b) => a.sequence - b.sequence), [allChapters, novelId]);
  const versions = useMemo(() => state.versions.filter(row => row.novelId === novelId).sort((a, b) => b.savedAt - a.savedAt), [state.versions, novelId]);
  const [chapterId, setChapterId] = useState(currentChapterId || '');
  const [versionId, setVersionId] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const historicalChapters = useMemo(() => {
    const entries = new Map(chapters.map(chapter => [chapter.id, { id: chapter.id, title: chapter.title, sequence: chapter.sequence, deleted: false }]));
    for (const version of versions) if (!entries.has(version.chapterId)) entries.set(version.chapterId, { id: version.chapterId, title: version.title, sequence: version.sequence, deleted: true });
    return [...entries.values()].sort((a, b) => a.sequence - b.sequence || a.title.localeCompare(b.title));
  }, [chapters, versions]);
  const selected = versions.find(row => row.id === versionId);
  const current = chapters.find(row => row.id === chapterId);
  const visible = versions.filter(row => row.chapterId === chapterId);
  const diff = selected && current ? chapterHistoryDiff(selected.content, current.content) : undefined;

  useEffect(() => {
    if (selected && selected.chapterId !== chapterId) { setChapterId(selected.chapterId); return; }
    if (!historicalChapters.some(row => row.id === chapterId)) setChapterId(historicalChapters.find(row => row.id === currentChapterId)?.id || historicalChapters[0]?.id || '');
  }, [historicalChapters, currentChapterId, chapterId, selected]);
  useEffect(() => { setNotice(''); setVersionId(''); setLabel(''); }, [novelId]);

  const act = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setNotice('');
    try { await action(); }
    catch (error) { setNotice(error instanceof Error ? error.message : '本次操作未完成，请重试。'); }
    finally { setBusy(false); }
  };
  const saveCurrent = () => void act(async () => {
    flushActiveEditor();
    const latest = useNovelStore.getState().chapters.find(row => row.id === chapterId && row.novelId === novelId);
    if (!latest) throw new Error('当前章节已经不存在，无法保存新版本。');
    await history.getState().capture(latest, 'manual', label || '手动检查点');
    setLabel(''); setNotice('当前章节版本已保存。');
  });
  const restore = (version: ChapterVersion) => void act(async () => {
    if (history !== getChapterHistoryStore() || useNovelStore.getState().currentNovelId !== novelId || version.novelId !== novelId) throw new Error('账号或作品已切换，请在当前作品重新选择版本。');
    flushActiveEditor();
    const latest = useNovelStore.getState().chapters.find(row => row.id === version.chapterId && row.novelId === novelId);
    if (!window.confirm(latest ? '恢复这个版本？恢复前会先保存当前章节，可再次找回。' : '原章节已删除。将此版本恢复为当前作品的一篇新章节？')) return;
    const expected = latest ? chapterVersionFingerprint(latest) : '';
    if (latest) await history.getState().capture(latest, 'before-restore', '恢复前的当前章节');
    else await history.getState().flush();
    const now = useNovelStore.getState();
    if (history !== getChapterHistoryStore() || now.currentNovelId !== novelId || !now.novels.some(row => row.id === novelId)) throw new Error('账号或作品已切换或删除，本次没有恢复。');
    const unchanged = now.chapters.find(row => row.id === version.chapterId && row.novelId === novelId);
    if (latest && (!unchanged || chapterVersionFingerprint(unchanged) !== expected) || !latest && unchanged) throw new Error('等待保存期间章节已改变，请重新查看差异后恢复。');
    if (unchanged) {
      now.updateChapter(unchanged.id, { title: version.title, content: version.content, wordCount: version.wordCount });
      now.setCurrentChapter(unchanged.id);
      setChapterId(unchanged.id);
    } else {
      const sequence = Math.max(0, ...now.chapters.filter(row => row.novelId === novelId).map(row => row.sequence)) + 1;
      const added = now.addChapter({ novelId, title: version.title, content: version.content, wordCount: version.wordCount, sequence });
      now.setCurrentChapter(added.id);
      remapTimelineChapter(version.chapterId, added.id, novelId);
      await history.getState().remapChapter(novelId, version.chapterId, added.id);
      setChapterId(added.id);
    }
    setNotice('章节已恢复；恢复前的当前内容仍保留在历史中。');
  });
  const exportHistory = () => {
    const rows = history.getState().versions.filter(row => row.novelId === novelId);
    const data = { version: 1, exportedAt: Date.now(), novelId, scope: '当前浏览器章节版本历史', pending: history.getState().saving || !!history.getState().error, versions: rows };
    const url = URL.createObjectURL(new Blob(['\uFEFF', JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `NovelAgent-章节历史-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section aria-label="章节版本历史" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-lg font-semibold"><History className="h-5 w-5" />章节版本历史</h3>
      <Button variant="outline" size="sm" onClick={exportHistory}><Download className="mr-2 h-4 w-4" />导出章节历史</Button>
    </div>
    <p className="text-sm leading-relaxed text-muted-foreground">保存章节标题和正文。首次修改前保留一份，连续编辑在一分钟内合并为最近的修改前版本；AI 改稿和删除章节同样记录。每章最多 {CHAPTER_HISTORY_LIMIT} 份，优先清理旧自动版本。历史只在当前浏览器保存，正文仍沿用原来的保存方式。</p>
    {!state.ready && <p role="status" className="text-sm">正在读取章节版本库…</p>}
    {state.saving && <p role="status" className="text-sm text-amber-800">版本历史正在保存，请等待完成后关闭页面。</p>}
    {state.error && <div role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-800"><p>{state.error}</p><p className="mt-1">未保存的快照仍可从本页导出。重试不会覆盖无法读取的原资料。</p><Button variant="outline" size="sm" className="mt-2" disabled={busy} onClick={() => void act(async () => { await history.getState().retry(); setNotice('版本历史已重新保存。'); })}>重试保存历史</Button></div>}
    {notice && <p role="status" className="rounded-lg border bg-primary/5 p-3 text-sm leading-relaxed">{notice}</p>}
    <label className="block text-sm">选择章节<select aria-label="历史章节" className={`${control} mt-2`} value={chapterId} onChange={event => { setChapterId(event.target.value); setVersionId(''); }}><option value="" disabled>选择章节</option>{historicalChapters.map(row => <option key={row.id} value={row.id}>{row.title}{row.deleted ? '（已删除）' : ''}</option>)}</select></label>
    <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
      <label className="min-w-0 flex-1 text-sm">版本名称<Input aria-label="版本名称" className="mt-2" placeholder="例如：修改结局前" maxLength={100} value={label} onChange={event => setLabel(event.target.value)} /></label>
      <Button disabled={busy || !state.ready || !current || !!state.error} onClick={saveCurrent}><Save className="mr-2 h-4 w-4" />保存当前版本</Button>
    </div>
    {!visible.length ? <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">这个章节还没有版本历史。继续编辑会自动保留修改前的内容，也可以先保存一个手动检查点。</p> : <div className="space-y-2" aria-label="章节版本列表">{visible.map(version => <article key={version.id} data-history-version={version.id} className="min-w-0 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-medium">{version.label || (version.baseline ? '首次修改前' : kindNames[version.kind])}</p><p className="mt-1 text-xs text-muted-foreground">{dateTime(version.savedAt)} · {kindNames[version.kind]} · {version.wordCount.toLocaleString()} 字</p><p className="mt-1 break-words text-xs text-muted-foreground">标题：{version.title}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setVersionId(version.id)}>查看此版本</Button><Button variant="outline" size="sm" disabled={busy || state.saving || !!state.error} onClick={() => restore(version)}>{current ? '恢复此版本' : '恢复为新章节'}</Button></div></div>
    </article>)}</div>}
    {selected && <div aria-label="版本对比" className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">版本对比</h4><Button size="sm" variant="ghost" onClick={() => setVersionId('')}>关闭对比</Button></div>
      <p className="text-sm leading-relaxed text-muted-foreground">{selected.title === current?.title ? '标题相同。' : `历史标题：${selected.title}；当前标题：${current?.title || '章节已删除'}。`}{diff && ` 按可见文字逐行比较，新增 ${diff.added.length} 行、移除 ${diff.removed.length} 行；不计富文本格式变化。`}</p>
      {diff && (!!diff.added.length || !!diff.removed.length) && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">查看文字增删</summary><div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2"><div className="min-w-0"><p className="mb-2 text-xs text-red-800">移除的行（最多展示 30 行）</p><pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words text-xs text-red-800">{diff.removed.slice(0, 30).join('\n') || '无'}</pre></div><div className="min-w-0"><p className="mb-2 text-xs text-emerald-800">新增的行（最多展示 30 行）</p><pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words text-xs text-emerald-800">{diff.added.slice(0, 30).join('\n') || '无'}</pre></div></div></details>}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="min-w-0 text-sm">历史版本<textarea aria-label="历史版本正文" readOnly className="mt-2 h-64 w-full resize-y rounded-lg border bg-background p-3 text-sm leading-relaxed" value={chapterHistoryText(selected.content)} /></label><label className="min-w-0 text-sm">当前版本<textarea aria-label="当前版本正文" readOnly className="mt-2 h-64 w-full resize-y rounded-lg border bg-background p-3 text-sm leading-relaxed" value={current ? chapterHistoryText(current.content) : '章节已删除，可恢复为新章节。'} /></label></div>
    </div>}
  </section>;
}
