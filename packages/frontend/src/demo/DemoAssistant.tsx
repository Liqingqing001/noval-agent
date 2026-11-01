import { useEffect, useState } from 'react';
import { Bot, Play, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNovelStore } from '@/stores/novelStore';
import { readManuscript, paragraphText } from '@/lib/manuscript';
import sample from './lingShiOrigin.json';

export function DemoAssistant({ onNavigate }: { onNavigate?: () => void }) {
  const [length, setLength] = useState(0);
  const [playing, setPlaying] = useState(false);
  const setView = useNovelStore(state => state.setCurrentView);
  const navigate = (view: Parameters<typeof setView>[0]) => { setView(view); onNavigate?.(); };
  const text = readManuscript(sample.chapters[0]?.content || '').map(paragraphText).join('\n\n').slice(0, 1200);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setLength(value => Math.min(text.length, value + 40)), 45);
    return () => clearInterval(timer);
  }, [playing, text.length]);
  const finished = length >= text.length;
  return <aside className="flex h-full min-h-0 flex-col border-l bg-muted/30">
    <div className="flex items-center gap-2 border-b p-4 font-medium"><Bot className="h-5 w-5 text-primary" />AI 创作助手</div>
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      <div className="rounded-xl border bg-card p-4 text-sm leading-relaxed">
        <p className="font-medium">先体验，再配置模型</p><p className="mt-2 text-muted-foreground">左侧已载入《灵石起源》真实示例。你可以编辑章节、查看人物与大纲，并导出 TXT、Markdown 或 Word。</p>
        <p className="mt-2 text-xs text-muted-foreground">下面是已有开篇文字的回放，不调用模型、不消耗 API 额度，也不会覆盖正文。</p>
      </div>
      <Button className="w-full" onClick={() => { setLength(0); setPlaying(true); }} disabled={playing && !finished}><Play className="h-4 w-4" />{playing && !finished ? '示例回放中…' : '演示正文生成效果'}</Button>
      {playing && <div className="rounded-xl border bg-card p-4"><p className="mb-3 text-xs font-medium text-primary">{finished ? '示例回放完成' : '示例回放中'} · 已有文字，非实时 AI 生成</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{text.slice(0, length)}</p></div>}
      <div className="grid grid-cols-2 gap-2">{([['outline', '查看大纲'], ['characters', '查看人物'], ['world', '查看世界观'], ['chapters', '返回章节']] as const).map(([view, label]) => <Button key={view} variant="outline" size="sm" onClick={() => navigate(view)}>{label}</Button>)}</div>
    </div>
    <div className="border-t p-4"><Button variant="outline" className="w-full" onClick={() => navigate('settings')}><Settings2 className="h-4 w-4" />配置自己的 API</Button><p className="mt-2 text-xs leading-relaxed text-muted-foreground">真实调用由你的模型账户计费。Key 仅保存在此浏览器的独立演示设置中，直连接口需支持 CORS。</p></div>
  </aside>;
}
