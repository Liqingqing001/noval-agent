import { flushActiveEditor } from '@/lib/editorEvents';

export function DemoBanner() {
  return <div className="demo-banner flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-primary/10 px-4 py-2 text-xs" role="note">
    <p><strong>NovelAgent 面试演示 · 灵石起源</strong><span className="demo-banner-description ml-3">无需登录 · 修改仅保存在当前浏览器</span></p>
    <div className="flex items-center gap-4">
      <button className="underline underline-offset-2" onClick={() => { if (confirm('恢复《灵石起源》公开示例？将清除当前浏览器中的演示作品和演示对话，API 设置保留。')) { flushActiveEditor(); void import('./bootstrap').then(module => module.initializeDemo(true)); } }}>恢复示例</button>
      <a href="https://github.com/Liqingqing001/noval-agent" target="_blank" rel="noreferrer" className="underline underline-offset-2">查看源码</a>
    </div>
  </div>;
}
