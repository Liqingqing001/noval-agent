import { useNovelStore } from '@/stores/novelStore';
import { IS_DEMO, storageKey } from '@/lib/runtime';
import { readReferenceWorkspace } from '@/lib/referencePersistence';
import data from './tideMemory.json';
import { shouldInitializeTideDemo } from './seedPolicy';
import type { DemoSeedData } from './seedPolicy';
import type { Novel, Chapter, Character, WorldSetting, PlotCard, Foreshadowing } from '@/types';

const seedKey = 'novel-agent-demo-seeded-tide-v1';
export async function initializeDemo(reset = false): Promise<void> {
  if (!IS_DEMO) return;
  document.title = 'NovelAgent · 潮汐替人记得 · 在线演示';
  const state = useNovelStore.getState();
  // Upgrade only the untouched retired sample. A visitor's own books or edited samples remain local.
  if (!shouldInitializeTideDemo(state as unknown as DemoSeedData, reset)) return;
  if (!reset && state.novels.length) {
    try {
      const legacyBoard = await readReferenceWorkspace(`${storageKey('novel-agent-character-board')}:browser:demo-lingshi-origin`) as { nodes?: Record<string, unknown>; edges?: unknown[] } | undefined;
      if (legacyBoard && (Object.keys(legacyBoard.nodes || {}).length || legacyBoard.edges?.length)) return;
    } catch { return; } // Preserve the old workspace when its auxiliary records cannot be checked safely.
  }
  const novels = data.novels.map(novel => ({
    ...novel,
    cover: novel.cover ? `${import.meta.env.BASE_URL}${novel.cover.replace(/^\/+/, '')}` : undefined,
  })) as Novel[];
  useNovelStore.setState({
    novels, chapters: data.chapters as Chapter[],
    characters: data.characters as Character[], worldSettings: data.worldSettings as WorldSetting[],
    plotCards: data.plotCards as PlotCard[], foreshadowings: data.foreshadowings as Foreshadowing[], sessions: [],
    lastReadChapterIds: {},
    currentNovelId: novels[0].id, currentChapterId: data.chapters[0]?.id || null, currentView: 'chapters',
  });
  localStorage.setItem(seedKey, 'true');
}
