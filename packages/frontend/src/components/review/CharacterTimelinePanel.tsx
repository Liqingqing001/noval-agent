import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { CharacterPortrait } from '@/components/characters/CharacterPortrait';
import { useNovelStore } from '@/stores/novelStore';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { getTimelineStore } from '@/stores/timelineStore';
import { emptyTimelineDraft, orderTimelineEntries, parseTimelineSuggestions, TIMELINE_LABELS, TIMELINE_TEXT_FIELDS, timelineEvidence, timelineExtractionPrompt, timelineFingerprint, validateTimelineDraft } from '@/lib/characterTimeline';
import { isModelConfigured } from '@/lib/modelConfig';
import { reviewVisibleText } from '@/lib/reviewText';
import { IS_DEMO, storageKey } from '@/lib/runtime';
import { OPEN_REVIEW_EVENT } from '@/lib/reviewNavigation';
import { flushActiveEditor } from '@/lib/editorEvents';
import { ModelService } from '@/services/modelService';
import type { TimelineDraft, TimelineEntry } from '@/types/timeline';

const control = 'w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-sm';
const evidenceLabels = { 'missing-chapter': '原章节已移除，请核对引用', 'missing-character': '人物已移除，请核对引用', changed: '正文已变化，状态待复核', quoted: '原文引用匹配', unquoted: '手工记录，未附原文' };
const dateTime = (time: number) => new Date(time).toLocaleString('zh-CN', { hour12: false });

function StateFields({ draft }: { draft: TimelineDraft }) {
  return <dl className="grid gap-2 text-sm sm:grid-cols-2">{TIMELINE_TEXT_FIELDS.filter(field => field !== 'quote' && draft[field]).map(field => <div className="min-w-0" key={field}><dt className="text-xs text-muted-foreground">{TIMELINE_LABELS[field]}</dt><dd className="whitespace-pre-wrap break-words leading-relaxed">{draft[field]}</dd></div>)}</dl>;
}

