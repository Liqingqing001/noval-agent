import { useEffect, useMemo, useState } from 'react';
import { Bot, Play, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNovelStore } from '@/stores/novelStore';
import { readManuscript, paragraphText } from '@/lib/manuscript';
import sample from './library.json';

export function DemoAssistant({ onNavigate }: { onNavigate?: () => void }) {
  const [length, setLength] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const setView = useNovelStore(state => state.setCurrentView);
  const novelId = useNovelStore(state => state.currentNovelId);
  const novel = sample.novels.find(item => item.id === novelId) || sample.novels[0];
  const navigate = (view: Parameters<typeof setView>[0]) => { setView(view); onNavigate?.(); };
  const chapter = sample.chapters.find(item => item.novelId === novel.id);
  const text = useMemo(() => readManuscript(chapter?.content || '').map(paragraphText).join('\n\n'), [chapter?.content]);
  const finished = length >= text.length;
  useEffect(() => { setLength(0); setPlaying(false); setExpanded(false); }, [novel.id]);
  useEffect(() => {
    if (!playing || finished) return;
    const timer = setInterval(() => setLength(value => Math.min(text.length, value + 40)), 45);
    return () => clearInterval(timer);
  }, [playing, finished, text.length]);
  return <aside className="flex h-full min-h-0 flex-col border-l bg-muted/30">
    <div className="flex items-center gap-2 border-b p-4 font-medium"><Bot className="h-5 w-5 text-primary" />AI 创作助手</div>
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      <div className="rounded-xl border bg-card p-4 text-sm leading-relaxed">
        <p className="font-medium">查看完整作品，再配置模型</p><p className="mt-2 text-muted-foreground">书架已载入从项目数据库导出的《晚自习后，别回头》和《潮汐替人记得》。每本均有完整人物、世界观、五卷大纲和四十章正文，可以编辑和导出；当前回放《{novel.title}》。</p>
        <p className="mt-2 text-xs text-muted-foreground">下面只回放数据库已保存的章节《{chapter?.title}》已有文字，不调用模型、不消耗 API 额度，也不会覆盖正文。</p>
      </div>
      <Button className="w-full" onClick={() => { setLength(0); setExpanded(false); setPlaying(true); }} disabled={playing && !finished}><Play className="h-4 w-4" />{playing && !finished ? '示例回放中…' : '回放已有章节（非实时生成）'}</Button>
      {playing && <div className="rounded-xl border bg-card p-4">
        <p className="mb-2 text-xs font-medium text-primary" role="status">{finished ? '示例回放完成' : '示例回放中'} · 已有文字，非实时 AI 生成</p>
        <p className="mb-3 text-xs text-muted-foreground">《{chapter?.title}》 · 已回放 {length.toLocaleString()} / {text.length.toLocaleString()} 字符</p>
        <div id="demo-playback-text" className={expanded ? '' : 'max-h-96 overflow-y-auto pr-1'}><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{text.slice(0, length)}</p></div>
        <Button variant="ghost" size="sm" className="mt-2 text-xs" aria-expanded={expanded} aria-controls="demo-playback-text" onClick={() => setExpanded(value => !value)}>{expanded ? '收起全文' : '展开全文'}</Button>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">文字可滚动阅读，也可展开全文；完整正文请到章节面板编辑或导出。</p>
        {finished && <p className="mt-3 text-xs font-medium text-primary">本章全文回放结束。</p>}
      </div>}
      <div className="grid grid-cols-2 gap-2">{([['outline', '查看大纲'], ['characters', '查看人物'], ['world', '查看世界观'], ['chapters', '返回章节']] as const).map(([view, label]) => <Button key={view} variant="outline" size="sm" onClick={() => navigate(view)}>{label}</Button>)}</div>
    </div>
    <div className="border-t p-4"><Button variant="outline" className="w-full" onClick={() => navigate('settings')}><Settings2 className="h-4 w-4" />配置自己的 API</Button><p className="mt-2 text-xs leading-relaxed text-muted-foreground">真实调用由你的模型账户计费。Key 仅保存在此浏览器的独立演示设置中，直连接口需支持 CORS。</p></div>
  </aside>;
}
