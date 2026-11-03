import { useState } from 'react';
import { ExternalLink, Download, Copy, Send, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useNovelStore } from '@/stores/novelStore';
import { flushActiveEditor } from '@/lib/editorEvents';
import { createNovelExport, downloadExport, prepareNovelExport, sanitizeExportFilename } from '@/lib/novelExport';
import { AI_USE_LABELS, createPublicationHtml, createSubmissionBrief, plainManuscript, publicationChapters } from '@/lib/publication';
import type { AiUse } from '@/lib/publication';
import type { ExportFormat } from '@/lib/novelExport';
import catalog from '@/data/publishingPlatforms.json';
import './publication.css';

interface Source { title: string; url: string; kind: string; access: string; quote?: string; publishedAt?: string }
interface Platform {
  id: string; name: string; region: string; category: string; fit: string; entryUrl: string; entryLabel: string;
  checkedAt: string; workflow: string[]; formats: string; api: string; automatic: boolean;
  ai: { status: string; text: string; assisted: string; cover: string; monetization: string };
  caveats: string[]; sources: Source[];
}
const platforms = catalog as Platform[];
const statusLabels: Record<string,string> = { restricted: '有明确限制', disclosure: '需声明 / 标签', conditional: '有条件允许', unverified: '规则待核实', na: '非网文投稿平台' };
const regions: Record<string,string> = { cn: '国内', global: '海外', self: '自托管' };