export function CharacterTimelinePanel({ novelId }: { novelId: string }) {
  const userId = useAuthStore(state => state.user?.id);
  const namespace = IS_DEMO ? 'browser' : userId || 'local';
  const workspace = useMemo(() => getTimelineStore(namespace), [namespace]);
  const timeline = useStore(workspace);
  const allChapters = useNovelStore(state => state.chapters);
  const allCharacters = useNovelStore(state => state.characters);
  const currentChapterId = useNovelStore(state => state.currentChapterId);
  const chapters = useMemo(() => allChapters.filter(chapter => chapter.novelId === novelId).sort((left, right) => left.sequence - right.sequence), [allChapters, novelId]);
  const characters = useMemo(() => allCharacters.filter(character => character.novelId === novelId), [allCharacters, novelId]);
  const [characterId, setCharacterId] = useState('');
  const [chapterId, setChapterId] = useState(currentChapterId || '');
  const [editing, setEditing] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState(emptyTimelineDraft);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiRaw, setAiRaw] = useState('');
  const [suggestions, setSuggestions] = useState<{ chapterId: string; fingerprint: string; characterId: string; rows: TimelineDraft[] }>();
  const [warning, setWarning] = useState('');
  const job = useRef<AbortController | null>(null);
  const lastCall = useRef<string | undefined>(undefined);
  const lastRequestKey = useRef('');
  const character = characters.find(item => item.id === characterId) || (!characterId ? characters[0] : undefined);
  const selectedCharacterId = character?.id || characterId;
  const chapter = chapterId ? chapters.find(item => item.id === chapterId) : chapters[0];
  const entries = useMemo(() => orderTimelineEntries(timeline.entries.filter(entry => entry.novelId === novelId && entry.characterId === selectedCharacterId), chapters), [timeline.entries, novelId, selectedCharacterId, chapters]);
  const orphanIds = [...new Set(timeline.entries.filter(entry => entry.novelId === novelId && !characters.some(item => item.id === entry.characterId)).map(entry => entry.characterId))];

  useEffect(() => { setCharacterId(''); setChapterId(''); setFormOpen(false); setBusy(false); setEditing(null); setNotice(''); setWarning(''); setAiRaw(''); setSuggestions(undefined); lastCall.current = undefined; return () => { job.current?.abort(); job.current = null; }; }, [novelId, workspace]);
  useEffect(() => {
    const focus = () => {
      try {
        const key = storageKey('novel-agent-timeline-focus'), raw = sessionStorage.getItem(key);
        if (!raw) return;
        sessionStorage.removeItem(key);
        const value = JSON.parse(raw);
        if (value?.novelId === novelId && typeof value.characterId === 'string' && useNovelStore.getState().characters.some(item => item.id === value.characterId && item.novelId === novelId)) { setCharacterId(value.characterId); setFormOpen(false); }
      } catch { /* Invalid navigation hints never become timeline data. */ }
    };
    focus(); window.addEventListener(OPEN_REVIEW_EVENT, focus);
    return () => window.removeEventListener(OPEN_REVIEW_EVENT, focus);
  }, [novelId, workspace]);
  useEffect(() => () => { job.current?.abort(); job.current = null; }, []);

  const safely = (action: () => void) => { try { action(); } catch (error) { setNotice(error instanceof Error ? error.message : '操作失败，请重试。'); } };
  const openDraft = (entry?: TimelineEntry) => {
    setNotice(''); setEditing(entry?.id || null); setDraft(entry ? { ...entry } : emptyTimelineDraft());
    setChapterId(entry?.chapterId || chapter?.id || ''); setFormOpen(true);
  };
  const save = () => safely(() => {
    if (useNovelStore.getState().currentNovelId !== novelId || !character || !chapter || chapter.novelId !== novelId) throw new Error('请先选择当前作品的人物和有效章节。');
    const value = validateTimelineDraft(draft);
    if (value.quote && !reviewVisibleText(chapter.content).includes(value.quote)) throw new Error('原文依据必须逐字存在于所选章节中；请核对或留空，不能将改写句子当作原文。');
    const previous = timeline.entries.find(entry => entry.id === editing && entry.novelId === novelId && entry.characterId === character.id);
    if (editing && !previous) throw new Error('待编辑记录已不存在，请重新打开。');
    const now = Date.now();
    workspace.getState().save({ ...value, id: previous?.id || crypto.randomUUID(), novelId, characterId: character.id, chapterId: chapter.id, sourceFingerprint: timelineFingerprint(chapter.content), origin: 'manual', createdAt: previous?.createdAt || now, updatedAt: now });
    setFormOpen(false); setEditing(null); setNotice('状态记录已保存。');
  });
  const extract = async () => {
    if (job.current || useNovelStore.getState().currentNovelId !== novelId || !character || !chapter) return;
    const settings = useSettingsStore.getState();
    if (!isModelConfigured(settings)) { setNotice('请先在设置中配置并启用模型；也可以直接手工记录。'); return; }
    let prompt: string;
    try { prompt = timelineExtractionPrompt(character, chapter); } catch (error) { setNotice((error as Error).message); return; }
    if (!confirm(`将把《${chapter.title}》完整正文（${reviewVisibleText(chapter.content).length.toLocaleString()} 字符）及人物姓名发送给当前模型，提取 ${character.name} 的状态。仅调用本章，可能产生费用；结果须逐条确认后保存。继续？`)) return;
    const requestKey = timelineFingerprint(JSON.stringify({ characterId: character.id, characterIdentity: [character.name, character.aliases], chapterId: chapter.id, source: timelineFingerprint(chapter.content), provider: settings.apiProvider, protocol: settings.protocol, model: settings.model, baseUrl: settings.baseUrl, maxTokens: settings.maxTokens, temperature: settings.temperature, extraBody: settings.extraBody }));
    if (lastRequestKey.current !== requestKey) lastCall.current = undefined;
    lastRequestKey.current = requestKey;
    const controller = new AbortController(); job.current = controller;
    const snapshotChapter = chapter, snapshotCharacter = character;
    setBusy(true); setNotice(''); setWarning(''); setAiRaw(''); setSuggestions(undefined);
    try {
      const result = await new ModelService(settings).generate({ messages: [{ role: 'user', content: prompt }], signal: controller.signal,
        usageContext: { operation: '人物时间线', novelId, retryOf: lastCall.current },
        onCallId: id => { lastCall.current = id; }, onBudgetWarning: text => { if (job.current === controller) setWarning(text); },
        onStream: text => { if (job.current === controller) setAiRaw(text.slice(0, 100000)); },
      });
      if (job.current !== controller || controller.signal.aborted) return;
      setAiRaw(result.slice(0, 100000));
      const parsed = parseTimelineSuggestions(result, snapshotChapter);
      setSuggestions({ chapterId: snapshotChapter.id, characterId: snapshotCharacter.id, fingerprint: timelineFingerprint(snapshotChapter.content), rows: parsed.suggestions });
      setNotice(`收到 ${parsed.suggestions.length} 条有原文依据的待确认状态。${parsed.rejected ? `另有 ${parsed.rejected} 条格式或引用不符，未采纳。` : ''}${!parsed.suggestions.length ? '可能未发现本章明确状态；这不代表人物在全书没有变化。' : ''}`);
      lastCall.current = undefined;
    } catch (error) { if (job.current === controller) setNotice(controller.signal.aborted ? '已停止提取；收到的文字仍保留，未写入时间线。' : error instanceof Error ? error.message : '提取失败，收到的文字仍保留。'); }
    finally { if (job.current === controller) { job.current = null; setBusy(false); } }
  };
  const accept = (index: number) => safely(() => {
    if (!suggestions || useNovelStore.getState().currentNovelId !== novelId) return;
    const sourceChapter = chapters.find(item => item.id === suggestions.chapterId), sourceCharacter = characters.find(item => item.id === suggestions.characterId), value = suggestions.rows[index];
    if (!sourceChapter || !sourceCharacter || !value || timelineFingerprint(sourceChapter.content) !== suggestions.fingerprint || !reviewVisibleText(sourceChapter.content).includes(value.quote)) throw new Error('原人物或章节已变化，请重新提取或核对后手工记录。');
    const now = Date.now();
    workspace.getState().save({ ...value, id: crypto.randomUUID(), novelId, chapterId: sourceChapter.id, characterId: sourceCharacter.id, sourceFingerprint: suggestions.fingerprint, origin: 'ai-reviewed', createdAt: now, updatedAt: now });
    setSuggestions({ ...suggestions, rows: suggestions.rows.filter((_, item) => item !== index) }); setNotice('已确认这条状态，保存到人物时间线。');
  });
  const exportTimeline = () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF', JSON.stringify({ version: 1, novelId, exportedAt: Date.now(), entries: timeline.entries.filter(entry => entry.novelId === novelId) }, null, 2)], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'NovelAgent-人物状态时间线.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section aria-label="人物状态时间线" className="min-w-0 space-y-4">
    <div><h3 className="text-xl font-semibold">人物状态时间线</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">按章节顺序追踪一个人物的地点、身体、情绪和已知信息。手工记录与经确认的 AI 建议分别标记；状态推断仍需你核对。</p><p className="mt-1 text-xs text-muted-foreground">保存在当前浏览器与当前账号；调整章节顺序会重排时间线，正文变化后提示复核。最多 1,000 条记录，可导出备份。</p></div>
    {timeline.error && <div role="alert" className="rounded-xl border border-amber-300 p-3 text-sm"><p>{timeline.error}</p>{!timeline.unreadable && <Button className="mt-2" variant="outline" size="sm" onClick={() => safely(timeline.retrySave)}>检查已有记录保存</Button>}</div>}
    {notice && <p role="status" className="rounded-xl border bg-primary/5 p-3 text-sm leading-relaxed break-words">{notice}</p>}
    {warning && <p role="status" className="rounded-xl border border-amber-300 p-3 text-sm leading-relaxed">{warning}</p>}
    <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm">人物<select aria-label="时间线人物" className={`${control} mt-1`} value={selectedCharacterId} disabled={busy} onChange={event => { setCharacterId(event.target.value); setFormOpen(false); setSuggestions(undefined); lastCall.current = undefined; }}><option value="" disabled>选择人物</option>{characters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}{orphanIds.map(id => <option key={id} value={id}>已移除人物（{id.slice(0, 8)}）</option>)}</select></label><Button variant="outline" onClick={exportTimeline}>导出时间线</Button></div>
    {character && <div className="flex items-center gap-3 rounded-xl border p-3"><CharacterPortrait avatar={character.avatar} name={character.name} previewable className="!h-12 !w-12 shrink-0" /><div className="min-w-0"><p className="font-semibold break-words">{character.name}</p><p className="text-xs text-muted-foreground">{entries.length} 条状态记录 · 按当前章节顺序</p></div></div>}
    {!characters.length && !orphanIds.length && <p className="rounded-xl border p-4 text-sm text-muted-foreground">请先在人物页添加人物，再记录状态变化。</p>}
    <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><label className="min-w-0 text-sm">章节<select aria-label="状态所属章节" className={`${control} mt-1`} value={chapterId || chapter?.id || ''} disabled={busy} onChange={event => { setChapterId(event.target.value); lastCall.current = undefined; }}>{!chapters.length && <option value="">暂无章节</option>}{chapterId && !chapter && <option value={chapterId}>原章节已移除，请重新选择</option>}{chapters.map(item => <option key={item.id} value={item.id}>第 {item.sequence} 章 · {item.title}</option>)}</select></label><div className="flex flex-wrap items-end gap-2"><Button disabled={!character || !chapter || busy || timeline.unreadable} onClick={() => openDraft()}>添加状态记录</Button><Button variant="outline" disabled={!character || !chapter || busy || timeline.unreadable} onClick={() => void extract()}>AI 提取本章状态</Button></div></div>
    {busy && <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm"><span>正在提取本章状态，结果待你确认…</span><Button variant="outline" size="sm" onClick={() => job.current?.abort()}>停止提取</Button></div>}
    {formOpen && <form aria-label="人物状态记录编辑" className="space-y-3 rounded-xl border bg-card p-4" onSubmit={event => { event.preventDefault(); save(); }}><h4 className="font-medium">{editing ? '编辑状态记录' : '添加状态记录'}</h4><p className="text-xs text-muted-foreground">所属章节使用上方选择。原文依据可留空；填写时必须逐字匹配。保存会将记录标为基于当前正文版本。</p><div className="grid gap-3 sm:grid-cols-2">{TIMELINE_TEXT_FIELDS.map(field => <label key={field} className={`min-w-0 text-sm ${field === 'note' || field === 'quote' ? 'sm:col-span-2' : ''}`}>{TIMELINE_LABELS[field]}<textarea aria-label={TIMELINE_LABELS[field]} className={`${control} mt-1 min-h-20`} maxLength={field === 'quote' ? 500 : 1000} value={draft[field]} onChange={event => setDraft(previous => ({ ...previous, [field]: event.target.value }))} /></label>)}</div><div className="flex flex-wrap gap-2"><Button type="submit">保存状态记录</Button><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>取消编辑</Button></div></form>}
    {suggestions && <div className="space-y-3 rounded-xl border border-amber-200 p-3"><h4 className="font-medium">AI 待确认建议</h4><p className="text-xs leading-relaxed text-muted-foreground">引用匹配仅说明文字出现在原文，不代表状态解释正确；核对人物、时间、回忆或假设后再采纳。</p>{suggestions.rows.map((value, index) => <article key={`${suggestions.chapterId}-${index}`} className="space-y-3 rounded-lg border bg-card p-3"><StateFields draft={value} /><blockquote className="whitespace-pre-wrap break-words border-l-2 pl-3 text-sm">{value.quote}</blockquote><Button size="sm" onClick={() => accept(index)}>采纳这条状态</Button></article>)}{!suggestions.rows.length && <p className="text-sm text-muted-foreground">没有待确认的建议。</p>}</div>}
    {aiRaw && <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm">查看本次提取原始结果</summary><textarea aria-label="人物提取原始结果" readOnly value={aiRaw} className={`${control} mt-3 min-h-40`} /><p className="mt-2 text-xs text-muted-foreground">此处结果尚未保存到时间线；离开页面前可复制需要保留的部分。</p></details>}
    <div className="space-y-3" aria-label="人物状态记录列表">{entries.map(entry => {
      const linkedChapter = chapters.find(item => item.id === entry.chapterId), evidence = timelineEvidence(entry, chapters, characters);
      return <article key={entry.id} className="min-w-0 space-y-3 rounded-xl border bg-card p-4" data-timeline-entry={entry.id}><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h4 className="font-medium break-words">{linkedChapter ? `第 ${linkedChapter.sequence} 章 · ${linkedChapter.title}` : '已移除的章节'}</h4><p className="mt-1 text-xs text-muted-foreground">{entry.origin === 'ai-reviewed' ? 'AI 建议 · 已手动确认' : '手工记录'} · {dateTime(entry.updatedAt)}</p></div><span className={`rounded-full px-2 py-1 text-xs ${['quoted', 'unquoted'].includes(evidence) ? 'bg-primary/10 text-primary' : 'bg-amber-50 text-amber-900'}`}>{evidenceLabels[evidence]}</span></div><StateFields draft={entry} />{entry.quote && <blockquote className="whitespace-pre-wrap break-words border-l-2 pl-3 text-sm text-muted-foreground">{entry.quote}</blockquote>}<div className="flex flex-wrap gap-2">{linkedChapter && <Button variant="outline" size="sm" onClick={() => { flushActiveEditor(); useNovelStore.getState().setCurrentChapter(linkedChapter.id); useNovelStore.getState().setCurrentView('chapters'); }}>查看原章节</Button>}<Button variant="outline" size="sm" aria-label={`编辑状态记录：${linkedChapter?.title || '已移除章节'}`} disabled={!character || busy} onClick={() => openDraft(entry)}>编辑</Button><Button variant="ghost" size="sm" aria-label={`删除状态记录：${linkedChapter?.title || '已移除章节'}`} onClick={() => { if (confirm('删除这条人物状态记录？原章节和人物资料不会删除。')) safely(() => workspace.getState().remove(entry.id, novelId)); }}>删除</Button></div></article>;
    })}{!entries.length && (character || selectedCharacterId) && <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">此人物还没有状态记录。可手工添加，或选择一章让 AI 提取待确认建议。</p>}</div>
  </section>;
}
