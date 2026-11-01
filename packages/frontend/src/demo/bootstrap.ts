import { useNovelStore } from '@/stores/novelStore';
import { IS_DEMO } from '@/lib/runtime';
import data from './lingShiOrigin.json';
import type { Novel, Chapter, Character, WorldSetting, PlotCard, Foreshadowing } from '@/types';

const seedKey = 'novel-agent-demo-seeded-v1';
export async function initializeDemo(reset = false): Promise<void> {
  if (!IS_DEMO) return;
  document.title = 'NovelAgent · 灵石起源 · 在线演示';
  if (!reset && (localStorage.getItem(seedKey) || useNovelStore.getState().novels.length)) return;
  useNovelStore.setState({
    novels: data.novels as Novel[], chapters: data.chapters as Chapter[],
    characters: data.characters as Character[], worldSettings: data.worldSettings as WorldSetting[],
    plotCards: data.plotCards as PlotCard[], foreshadowings: data.foreshadowings as Foreshadowing[], sessions: [],
    currentNovelId: data.novels[0].id, currentChapterId: data.chapters[0]?.id || null, currentView: 'chapters',
  });
  localStorage.setItem(seedKey, 'true');
}
