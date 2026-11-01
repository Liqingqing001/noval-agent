import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/authStore';
import { useNovelStore } from '@/stores/novelStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { createReferenceWorkspace } from '@/stores/referenceStore';
import { ModelService } from '@/services/modelService';
import { isModelConfigured } from '@/lib/modelConfig';
import { IS_DEMO } from '@/lib/runtime';
import { flushActiveEditor } from '@/lib/editorEvents';
import { createNovelExport, downloadExport } from '@/lib/novelExport';
import type { ExportFormat } from '@/lib/novelExport';
import { countReferenceCharacters, decodeReferenceFile, parseReferenceReport, parseReferenceSource, referenceAnalysisKey, referenceAnalysisMessages, referenceAnalysisReady, referenceBriefErrors, referenceContext, referenceCreationMessages, referenceDraftContext, referenceDraftWarnings, referenceExportData, referenceHash, referenceOverlap, referencePlainHtml } from '@/lib/referenceCreation';
import type { ReferenceProject } from '@/types/reference';

type Stage = 'analysis' | 'outline' | 'draft';
const control = 'w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm';
const stageNames = { analysis: '分析文章', outline: '生成新提纲', draft: '生成新稿' };

export function ReferenceWorkbench() {
  const userId = useAuthStore(state => state.user?.id);
  const workspace = useMemo(() => createReferenceWorkspace(IS_DEMO ? 'browser' : userId || 'local'), [userId]);
  const { projects, currentId, warning } = useStore(workspace);
  const project = projects.find(project => project.id === currentId);
  const parsed = useMemo(() => project ? parseReferenceSource(project.source) : null, [project?.source]);
  const settings = useSettingsStore();
  const configured = isModelConfigured(settings);
  const novels = useNovelStore(state => state.novels);
  const currentNovelId = useNovelStore(state => state.currentNovelId);
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceInput, setSourceInput] = useState('');
  const [tab, setTab] = useState<'source' | 'report' | 'style' | 'create'>('source');
  const [busy, setBusy] = useState<Stage | 'import' | 'export' | null>(null);
  const [notice, setNotice] = useState('');
  const [liveText, setLiveText] = useState('');
  const [unsavedResult, setUnsavedResult] = useState('');
  const [focusParagraph, setFocusParagraph] = useState('');
  const [exportKind, setExportKind] = useState<'draft' | 'report'>('draft');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('docx');
  const [importOpen, setImportOpen] = useState(false);
  const [targetNovelId, setTargetNovelId] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const mounted = useRef(true);
  const job = useRef<{ controller: AbortController; id: string; stage: Stage } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; job.current?.controller.abort(); }; }, [workspace]);
  useEffect(() => { if (tab === 'source' && focusParagraph) document.getElementById(`reference-${focusParagraph}`)?.scrollIntoView({ block: 'center' }); }, [tab, focusParagraph]);

  const safely = (action: () => void) => { try { action(); } catch (error) { setNotice(error instanceof Error ? error.message : '操作未保存，请重试。'); } };
  const update = (patch: Partial<ReferenceProject>) => { if (project) safely(() => workspace.getState().update(project.id, patch)); };
  const creative = (patch: Partial<ReferenceProject>) => update({ ...patch, confirmedContext: undefined });
  const saveSource = async () => {
    if (busy) return;
    setBusy('import'); setNotice('');
    try {
      const source = parseReferenceSource(sourceInput);
      const hash = await referenceHash(source.text);
      workspace.getState().add(sourceTitle, source.text, hash);
      setTab('source'); setNotice('参考文已保存在当前浏览器；相同内容会复用已有资料，没有调用模型。');
    } catch (error) { setNotice(error instanceof Error ? error.message : '导入失败'); }
    finally { setBusy(null); }
  };
  const readFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('文件不能超过 2 MiB，请先选择文章范围。');
      const decoded = decodeReferenceFile(new Uint8Array(await file.arrayBuffer()), file.name);
      setSourceInput(decoded.text); setSourceTitle(file.name.replace(/\.(txt|md|markdown)$/i, ''));
      setNotice(`按 ${decoded.encoding} 解码，请检查文字和分段后保存。`);
    } catch (error) { setNotice(error instanceof Error ? error.message : '文件读取失败'); }
  };
  const run = async (stage: Stage, force = false) => {
    if (!project || job.current || busy) return;
    if (!configured) { setNotice('请先在设置中配置模型并保存启用；本工作台使用同一份 API 配置。'); return; }
    const snapshot = structuredClone(project), controller = new AbortController();
    const request = { controller, id: snapshot.id, stage }; job.current = request;
    setBusy(stage); setLiveText(''); setUnsavedResult(''); setNotice('');
    let partial = '';
    try {
      const cacheKey = stage === 'analysis' ? await referenceAnalysisKey(snapshot, settings) : '';
      if (stage === 'analysis' && !force && snapshot.analysisKey === cacheKey && referenceAnalysisReady(snapshot.report)) {
        setTab('report'); setNotice('已复用这篇文章在相同模型与参数下的分析，没有新增调用。'); return;
      }
      if (stage !== 'analysis') {
        if (!referenceAnalysisReady(snapshot.report)) throw new Error('请先完成全部所选段落的分析，并至少核验一条原文依据。');
        const errors = referenceBriefErrors(snapshot.brief);
        if (errors.length) throw new Error(errors.join(' '));
        if (stage === 'draft' && (!snapshot.outline.trim() || snapshot.confirmedContext !== referenceContext(snapshot))) throw new Error('请先检查新提纲并勾选确认；修改主题或文风后需要重新确认。');
      }
      const content = await new ModelService(settings).generate({ signal: controller.signal,
        messages: stage === 'analysis' ? referenceAnalysisMessages(snapshot) : referenceCreationMessages(snapshot, stage),
        onStream: text => { partial = text.slice(0, 100000); if (text.length > 100000) controller.abort(); if (mounted.current && job.current === request) setLiveText(partial); },
      });
      if (controller.signal.aborted) throw new Error('请求已取消，返回文字仅作部分结果保留。');
      partial = content.slice(0, 100000);
      if (content.length > 100000) throw new Error('返回文字超过首版处理范围，已保留前 10 万字符供检查，未作为完整结果保存。');
      if (stage === 'analysis') {
        const report = parseReferenceReport(content, parseReferenceSource(snapshot.source).paragraphs);
        workspace.getState().update(snapshot.id, { report, style: report.style, methods: report.methods, analysisKey: cacheKey, analyzedModel: settings.model, confirmedContext: undefined, lastAttempt: undefined });
        setTab('report'); setExportKind('report');
        setNotice(referenceAnalysisReady(report) ? '分析已保存。引文位置已核对，模型解读仍需人工判断。' : '分析范围或引文核验不完整，已保留部分报告；请检查后重新分析，暂不用于自动创作。');
      } else if (stage === 'outline') {
        if (!content.trim() || content.length > 20000) throw new Error('提纲为空或过长，请检查模型输出后重试。');
        workspace.getState().update(snapshot.id, { outline: content.trim(), confirmedContext: undefined, lastAttempt: undefined });
        setTab('create'); setNotice('新提纲已保存，请编辑核对并确认后生成正文。');
      } else {
        const finished = /【新稿结束】\s*$/.test(content);
        const text = content.replace(/\n?【新稿结束】\s*$/, '').trim();
        workspace.getState().update(snapshot.id, { draft: { text, context: referenceDraftContext(snapshot), completedBy: finished ? 'model' : undefined, model: settings.model, createdAt: Date.now() }, lastAttempt: undefined });
        setTab('create'); setExportKind('draft'); setNotice('新稿已保存，请检查长度、占位内容和参考文重合提示。');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '请求未完成';
      try { workspace.getState().update(snapshot.id, { lastAttempt: { stage: stageNames[stage], text: partial, error: message, at: Date.now() } }); }
      catch { if (mounted.current) setUnsavedResult(partial); }
      if (mounted.current) setNotice(message);
    } finally {
      if (job.current === request) job.current = null;
      if (mounted.current) setBusy(null);
    }
  };
  const exportContent = async () => {
    if (!project || busy) return;
    setBusy('export');
    try {
      const result = await createNovelExport(referenceExportData(project, exportKind), exportFormat, 'novel');
      downloadExport(result.blob, result.filename);
      setNotice(exportKind === 'draft' && referenceDraftWarnings(project).length ? '已导出未验收草稿，请自行检查；没有导入或覆盖小说。' : '文件已生成，没有调用模型。');
    } catch (error) { setNotice(error instanceof Error ? error.message : '导出失败'); }
    finally { setBusy(null); }
  };
  const importDraft = async () => {
    if (!project?.draft || busy) return;
    setBusy('import');
    try {
      const errors = referenceDraftWarnings(project);
      if (errors.length) throw new Error(errors.join(' '));
      const target = useNovelStore.getState();
      if (!target.novels.some(novel => novel.id === targetNovelId)) throw new Error('目标作品不存在，请重新选择。');
      const title = chapterTitle.trim();
      if (!title) throw new Error('请填写新章节标题。');
      const content = referencePlainHtml(project.draft.text);
      const hash = await referenceHash(JSON.stringify([targetNovelId, title, project.draft.text]));
      const receipt = project.imports.find(item => item.hash === hash);
      if (receipt && target.chapters.some(chapter => chapter.id === receipt.chapterId && chapter.novelId === targetNovelId)) { setNotice('这版新稿已导入，未重复新增，也没有覆盖章节的后续编辑。'); setImportOpen(false); return; }
      const duplicates = target.chapters.filter(chapter => chapter.novelId === targetNovelId && chapter.title.trim() === title);
      if (duplicates.length && !(duplicates.length === 1 && duplicates[0].content === content)) throw new Error('已有同名章节，请更换标题。首版只新增，不覆盖已有正文。');
      flushActiveEditor();
      const chapter = duplicates[0] || target.addChapter({ novelId: targetNovelId, title, content, wordCount: countReferenceCharacters(project.draft.text), sequence: target.chapters.filter(chapter => chapter.novelId === targetNovelId).reduce((max, chapter) => Math.max(max, chapter.sequence + 1), 0) });
      workspace.getState().update(project.id, { imports: [...project.imports.filter(item => item.hash !== hash), { hash, novelId: targetNovelId, chapterId: chapter.id }] });
      setImportOpen(false); setNotice(IS_DEMO ? '已新增到本浏览器的作品，没有覆盖原有章节。' : '已写入本地作品；云端同步由完整应用处理，请核对保存结果，此提示不表示云端已确认。');
    } catch (error) { setNotice(error instanceof Error ? error.message : '导入未完成，请检查目标章节后重试。'); }
    finally { setBusy(null); }
  };
  const draftWarnings = project ? referenceDraftWarnings(project) : [];
  return <div className="h-full overflow-y-auto p-4 sm:p-6">
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      <div><h1 className="text-xl font-semibold">参考创作</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">文章首版 · 导入参考 → 分析结构与文风 → 换主题拟提纲 → 确认后写新稿 → 编辑导出</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">资料只保存在当前浏览器。点击分析或生成才向你的模型服务发送对应内容，可能产生 API 费用；切换功能或关闭页面会中止当前调用。请使用可用于分析的资料。</p></div>
      {warning && <div role="alert" className="rounded-lg border p-3 text-sm">{warning}<Button variant="outline" className="mt-2" onClick={() => { if (confirm('明确清空无法读取的参考工作台数据？这不会删除小说。')) workspace.getState().resetUnreadable(); }}>清空无法读取的参考数据</Button></div>}
      {notice && <p role="status" className="rounded-lg border bg-primary/5 p-3 text-sm leading-relaxed break-words">{notice}</p>}
      {unsavedResult && <label className="block rounded-lg border p-3 text-sm">本次结果尚未保存，请先复制备份再离开<textarea aria-label="尚未保存的结果" readOnly className={`${control} mt-2 min-h-48`} value={unsavedResult} /></label>}
      {busy && <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm"><span>{busy === 'import' ? '正在本机保存…' : busy === 'export' ? '正在生成文件…' : `${stageNames[busy]}中，已收到 ${liveText.length.toLocaleString()} 字符；完成后检查结果。`}</span>{job.current && <Button variant="outline" size="sm" onClick={() => job.current?.controller.abort()}>取消当前调用</Button>}</div>}
      <fieldset disabled={Boolean(busy)} className="min-w-0 space-y-5 disabled:opacity-75">
        <div className="flex flex-wrap gap-2"><select aria-label="已保存参考文" className={`${control} flex-1`} value={currentId || ''} onChange={event => safely(() => { workspace.getState().select(event.target.value || null); setTab('source'); })}><option value="">新建参考文</option>{projects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><Button variant="outline" onClick={() => safely(() => { workspace.getState().select(null); setSourceInput(''); setSourceTitle(''); })}>新参考文</Button>{project && <Button variant="outline" onClick={() => { if (confirm(`删除参考文《${project.title}》及其分析和独立草稿？已导入的小说章节保留。`)) safely(() => workspace.getState().remove(project.id)); }}>删除参考文</Button>}</div>
        {!project ? <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="font-medium">导入文章</h2><label className="block text-sm">资料标题<input aria-label="参考文标题" className={`${control} mt-1`} maxLength={120} value={sourceTitle} onChange={event => setSourceTitle(event.target.value)} /></label>
          <label className="block text-sm">选择 TXT / Markdown 文件<input aria-label="选择参考文件" type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" className="mt-2 block max-w-full text-sm" onChange={event => { void readFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
          <label className="block text-sm">或粘贴文章<textarea aria-label="参考原文输入" className={`${control} mt-1 min-h-64`} value={sourceInput} onChange={event => setSourceInput(event.target.value)} /></label>
          <p className="text-xs leading-relaxed text-muted-foreground">当前 {countReferenceCharacters(sourceInput).toLocaleString()} 个非空白字符。首版支持单篇 100–20000 字符、最多 80 个非空行段落，文件不超过 2 MiB；超限会提示，不静默截断。DOCX、PDF 导入和长书后台分析后续开放。</p>
          <Button onClick={() => void saveSource()}>保存参考文（不调用模型）</Button>
        </section> : <>
          <div className="rounded-xl border bg-card p-4"><h2 className="font-medium break-words">{project.title}</h2><p className="mt-2 text-xs text-muted-foreground">版本 {project.sourceHash.slice(0, 12)} · {parsed?.metrics.characters} 字符 · {parsed?.metrics.paragraphs} 段 · 平均段长 {parsed?.metrics.averageParagraph} · 按标点估算平均句长 {parsed?.metrics.averageSentence}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">分析将发送上述所选全文；粗估输入约 {Math.ceil(project.source.length / 4).toLocaleString()}–{(project.source.length * 2).toLocaleString()} tokens，输出上限 {settings.maxTokens.toLocaleString()}。不是精确计费值，每阶段一次调用，不自动重试。当前模型：{settings.model || '未配置'}。</p>
            <div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => void run('analysis')}>{referenceAnalysisReady(project.report) ? '查看或复用分析' : '开始分析文章'}</Button>{project.report && <Button variant="outline" onClick={() => void run('analysis', true)}>重新分析（再次调用）</Button>}<Button variant="outline" onClick={() => { setSourceInput(project.source); setSourceTitle(project.title); safely(() => workspace.getState().select(null)); }}>编辑为新版本</Button></div>
          </div>
          <div role="group" aria-label="参考创作页签" className="flex flex-wrap gap-2">{([['source', '原文'], ['report', '分析报告'], ['style', '文风与方法卡'], ['create', '新主题创作']] as const).map(([id, label]) => <Button key={id} variant={tab === id ? 'default' : 'outline'} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</Button>)}</div>
          {tab === 'source' && <section className="space-y-3 rounded-xl border bg-card p-4"><h2 className="font-medium">原文（按非空行分段）</h2>{parsed?.paragraphs.map(paragraph => <div id={`reference-${paragraph.id}`} key={paragraph.id} className={`rounded-lg border p-3 ${focusParagraph === paragraph.id ? 'ring-2 ring-primary' : ''}`}><p className="mb-1 text-xs text-muted-foreground">{paragraph.id}</p><p className="whitespace-pre-wrap break-words text-sm leading-7">{paragraph.text}</p></div>)}</section>}
          {tab === 'report' && (project.report ? <section className="space-y-4 rounded-xl border bg-card p-4"><h2 className="font-medium">文章分析报告</h2><p className="text-sm leading-7 break-words">{project.report.summary}</p><p className="text-sm leading-7 break-words">读者判断：{project.report.audience}</p><p className="text-xs text-muted-foreground">已覆盖 {parsed!.paragraphs.length - project.report.missingParagraphs.length}/{parsed!.paragraphs.length} 段；引文位置核验 {project.report.evidence.filter(item => item.verified).length}/{project.report.evidence.length}。只核对引文是否位于原段落，不代表模型解释正确。</p>{!referenceAnalysisReady(project.report) && <p role="alert" className="text-sm text-amber-700">报告范围或依据不完整，暂不能用于自动创作。缺少段落：{project.report.missingParagraphs.join('、') || '无；请核查引文'}。</p>}
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="border p-2">段落</th><th className="border p-2">作用</th><th className="border p-2">方法</th></tr></thead><tbody>{project.report.structure.map(item => <tr key={item.paragraphId}><td className="border p-2">{item.paragraphId}</td><td className="border p-2 break-words">{item.role}</td><td className="border p-2 break-words">{item.technique}</td></tr>)}</tbody></table></div>
            <h3 className="text-sm font-medium">依据与模型解读</h3>{project.report.evidence.map((item, index) => <div key={index} className="rounded-lg border p-3 text-sm leading-7 break-words"><p>{item.conclusion}</p><p className="text-muted-foreground">「{item.quote}」</p><Button size="sm" variant="outline" disabled={!item.verified} onClick={() => { setFocusParagraph(item.paragraphId); setTab('source'); }}>{item.verified ? `定位 ${item.paragraphId}` : '引文未核验，不作为原文依据'}</Button></div>)}{project.report.limitations.map((text, index) => <p key={index} className="text-xs leading-relaxed text-muted-foreground">{text}</p>)}</section> : <p className="text-sm text-muted-foreground">还没有分析报告，先点击「开始分析文章」。</p>)}
          {tab === 'style' && <section className="space-y-4 rounded-xl border bg-card p-4"><h2 className="font-medium">可编辑文风与方法卡</h2><p className="text-xs leading-relaxed text-muted-foreground">保存通用语言和结构特征，用于新主题；不要保留原角色、原事件或长原句。修改卡片不会重跑分析，但会取消旧提纲的确认。</p><label className="block text-sm">文风卡<textarea aria-label="文风卡" className={`${control} mt-1 min-h-48`} maxLength={6000} value={project.style} onChange={event => creative({ style: event.target.value })} /></label><label className="block text-sm">结构方法卡<textarea aria-label="结构方法卡" className={`${control} mt-1 min-h-48`} maxLength={6000} value={project.methods} onChange={event => creative({ methods: event.target.value })} /></label></section>}
          {tab === 'create' && <section className="space-y-4 rounded-xl border bg-card p-4"><h2 className="font-medium">换主题，创作新文章或样章</h2>
            <label className="block text-sm">新主题 / 故事设定<input aria-label="新主题" className={`${control} mt-1`} maxLength={300} value={project.brief.topic} onChange={event => creative({ brief: { ...project.brief, topic: event.target.value } })} /></label>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">稿件标题<input aria-label="新稿标题" className={`${control} mt-1`} maxLength={120} value={project.brief.title} onChange={event => creative({ brief: { ...project.brief, title: event.target.value } })} /></label><label className="text-sm">目标读者<input aria-label="目标读者" className={`${control} mt-1`} maxLength={200} value={project.brief.audience} onChange={event => creative({ brief: { ...project.brief, audience: event.target.value } })} /></label></div>
            <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">借鉴方式<select aria-label="借鉴方式" className={`${control} mt-1`} value={project.brief.mode} onChange={event => creative({ brief: { ...project.brief, mode: event.target.value as typeof project.brief.mode } })}><option value="both">结构与文风</option><option value="style">仅文风</option><option value="structure">仅结构</option></select></label>{(['min', 'max'] as const).map(field => <label key={field} className="text-sm">{field === 'min' ? '最少字符' : '最多字符'}<input aria-label={field === 'min' ? '最少字符' : '最多字符'} type="number" min={500} max={5000} className={`${control} mt-1`} value={project.brief[field]} onChange={event => creative({ brief: { ...project.brief, [field]: Number(event.target.value) } })} /></label>)}</div>
            <label className="block text-sm">自己的素材、事实依据与写作要求<textarea aria-label="新稿要求" className={`${control} mt-1 min-h-28`} maxLength={4000} value={project.brief.requirements} onChange={event => creative({ brief: { ...project.brief, requirements: event.target.value } })} /></label>
            <p className="text-xs leading-relaxed text-muted-foreground">生成只使用上面选择的卡片、你的简报和确认提纲，不重新发送整篇原文。修改主题不会重跑原文分析。新稿长度按非空白字符计；事实不足时保留待核实提示。</p>
            <Button disabled={!referenceAnalysisReady(project.report)} onClick={() => void run('outline')}>生成新提纲</Button>
            <label className="block text-sm">可编辑新提纲<textarea aria-label="新提纲" className={`${control} mt-1 min-h-48`} value={project.outline} onChange={event => creative({ outline: event.target.value })} /></label>
            <label className="flex items-start gap-2 text-sm leading-relaxed"><input aria-label="确认新提纲" type="checkbox" className="mt-1" disabled={!project.outline.trim()} checked={Boolean(project.outline.trim() && project.confirmedContext === referenceContext(project))} onChange={event => update({ confirmedContext: event.target.checked ? referenceContext(project) : undefined })} />我已检查提纲与当前主题、素材和文风要求一致，确认用于正文。</label>
            <Button disabled={!referenceAnalysisReady(project.report) || !project.outline.trim() || project.confirmedContext !== referenceContext(project)} onClick={() => void run('draft')}>按确认提纲生成新稿</Button>
            <label className="block text-sm">新稿正文（可直接编辑）<textarea aria-label="新稿正文" className={`${control} mt-1 min-h-80 leading-7`} value={project.draft?.text || ''} onChange={event => update({ draft: { text: event.target.value, context: project.draft?.context || referenceDraftContext(project), model: project.draft?.model || '手动编辑', createdAt: project.draft?.createdAt || Date.now() } })} /></label>
            {project.draft && <><p className="text-xs text-muted-foreground">正文 {countReferenceCharacters(project.draft.text)} 个非空白字符 · {draftWarnings.length ? '待检查，未验收' : '检查通过，可导入作品'}</p>{draftWarnings.map(text => <p key={text} className="text-xs leading-relaxed text-amber-700">{text}</p>)}{referenceOverlap(project.source, project.draft.text).map((text, index) => <p key={index} className="break-words text-xs text-muted-foreground">重合片段：{text}</p>)}<Button variant="outline" onClick={() => update({ draft: { ...project.draft!, completedBy: 'manual', context: referenceDraftContext(project) } })}>确认编辑完成</Button><p className="text-xs text-muted-foreground">人工确认不会跳过长度、占位内容和字面重合检查；不代表事实或全网原创保证。</p></>}
          </section>}
          {project.lastAttempt && <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer">上次{project.lastAttempt.stage}未完成：{project.lastAttempt.error}</summary><p className="mt-2 text-xs text-muted-foreground">保留的部分文字不作为成功报告或完整新稿。原有已完成结果仍保留。</p><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{project.lastAttempt.text || '未收到文字。'}</pre></details>}
          <section className="space-y-3 rounded-xl border bg-card p-4"><h2 className="font-medium">导出与确认导入</h2><div className="flex flex-wrap gap-2"><select aria-label="参考导出内容" className={`${control} sm:w-auto`} value={exportKind} onChange={event => setExportKind(event.target.value as typeof exportKind)}><option value="draft">新稿正文</option><option value="report">分析报告与卡片</option></select><select aria-label="参考导出格式" className={`${control} sm:w-auto`} value={exportFormat} onChange={event => setExportFormat(event.target.value as ExportFormat)}><option value="docx">Word（宋体 / 黑体）</option><option value="md">Markdown</option><option value="txt">TXT</option></select><Button variant="outline" disabled={exportKind === 'draft' ? !project.draft?.text.trim() : !project.report} onClick={() => void exportContent()}>导出所选内容</Button><Button disabled={!project.draft?.text.trim() || Boolean(draftWarnings.length)} onClick={() => { setTargetNovelId(currentNovelId || novels[0]?.id || ''); setChapterTitle(project.brief.title || project.brief.topic); setImportOpen(true); }}>预览导入小说</Button></div><p className="text-xs leading-relaxed text-muted-foreground">新稿可独立编辑和导出，不必创建小说；未验收稿可导出保留，但不能直接导入。报告默认包含范围和短引用，新稿不附参考原文。导入只新增一章，不自动导入原作角色、大纲或世界观。</p></section>
        </>}
      </fieldset>
      {liveText && busy && job.current && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-xs">查看当前收到的文字（尚未验收）</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{liveText}</pre></details>}
      <Dialog open={importOpen} onOpenChange={open => { if (!busy) setImportOpen(open); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>确认新增章节</DialogTitle><DialogDescription>只将当前新稿新增到所选作品，不覆盖任何已有章节，也不导入参考文设定。</DialogDescription></DialogHeader><label className="text-sm">目标作品<select aria-label="参考导入目标作品" className={`${control} mt-1`} value={targetNovelId} onChange={event => setTargetNovelId(event.target.value)}>{!novels.length && <option value="">请先到书架新建作品</option>}{novels.map(novel => <option key={novel.id} value={novel.id}>{novel.title}</option>)}</select></label><label className="text-sm">新章节标题<input aria-label="参考导入章节标题" className={`${control} mt-1`} maxLength={120} value={chapterTitle} onChange={event => setChapterTitle(event.target.value)} /></label><p className="text-xs leading-relaxed text-muted-foreground">将新增 1 章，共 {countReferenceCharacters(project?.draft?.text || '')} 个非空白字符。重复导入同一版本不会重复建章；同名不同内容会停止并提示。</p><details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer">预览将导入的新稿</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm leading-7">{project?.draft?.text}</pre></details><DialogFooter><Button variant="outline" disabled={Boolean(busy)} onClick={() => setImportOpen(false)}>取消</Button><Button disabled={Boolean(busy) || !targetNovelId || !chapterTitle.trim()} onClick={() => void importDraft()}>确认新增一章</Button></DialogFooter></DialogContent></Dialog>
    </div>
  </div>;
}
