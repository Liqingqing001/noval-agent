import { lazy, Suspense, useEffect, useState } from 'react';
import { History, ListChecks, Route } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNovelStore } from '@/stores/novelStore';
import { storageKey } from '@/lib/runtime';
import { flushActiveEditor } from '@/lib/editorEvents';

const VersionHistoryPanel = lazy(() => import('./VersionHistoryPanel').then(module => ({ default: module.VersionHistoryPanel })));
const ConsistencyPanel = lazy(() => import('./ConsistencyPanel').then(module => ({ default: module.ConsistencyPanel })));
const CharacterTimelinePanel = lazy(() => import('./CharacterTimelinePanel').then(module => ({ default: module.CharacterTimelinePanel })));

type ReviewTab = 'history' | 'consistency' | 'timeline';
const validTab = (value: unknown): value is ReviewTab => ['history', 'consistency', 'timeline'].includes(String(value));

function requestedTab(): ReviewTab {
  try {
    const key = storageKey('novel-agent-review-tab');
    const value = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    return validTab(value) ? value : 'history';
  } catch { return 'history'; }
}

export function ReviewWorkbench() {
  const novelId = useNovelStore(state => state.currentNovelId);
  const [tab, setTab] = useState<ReviewTab>(requestedTab);

  useEffect(() => {
    const open = (event: Event) => {
      const requested = (event as CustomEvent<{ tab?: unknown }>).detail?.tab;
      if (validTab(requested)) setTab(requested);
      try { sessionStorage.removeItem(storageKey('novel-agent-review-tab')); } catch { /* Event navigation also works without storage. */ }
    };
    window.addEventListener('novel-agent-open-review', open);
    return () => window.removeEventListener('novel-agent-open-review', open);
  }, []);

  if (!novelId) return <div className="p-5 text-sm text-muted-foreground">从书架选择一本作品后，可查看版本、检查全书和维护人物状态。</div>;

  return <section aria-label="创作检查工作台" className="flex h-full min-h-0 min-w-0 flex-col" key={novelId}>
    <div className="shrink-0 border-b bg-card/70 px-4 pt-4 sm:px-6">
      <h2 className="text-lg font-semibold">创作检查</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">保留改稿版本，核对全书线索，按章节追踪人物变化。</p>
    </div>
    <Tabs value={tab} onValueChange={value => { if (validTab(value)) { flushActiveEditor(); setTab(value); } }} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0 overflow-x-auto border-b bg-card/70 px-3 py-2 sm:px-5">
        <TabsList aria-label="创作检查分类" className="h-auto w-max min-w-full justify-start gap-1">
          <TabsTrigger value="history" className="min-h-10 gap-2"><History className="h-4 w-4" />版本历史</TabsTrigger>
          <TabsTrigger value="consistency" className="min-h-10 gap-2"><ListChecks className="h-4 w-4" />全书一致性检查</TabsTrigger>
          <TabsTrigger value="timeline" className="min-h-10 gap-2"><Route className="h-4 w-4" />人物状态时间线</TabsTrigger>
        </TabsList>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <Suspense fallback={<p role="status" className="p-5 text-sm text-muted-foreground">正在载入创作检查…</p>}>
          <TabsContent value="history" className="m-0 min-w-0 p-4 sm:p-6"><VersionHistoryPanel novelId={novelId} /></TabsContent>
          <TabsContent value="consistency" className="m-0 min-w-0 p-4 sm:p-6"><ConsistencyPanel novelId={novelId} /></TabsContent>
          <TabsContent value="timeline" className="m-0 min-w-0 p-4 sm:p-6"><CharacterTimelinePanel novelId={novelId} /></TabsContent>
        </Suspense>
      </div>
    </Tabs>
  </section>;
}
