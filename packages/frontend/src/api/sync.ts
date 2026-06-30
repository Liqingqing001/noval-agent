// 数据同步辅助函数
// 登录后从后端拉取数据并填充到 novelStore
// 或者从 localStorage 上传到后端

import { useNovelStore } from '@/stores/novelStore';
import { novelsApi } from '@/api/novels';
import { chaptersApi } from '@/api/chapters';
import { charactersApi } from '@/api/characters';
import { worldSettingsApi } from '@/api/worldSettings';
import { plotCardsApi } from '@/api/plotCards';
import { foreshadowingsApi } from '@/api/foreshadowings';
import { migrateApi } from '@/api/migrate';

function normalizePlotCard(p: any) {
  return {
    ...p,
    // 兼容旧版三幕式大纲数据：没有 type 的旧 plotCard 视为章节大纲
    type: p.type || 'chapter',
    // 兼容旧状态 planned/writing/completed
    status: p.status === 'completed' ? 'completed' : 'pending',
    volumeId: p.volumeId || undefined,
    chapterId: p.chapterId || undefined,
    createdAt: new Date(p.createdAt).getTime(),
    updatedAt: new Date(p.updatedAt).getTime(),
  };
}

/**
 * 从后端拉取所有数据并填充到 novelStore
 * 替换 localStorage 中的数据
 */
export async function fetchAllFromBackend(options: { preserveLocalIfRemoteEmpty?: boolean } = {}): Promise<void> {
  const store = useNovelStore.getState();
  const { setNovels, setChapters, setCharacters, setWorldSettings, setPlotCards, setForeshadowings } = store as any;

  // 1. 获取所有小说
  const { novels } = await novelsApi.list();

  // 安全保护：如果云端是空的，而本地还有数据，默认不要覆盖本地。
  // 这可以避免首次登录时用空云端数据把旧 localStorage 数据清掉。
  if (options.preserveLocalIfRemoteEmpty && novels.length === 0 && hasLocalData()) {
    console.warn('云端为空，已保留本地数据，等待用户迁移');
    return;
  }

  // 2. 收集所有章节、角色等（需要逐个 novel 拉取）
  const allChapters: any[] = [];
  const allCharacters: any[] = [];
  const allWorldSettings: any[] = [];
  const allPlotCards: any[] = [];
  const allForeshadowings: any[] = [];

  // 关键保护：某类资源接口失败时，不能用 [] 覆盖本地数据。
  // 例如数据库迁移未完成时 plot-cards 接口会失败，如果继续 setPlotCards([]) 会让本地大纲看起来被删除。
  let chaptersOk = true;
  let charactersOk = true;
  let worldSettingsOk = true;
  let plotCardsOk = true;
  let foreshadowingsOk = true;

  for (const novel of novels) {
    const [ch, ct, ws, pc, fs] = await Promise.all([
      chaptersApi.list(novel.id).catch((err) => {
        chaptersOk = false;
        console.warn('拉取章节失败，保留本地章节数据:', err);
        return null;
      }),
      charactersApi.list(novel.id).catch((err) => {
        charactersOk = false;
        console.warn('拉取角色失败，保留本地角色数据:', err);
        return null;
      }),
      worldSettingsApi.list(novel.id).catch((err) => {
        worldSettingsOk = false;
        console.warn('拉取世界观失败，保留本地世界观数据:', err);
        return null;
      }),
      plotCardsApi.list(novel.id).catch((err) => {
        plotCardsOk = false;
        console.warn('拉取大纲失败，保留本地大纲数据:', err);
        return null;
      }),
      foreshadowingsApi.list(novel.id).catch((err) => {
        foreshadowingsOk = false;
        console.warn('拉取伏笔失败，保留本地伏笔数据:', err);
        return null;
      }),
    ]);

    if (ch) allChapters.push(...ch.chapters);
    if (ct) allCharacters.push(...ct.characters);
    if (ws) allWorldSettings.push(...ws.worldSettings);
    if (pc) allPlotCards.push(...pc.plotCards);
    if (fs) allForeshadowings.push(...fs.foreshadowings);
  }

  // 3. 转换后端数据为前端格式
  const frontendNovels = novels.map((n: any) => ({
    ...n,
    createdAt: new Date(n.createdAt).getTime(),
    updatedAt: new Date(n.updatedAt).getTime(),
  }));
  const frontendChapters = allChapters.map((c: any) => ({
    ...c,
    createdAt: new Date(c.createdAt).getTime(),
    updatedAt: new Date(c.updatedAt).getTime(),
  }));
  const frontendPlotCards = allPlotCards.map(normalizePlotCard);
  const frontendForeshadowings = allForeshadowings.map((f: any) => ({
    ...f,
    createdAt: new Date(f.createdAt).getTime(),
    updatedAt: new Date(f.updatedAt).getTime(),
  }));
  // 角色和世界观转 aliases 数组
  const frontendCharacters = allCharacters.map((c: any) => ({
    ...c,
    aliases: typeof c.aliases === 'string' ? JSON.parse(c.aliases || '[]') : c.aliases,
  }));

  // 4. 填充到 store。只有该类资源成功拉取时才覆盖本地，避免失败时误清空。
  if (setNovels) setNovels(frontendNovels);
  if (setChapters && chaptersOk) setChapters(frontendChapters);
  if (setCharacters && charactersOk) setCharacters(frontendCharacters);
  if (setWorldSettings && worldSettingsOk) setWorldSettings(allWorldSettings);
  if (setPlotCards && plotCardsOk) setPlotCards(frontendPlotCards);
  if (setForeshadowings && foreshadowingsOk) setForeshadowings(frontendForeshadowings);
}

/**
 * 从 localStorage 读取数据并上传到后端
 */
export async function importLocalDataToBackend(): Promise<{
  imported: { novels: number; chapters: number; characters: number; worldSettings: number; plotCards: number; foreshadowings: number };
}> {
  const raw = localStorage.getItem('novel-agent-storage');
  if (!raw) {
    return { imported: { novels: 0, chapters: 0, characters: 0, worldSettings: 0, plotCards: 0, foreshadowings: 0 } };
  }
  const parsed = JSON.parse(raw);
  const state = parsed?.state || {};

  const payload = {
    novels: state.novels || [],
    chapters: state.chapters || [],
    characters: state.characters || [],
    worldSettings: state.worldSettings || [],
    plotCards: state.plotCards || [],
    foreshadowings: state.foreshadowings || [],
  };

  const res = await migrateApi.importLocalData(payload);
  return res;
}

/**
 * 检查 localStorage 是否有可导入的数据
 */
export function hasLocalData(): boolean {
  const raw = localStorage.getItem('novel-agent-storage');
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    const state = parsed?.state || {};
    return (
      (state.novels?.length || 0) +
      (state.chapters?.length || 0) +
      (state.characters?.length || 0) +
      (state.worldSettings?.length || 0) +
      (state.plotCards?.length || 0) +
      (state.foreshadowings?.length || 0) >
      0
    );
  } catch {
    return false;
  }
}
