import { useNovelStore } from '@/stores/novelStore';
import { IS_DEMO, storageKey } from '@/lib/runtime';
import { readReferenceWorkspace } from '@/lib/referencePersistence';
import data from './library.json';
import { mergeDemoLibrary } from './seedPolicy';
import type { DemoSeedData } from './seedPolicy';
import type { Novel, Chapter, Character, WorldSetting, PlotCard, Foreshadowing } from '@/types';

const seedKey = 'novel-agent-demo-seeded-library-v2';
export async function initializeDemo(reset = false): Promise<void> {
  if (!IS_DEMO) return;
  document.title = 'NovelAgent · 晚自习后，别回头 · 在线演示';
  const state = useNovelStore.getState();
  let hasAuxiliaryEdits = false;
  if (!reset && state.novels.some(novel => novel.id === 'demo-tide-remembers')) {
    try {
      const board = await readReferenceWorkspace(`${storageKey('novel-agent-character-board')}:browser:demo-tide-remembers`) as { nodes?: Record<string, unknown>; edges?: unknown[] } | undefined;
      hasAuxiliaryEdits = !!(board && (Object.keys(board.nodes || {}).length || board.edges?.length));
    } catch { hasAuxiliaryEdits = true; }
  }
  const merged = mergeDemoLibrary(state as unknown as DemoSeedData, data as unknown as DemoSeedData, { resetNovelId: reset ? state.currentNovelId || data.novels[0].id : undefined, hasAuxiliaryEdits });
  const novels = merged.novels.map(novel => ({
    ...novel,
    cover: typeof novel.cover === 'string' && /^(?:book|school)\//.test(novel.cover) ? `${import.meta.env.BASE_URL}${novel.cover}` : novel.cover,
  })) as Novel[];
  const selectedNovelId = state.currentNovelId && novels.some(novel => novel.id === state.currentNovelId) ? state.currentNovelId : state.novels.length && !state.currentNovelId ? null : novels[0].id;
  const selectedChapterId = selectedNovelId ? !reset && merged.chapters.some(chapter => chapter.id === state.currentChapterId && chapter.novelId === selectedNovelId) ? state.currentChapterId : merged.chapters.find(chapter => chapter.novelId === selectedNovelId)?.id || null : null;
  useNovelStore.setState({
    novels, chapters: merged.chapters as unknown as Chapter[],
    characters: merged.characters as unknown as Character[], worldSettings: merged.worldSettings as unknown as WorldSetting[],
    plotCards: merged.plotCards as unknown as PlotCard[], foreshadowings: merged.foreshadowings as unknown as Foreshadowing[], sessions: merged.sessions as typeof state.sessions,
    lastReadChapterIds: state.lastReadChapterIds,
    currentNovelId: selectedNovelId, currentChapterId: selectedChapterId, currentView: state.novels.length ? state.currentView : 'chapters',
  });
  localStorage.setItem(seedKey, 'true');
}
