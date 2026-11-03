import { flushActiveEditor } from '@/lib/editorEvents';

export function DemoBanner() {
  return <div className="demo-banner flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-primary/10 px-4 py-2 text-xs" role="note">
    <p><strong>NovelAgent 作品案例 · 潮汐替人记得</strong><span className="demo-banner-description ml-3">数据库导出示例 · 浏览器内的修改仅本机保存</span></p>
    <div className="flex items-center gap-4">
      <button className="underline underline-offset-2" onClick={() => { if (confirm('恢复《潮汐替人记得》数据库导出示例？将替换当前浏览器中的演示作品和演示对话，API 设置保留。')) { flushActiveEditor(); void import('./bootstrap').then(module => module.initializeDemo(true)); } }}>恢复本书案例</button>
      <a href="https://github.com/Liqingqing001/noval-agent" target="_blank" rel="noreferrer" className="underline underline-offset-2">查看源码</a>
    </div>
  </div>;
}
