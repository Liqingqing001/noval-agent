import { flushActiveEditor } from '@/lib/editorEvents';
import { useNovelStore } from '@/stores/novelStore';

export function DemoBanner() {
  const novel = useNovelStore(state => state.novels.find(item => item.id === state.currentNovelId));
  const isCase = /^demo-(?:school|tide)-/.test(novel?.id || '');
  return <div className="demo-banner flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-primary/10 px-4 py-2 text-xs" role="note">
    <p><strong>NovelAgent · {novel?.title || '完整双书案例'}</strong><span className="demo-banner-description ml-3">两部数据库导出小说 · 浏览器内的修改仅本机保存</span></p>
    <div className="demo-banner-actions flex items-center gap-4">
      {isCase && <button className="whitespace-nowrap underline underline-offset-2" onClick={() => { if (confirm(`恢复《${novel?.title}》数据库导出示例？将替换本书的演示内容和演示对话，其他作品与 API 设置保留。`)) { flushActiveEditor(); void import('./bootstrap').then(module => module.initializeDemo(true)); } }}>恢复本书案例</button>}
      <details className="demo-banner-more"><summary>说明</summary><div className="demo-banner-info"><p>书架保留《潮汐替人记得》，并新增《晚自习后，别回头》。两本均含完整正文、人物、世界观与大纲。你的编辑仅保存在当前浏览器，不会修改公开数据。</p><a href="https://github.com/Liqingqing001/noval-agent" target="_blank" rel="noreferrer" className="underline underline-offset-2">查看源码</a></div></details>
    </div>
  </div>;
}