export function PublicationHub({ onClose }: { onClose: () => void }) {
  const novels=useNovelStore(state=>state.novels);
  const chapters=useNovelStore(state=>state.chapters);
  const activeNovelId=useNovelStore(state=>state.currentNovelId);
  const activeChapterId=useNovelStore(state=>state.currentChapterId);
  const [novelId,setNovelId]=useState(activeNovelId || '');
  const [chapterId,setChapterId]=useState(activeChapterId || '');
  const [selectedId,setSelectedId]=useState('qidian');
  const [query,setQuery]=useState('');
  const [region,setRegion]=useState('all');
  const [policy,setPolicy]=useState('all');
  const [tab,setTab]=useState<'research'|'prepare'>('research');
  const [textUse,setTextUse]=useState<AiUse>('unknown');
  const [coverUse,setCoverUse]=useState<AiUse>('unknown');
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('');
  const [error,setError]=useState('');
  const [manualCopy,setManualCopy]=useState('');
  const visible=platforms.filter(p=>(region==='all'||p.region===region)&&(policy==='all'||p.ai.status===policy)&&`${p.name} ${p.fit} ${p.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  const platform=visible.find(p=>p.id===selectedId)||visible[0];
  const novel=novels.find(n=>n.id===novelId);
  const ordered=novel?publicationChapters(novel.id,chapters):[];
  const chapter=ordered.find(c=>c.id===chapterId)||ordered[0];
  const clearFeedback=()=>{setStatus('');setError('');setManualCopy('');};
  const latest=()=>{flushActiveEditor();const state=useNovelStore.getState();const latestNovel=state.novels.find(n=>n.id===novelId);if(!latestNovel)throw Error('请先选择一本仍在书架中的作品。');return {novel:latestNovel,chapters:state.chapters};};
  const copy=async(kind:'title'|'summary'|'chapter'|'chapter-title')=>{
    clearFeedback();let text='';
    try{const data=latest();if(kind==='title')text=data.novel.title;else if(kind==='summary')text=plainManuscript(data.novel.summary||'');else {const selected=publicationChapters(data.novel.id,data.chapters).find(c=>c.id===chapter?.id);if(!selected)throw Error('请选择一个可复制的章节。');text=kind==='chapter-title'?selected.title:plainManuscript(selected.content);}if(!text.trim())throw Error('当前内容为空。');if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');await navigator.clipboard.writeText(text);setStatus(kind==='chapter'?'章节正文已复制；章节标题请在平台表单单独填写。':'已复制。');}
    catch(cause){if(text){setManualCopy(text);setStatus('无法访问剪贴板，请在下方文本框中选择并手动复制。');}else setError(cause instanceof Error?cause.message:'复制未完成。');}
  };
  const exportFile=async(format:ExportFormat|'brief'|'html')=>{
    if(busy||!platform)return;clearFeedback();setBusy(true);
    try{const data=latest();let blob:Blob,filename:string;
      if(format==='brief'){blob=new Blob([createSubmissionBrief(data.novel,data.chapters,platform,textUse,coverUse)],{type:'text/markdown;charset=utf-8'});filename=`${sanitizeExportFilename(`${data.novel.title}_${platform.name}_投稿资料`)}.md`;}
      else if(format==='html'){blob=new Blob([createPublicationHtml(data.novel,data.chapters)],{type:'text/html;charset=utf-8'});filename=`${sanitizeExportFilename(data.novel.title)}_阅读页.html`;}
      else {const exported=await createNovelExport(prepareNovelExport(data.novel,data.chapters,{scope:'novel',includeSummary:false}),format,'novel');blob=exported.blob;filename=exported.filename;}
      downloadExport(blob,filename);setStatus('文件已在本机生成并发起下载，尚未提交平台。');
    }catch(cause){setError(cause instanceof Error?cause.message:'文件生成失败，请重试。');}finally{setBusy(false);}
  };
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="publication-dialog flex w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0" onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onInteractOutside={event=>{if(busy)event.preventDefault();}}>
    <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-5 pr-12"><DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-primary"/>发布中心</DialogTitle><DialogDescription>先了解平台，再准备稿件。当前支持本机整理与跳转，未连接平台账号，也未提交作品。</DialogDescription><a className="w-fit text-xs text-primary underline underline-offset-4" href={`${import.meta.env.BASE_URL}publishing-research.md`} download>下载完整平台调研报告</a></DialogHeader>
    <div className="publication-scroll min-h-0 overflow-y-auto">
      <div className="publication-overview"><span><b>{platforms.length}</b> 个平台 / 渠道</span><span><b>已可用</b> 复制 · 导出 · 官方入口</span><span><b>未接入</b> 平台上传 · 审核状态 · 定时发布</span></div>
      <div className="publication-filters"><label className="publication-search"><Search className="h-4 w-4"/><input aria-label="搜索发布平台" placeholder="搜索平台、题材或读者类型" value={query} onChange={e=>{setQuery(e.target.value);clearFeedback();}}/></label><select aria-label="平台地区" value={region} onChange={e=>{setRegion(e.target.value);clearFeedback();}}><option value="all">全部地区</option>{Object.entries(regions).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><select aria-label="AI 政策筛选" value={policy} onChange={e=>{setPolicy(e.target.value);clearFeedback();}}><option value="all">全部 AI 政策</option>{Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
      <div className="publication-layout"><aside className="publication-platforms" aria-label="发布平台列表">{visible.map(p=><button key={p.id} type="button" aria-pressed={platform?.id===p.id} onClick={()=>{setSelectedId(p.id);clearFeedback();}}><strong>{p.name}</strong><small>{regions[p.region]} · {p.category}</small><span className={`policy-badge policy-${p.ai.status}`}>{statusLabels[p.ai.status]}</span></button>)}{!visible.length&&<p className="p-4 text-sm text-muted-foreground">没有匹配平台。<button className="underline" onClick={()=>{setQuery('');setRegion('all');setPolicy('all');}}>清除筛选</button></p>}</aside>
      {platform&&<div className="publication-detail min-w-0"><div className="publication-platform-heading"><div><h2>{platform.name}</h2><p>{platform.fit}</p></div><a className="publication-official" href={platform.entryUrl} target="_blank" rel="noopener noreferrer">{platform.entryLabel}<ExternalLink className="h-3.5 w-3.5"/></a></div>
      <div className="publication-tabs"><button aria-pressed={tab==='research'} onClick={()=>setTab('research')}>平台调研与 AI 政策</button><button aria-pressed={tab==='prepare'} onClick={()=>setTab('prepare')}>准备发布材料</button></div>
      {tab==='research'?<section aria-label="平台调研详情" className="publication-research"><p className="publication-date">核查日期：{platform.checkedAt} · 公开网页调研，登录后规则与合同需作者另行确认</p><h3>能做到哪一步</h3><dl className="publication-capabilities"><dt>现在可用</dt><dd>选择作品、复制简介 / 单章正文、导出 TXT / Markdown / Word、下载投稿资料、打开官方页面。</dd><dt>平台导入</dt><dd>{platform.formats}</dd><dt>接口与后续</dt><dd>{platform.api}</dd><dt>远端发布</dt><dd>尚未接入。打开外链或下载文件不会改变为“已发布”，审核、签约与收益由平台决定。</dd></dl><h3>官方投稿路径 / 待核实步骤</h3><ol>{platform.workflow.map(s=><li key={s}>{s}</li>)}</ol><h3>AI 内容政策 <span className={`policy-badge policy-${platform.ai.status}`}>{statusLabels[platform.ai.status]}</span></h3><dl className="publication-capabilities"><dt>AI 生成正文</dt><dd>{platform.ai.text}</dd><dt>辅助创作</dt><dd>{platform.ai.assisted}</dd><dt>封面 / 插图</dt><dd>{platform.ai.cover}</dd><dt>签约 / 变现</dt><dd>{platform.ai.monetization}</dd></dl><h3>适用边界</h3><ul>{platform.caveats.map(c=><li key={c}>{c}</li>)}</ul><h3>来源与证据</h3><p className="publication-date">“未核实”不等于允许或禁止；搜索摘要不等于已读取完整条款。以下保留访问状态与原文范围。</p><div className="publication-sources">{platform.sources.map(source=><article key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<ExternalLink className="h-3 w-3"/></a><small>{source.kind} · {source.access}{source.publishedAt?` · 来源日期：${source.publishedAt}`:''}</small>{source.quote&&<blockquote>“{source.quote}”</blockquote>}</article>)}</div></section>:<section className="publication-prepare" aria-label="准备发布材料"><label className="publication-field">选择作品<select aria-label="准备发布的作品" value={novel?novelId:''} onChange={e=>{setNovelId(e.target.value);setChapterId('');setTextUse('unknown');setCoverUse('unknown');clearFeedback();}}><option value="">只查看平台 / 暂不选择作品</option>{novels.map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select></label>{!novel?<p className="publication-note">先从书架创建或选择作品，即可准备稿件。平台调研在没有作品时也可查看。</p>:<><p className="publication-note">《{novel.title}》· {ordered.length} 章。以下仅生成本机文件；平台是否接受导入、AI 稿件及已公开作品，请按其当前规则确认。</p><div className="publication-actions"><Button variant="outline" disabled={busy} onClick={()=>void copy('title')}><Copy/>复制书名</Button><Button variant="outline" disabled={busy} onClick={()=>void copy('summary')}><Copy/>复制简介</Button></div><label className="publication-field">选择章节<select aria-label="投稿章节" value={chapter?.id||''} onChange={e=>{setChapterId(e.target.value);clearFeedback();}}>{!ordered.length&&<option value="">暂无章节</option>}{ordered.map((c,i)=><option key={c.id} value={c.id}>{i+1}. {c.title}</option>)}</select></label><div className="publication-actions"><Button variant="outline" disabled={busy||!chapter} onClick={()=>void copy('chapter-title')}><Copy/>复制章节标题</Button><Button variant="outline" disabled={busy||!chapter} onClick={()=>void copy('chapter')}><Copy/>复制章节正文</Button><span className="publication-date">正文不混入书名、简介或其他作品；标题在平台单独填写。</span></div><h3>整理 AI 使用说明</h3><p className="publication-date">由作者如实选择，不自动识别。构思校对与生成正文不同；生成后人工润色也不当然属于纯辅助。</p><div className="publication-ai-fields">{([['正文',textUse,setTextUse],['封面 / 插图',coverUse,setCoverUse]] as const).map(([label,value,setter])=><label className="publication-field" key={label}>{label}<select aria-label={`${label} AI 使用`} value={value} onChange={e=>setter(e.target.value as AiUse)}>{Object.entries(AI_USE_LABELS).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>)}</div>{platform.ai.status==='restricted'&&textUse==='generated'&&<p className="publication-note" role="note">该平台存在明确限制。请先核实具体条款，当前选择不表示稿件可提交或可签约。</p>}{(platform.ai.status==='unverified'||textUse==='unknown'||coverUse==='unknown')&&<p className="publication-note">仍有政策或使用范围待确认；生成资料会保留“尚未确认”，不会替作者声称未使用 AI。</p>}<div className="publication-actions"><Button disabled={busy} onClick={()=>void exportFile('brief')}><Download/>下载投稿资料</Button><Button variant="outline" disabled={busy||!ordered.length} onClick={()=>void exportFile('txt')}>整本 TXT</Button><Button variant="outline" disabled={busy||!ordered.length} onClick={()=>void exportFile('md')}>整本 Markdown</Button><Button variant="outline" disabled={busy||!ordered.length} onClick={()=>void exportFile('docx')}>整本 Word</Button>{platform.id==='github-pages'&&<Button variant="outline" disabled={busy||!ordered.length} onClick={()=>void exportFile('html')}>下载独立阅读页 HTML</Button>}</div><p className="publication-date">TXT / Word 是通用稿件文件，不代表目标平台已支持文件导入。AI 使用说明单独放在投稿资料中，不擅自修改正文。</p><h3>发布前人工确认</h3><ul><li>查看本平台当前规则、活动和合同，核对正文与图片权利。</li><li>核对首发 / 独家条件；已在 GitHub Pages 公开的作品，不应直接声称未发表。</li><li>在平台完成登录、必要的实名、分类分级、标签与预览，再由作者确认提交。</li></ul></>}{busy&&<p role="status">正在生成文件…</p>}{status&&<p role="status" className="publication-feedback">{status}</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{manualCopy&&<label className="publication-field">手动复制内容<textarea aria-label="手动复制内容" readOnly value={manualCopy} onFocus={e=>e.target.select()} rows={8}/></label>}</section>}
      </div>}</div>
    </div>
  </DialogContent></Dialog>;
}
