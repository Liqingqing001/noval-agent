import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Novel, Chapter, Character, WorldSetting, Session, ViewType, PlotCard, Foreshadowing } from '@/types';
import { getToken } from '@/api/client';
import { novelsApi } from '@/api/novels';
import { chaptersApi } from '@/api/chapters';
import { charactersApi } from '@/api/characters';
import { worldSettingsApi } from '@/api/worldSettings';
import { plotCardsApi } from '@/api/plotCards';
import { foreshadowingsApi } from '@/api/foreshadowings';

interface NovelState {
  // Current selection
  currentNovelId: string | null;
  currentChapterId: string | null;
  currentView: ViewType;

  // Data
  novels: Novel[];
  chapters: Chapter[];
  characters: Character[];
  worldSettings: WorldSetting[];
  sessions: Session[];
  plotCards: PlotCard[];
  foreshadowings: Foreshadowing[];

  // Actions
  setCurrentNovel: (id: string | null) => void;
  setCurrentChapter: (id: string | null) => void;
  setCurrentView: (view: ViewType) => void;

  // 批量替换 + 清空（与后端同步用）
  setNovels: (novels: Novel[]) => void;
  setChapters: (chapters: Chapter[]) => void;
  setCharacters: (characters: Character[]) => void;
  setWorldSettings: (worldSettings: WorldSetting[]) => void;
  setPlotCards: (plotCards: PlotCard[]) => void;
  setForeshadowings: (foreshadowings: Foreshadowing[]) => void;
  setSessions: (sessions: Session[]) => void;
  clearAll: () => void;

  // Novel actions
  addNovel: (novel: Omit<Novel, 'id' | 'createdAt' | 'updatedAt'>) => Novel;
  updateNovel: (id: string, updates: Partial<Novel>) => void;
  deleteNovel: (id: string) => void;

  // Chapter actions
  addChapter: (chapter: Omit<Chapter, 'id' | 'createdAt' | 'updatedAt'>) => Chapter;
  updateChapter: (id: string, updates: Partial<Chapter>) => void;
  deleteChapter: (id: string) => void;

  // Character actions
  addCharacter: (character: Omit<Character, 'id'>) => Character;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
  deleteCharacter: (id: string) => void;

  // World setting actions
  addWorldSetting: (setting: Omit<WorldSetting, 'id'>) => WorldSetting;
  updateWorldSetting: (id: string, updates: Partial<WorldSetting>) => void;
  deleteWorldSetting: (id: string) => void;

  // Session actions
  addSession: (session: Omit<Session, 'id' | 'createdAt' | 'updatedAt'>) => Session;
  updateSession: (id: string, updates: Partial<Session>) => void;
  deleteSession: (id: string) => void;

  // PlotCard actions
  addPlotCard: (plotCard: Omit<PlotCard, 'id' | 'createdAt' | 'updatedAt'>) => PlotCard;
  updatePlotCard: (id: string, updates: Partial<PlotCard>) => void;
  deletePlotCard: (id: string) => void;
  reorderPlotCards: (novelId: string, orderedIds: string[]) => void;

  // Foreshadowing actions
  addForeshadowing: (foreshadowing: Omit<Foreshadowing, 'id' | 'createdAt' | 'updatedAt'>) => Foreshadowing;
  updateForeshadowing: (id: string, updates: Partial<Foreshadowing>) => void;
  deleteForeshadowing: (id: string) => void;

  // Getters
  getCurrentNovel: () => Novel | undefined;
  getCurrentChapter: () => Chapter | undefined;
  getNovelChapters: (novelId: string) => Chapter[];
  getNovelCharacters: (novelId: string) => Character[];
  getNovelWorldSettings: (novelId: string) => WorldSetting[];
  getNovelSessions: (novelId: string) => Session[];
  getNovelPlotCards: (novelId: string) => PlotCard[];
  getNovelForeshadowings: (novelId: string) => Foreshadowing[];
}

const generateId = () => Math.random().toString(36).substring(2, 15);
const isCloudEnabled = () => !!getToken();
const toTimestamp = (value: string | number | Date | undefined) => {
  if (!value) return Date.now();
  if (typeof value === 'number') return value;
  return new Date(value).getTime();
};

export const useNovelStore = create<NovelState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentNovelId: null,
      currentChapterId: null,
      currentView: 'chapters',
      novels: [],
      chapters: [],
      characters: [],
      worldSettings: [],
      sessions: [],
      plotCards: [],
      foreshadowings: [],

      // Selection actions
      setCurrentNovel: (id) => set({ currentNovelId: id, currentChapterId: null }),
      setCurrentChapter: (id) => set({ currentChapterId: id }),
      setCurrentView: (view) => set({ currentView: view }),

      // 批量替换（用于从后端拉取数据后填充）
      setNovels: (novels) => set({ novels }),
      setChapters: (chapters) => set({ chapters }),
      setCharacters: (characters) => set({ characters }),
      setWorldSettings: (worldSettings) => set({ worldSettings }),
      setPlotCards: (plotCards) => set({ plotCards }),
      setForeshadowings: (foreshadowings) => set({ foreshadowings }),
      setSessions: (sessions) => set({ sessions }),

      // 清空所有数据（登出时）
      clearAll: () =>
        set({
          novels: [],
          chapters: [],
          characters: [],
          worldSettings: [],
          plotCards: [],
          foreshadowings: [],
          sessions: [],
          currentNovelId: null,
          currentChapterId: null,
        }),

      // Novel actions
      addNovel: (novel) => {
        const newNovel: Novel = {
          ...novel,
          id: generateId(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({ novels: [...state.novels, newNovel] }));

        // 云端同步：登录状态下异步创建，并用服务端 id 替换本地临时 id
        if (isCloudEnabled()) {
          novelsApi.create(novel as any).then(({ novel: saved }) => {
            const mapped: Novel = {
              ...saved,
              status: saved.status as Novel['status'],
              genre: saved.genre || undefined,
              summary: saved.summary || undefined,
              agentPrompt: saved.agentPrompt || undefined,
              cover: saved.cover || undefined,
              lastOpenedChapterId: saved.lastOpenedChapterId || undefined,
              createdAt: toTimestamp(saved.createdAt),
              updatedAt: toTimestamp(saved.updatedAt),
            };
            set((state) => ({
              novels: state.novels.map((n) => (n.id === newNovel.id ? mapped : n)),
              currentNovelId: state.currentNovelId === newNovel.id ? mapped.id : state.currentNovelId,
            }));
          }).catch((err) => console.error('云端创建小说失败:', err));
        }

        return newNovel;
      },
      updateNovel: (id, updates) => {
        set((state) => ({
          novels: state.novels.map((n) =>
            n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n
          ),
        }));
        if (isCloudEnabled() && !id.startsWith('temp-')) {
          novelsApi.update(id, updates as any).catch((err) => console.error('云端更新小说失败:', err));
        }
      },
      deleteNovel: (id) => {
        set((state) => ({
          novels: state.novels.filter((n) => n.id !== id),
          chapters: state.chapters.filter((c) => c.novelId !== id),
          characters: state.characters.filter((c) => c.novelId !== id),
          worldSettings: state.worldSettings.filter((w) => w.novelId !== id),
          sessions: state.sessions.filter((s) => s.novelId !== id),
          plotCards: state.plotCards.filter((p) => p.novelId !== id),
          foreshadowings: state.foreshadowings.filter((f) => f.novelId !== id),
        }));
        if (get().currentNovelId === id) {
          set({ currentNovelId: null, currentChapterId: null });
        }
        if (isCloudEnabled() && !id.startsWith('temp-')) {
          novelsApi.remove(id).catch((err) => console.error('云端删除小说失败:', err));
        }
      },

      // Chapter actions
      addChapter: (chapter) => {
        const newChapter: Chapter = {
          ...chapter,
          id: generateId(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => {
          const newChapters = [...state.chapters, newChapter];
          const novelWordCount = newChapters
            .filter(c => c.novelId === chapter.novelId)
            .reduce((sum, c) => sum + (c.wordCount || 0), 0);
          const updatedNovels = state.novels.map(n =>
            n.id === chapter.novelId ? { ...n, wordCount: novelWordCount } : n
          );
          return { chapters: newChapters, novels: updatedNovels };
        });
        if (isCloudEnabled() && !chapter.novelId.startsWith('temp-')) {
          chaptersApi.create(chapter.novelId, chapter as any).then(({ chapter: saved }) => {
            const mapped: Chapter = {
              ...saved,
              createdAt: toTimestamp(saved.createdAt),
              updatedAt: toTimestamp(saved.updatedAt),
            };
            set((state) => ({
              chapters: state.chapters.map((c) => c.id === newChapter.id ? mapped : c),
              currentChapterId: state.currentChapterId === newChapter.id ? mapped.id : state.currentChapterId,
            }));
          }).catch((err) => console.error('云端创建章节失败:', err));
        }
        return newChapter;
      },
      updateChapter: (id, updates) => {
        set((state) => {
          const newChapters = state.chapters.map((c) =>
            c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
          );
          if (updates.wordCount !== undefined) {
            const chapter = state.chapters.find(c => c.id === id);
            if (chapter) {
              const novelWordCount = newChapters
                .filter(c => c.novelId === chapter.novelId)
                .reduce((sum, c) => sum + (c.wordCount || 0), 0);
              const updatedNovels = state.novels.map(n =>
                n.id === chapter.novelId ? { ...n, wordCount: novelWordCount } : n
              );
              return { chapters: newChapters, novels: updatedNovels };
            }
          }
          return { chapters: newChapters };
        });
        if (isCloudEnabled() && !id.startsWith('temp-')) {
          chaptersApi.update(id, updates as any).catch((err) => console.error('云端更新章节失败:', err));
        }
      },
      deleteChapter: (id) => {
        set((state) => {
          const chapter = state.chapters.find(c => c.id === id);
          const newChapters = state.chapters.filter((c) => c.id !== id);
          if (chapter) {
            const novelWordCount = newChapters
              .filter(c => c.novelId === chapter.novelId)
              .reduce((sum, c) => sum + (c.wordCount || 0), 0);
            const updatedNovels = state.novels.map(n =>
              n.id === chapter.novelId ? { ...n, wordCount: novelWordCount } : n
            );
            return {
              chapters: newChapters,
              novels: updatedNovels,
              currentChapterId: state.currentChapterId === id ? null : state.currentChapterId
            };
          }
          return { chapters: newChapters };
        });
        if (isCloudEnabled() && !id.startsWith('temp-')) {
          chaptersApi.remove(id).catch((err) => console.error('云端删除章节失败:', err));
        }
      },

      // Character actions
      addCharacter: (character) => {
        const newCharacter: Character = { ...character, id: generateId() };
        set((state) => ({ characters: [...state.characters, newCharacter] }));
        if (isCloudEnabled() && !character.novelId.startsWith('temp-')) {
          charactersApi.create(character.novelId, character as any).then(({ character: saved }) => {
            const mapped: Character = {
              ...saved,
              aliases: typeof saved.aliases === 'string' ? JSON.parse(saved.aliases || '[]') : saved.aliases,
              description: saved.description || '',
              appearance: saved.appearance || undefined,
              personality: saved.personality || undefined,
              background: saved.background || undefined,
              firstAppearanceChapterId: saved.firstAppearanceChapterId || undefined,
              role: (saved.role as Character['role']) || 'supporting',
              sequence: saved.sequence || 0,
            };
            set((state) => ({ characters: state.characters.map((c) => c.id === newCharacter.id ? mapped : c) }));
          }).catch((err) => console.error('云端创建角色失败:', err));
        }
        return newCharacter;
      },
      updateCharacter: (id, updates) => {
        set((state) => ({
          characters: state.characters.map((c) => c.id === id ? { ...c, ...updates } : c),
        }));
        if (isCloudEnabled() && !id.startsWith('temp-')) {
          charactersApi.update(id, updates as any).catch((err) => console.error('云端更新角色失败:', err));
        }
      },
      deleteCharacter: (id) => {
        set((state) => ({ characters: state.characters.filter((c) => c.id !== id) }));
        if (isCloudEnabled() && !id.startsWith('temp-')) {
          charactersApi.remove(id).catch((err) => console.error('云端删除角色失败:', err));
        }
      },

      // World setting actions
      addWorldSetting: (setting) => {
        const newSetting: WorldSetting = { ...setting, id: generateId() };
        set((state) => ({ worldSettings: [...state.worldSettings, newSetting] }));
        if (isCloudEnabled() && !setting.novelId.startsWith('temp-')) {
          worldSettingsApi.create(setting.novelId, setting as any).then(({ worldSetting: saved }) => {
            set((state) => ({ worldSettings: state.worldSettings.map((w) => w.id === newSetting.id ? saved : w) }));
          }).catch((err) => console.error('云端创建世界观失败:', err));
        }
        return newSetting;
      },
      updateWorldSetting: (id, updates) => {
        set((state) => ({
          worldSettings: state.worldSettings.map((w) => w.id === id ? { ...w, ...updates } : w),
        }));
        if (isCloudEnabled() && !id.startsWith('temp-')) {
          worldSettingsApi.update(id, updates as any).catch((err) => console.error('云端更新世界观失败:', err));
        }
      },
      deleteWorldSetting: (id) => {
        set((state) => ({ worldSettings: state.worldSettings.filter((w) => w.id !== id) }));
        if (isCloudEnabled() && !id.startsWith('temp-')) {
          worldSettingsApi.remove(id).catch((err) => console.error('云端删除世界观失败:', err));
        }
      },

      // Session actions
      addSession: (session) => {
        const newSession: Session = {
          ...session,
          id: generateId(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({ sessions: [...state.sessions, newSession] }));
        return newSession;
      },
      updateSession: (id, updates) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
          ),
        }));
      },
      deleteSession: (id) => {
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
        }));
      },

      // PlotCard actions
      addPlotCard: (plotCard) => {
        const newPlotCard: PlotCard = {
          ...plotCard,
          id: generateId(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({ plotCards: [...state.plotCards, newPlotCard] }));
        if (isCloudEnabled() && !plotCard.novelId.startsWith('temp-')) {
          plotCardsApi.create(plotCard.novelId, plotCard as any).then(({ plotCard: saved }) => {
            const mapped: PlotCard = {
              ...saved,
              type: saved.type as PlotCard['type'],
              status: saved.status as PlotCard['status'],
              volumeId: saved.volumeId || undefined,
              chapterId: saved.chapterId || undefined,
              createdAt: toTimestamp(saved.createdAt),
              updatedAt: toTimestamp(saved.updatedAt),
            };
            set((state) => ({ plotCards: state.plotCards.map((p) => p.id === newPlotCard.id ? mapped : p) }));
          }).catch((err) => console.error('云端创建大纲失败:', err));
        }
        return newPlotCard;
      },
      updatePlotCard: (id, updates) => {
        set((state) => ({
          plotCards: state.plotCards.map((p) => p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p),
        }));
        if (isCloudEnabled() && !id.startsWith('temp-')) {
          plotCardsApi.update(id, updates as any).catch((err) => console.error('云端更新大纲失败:', err));
        }
      },
      deletePlotCard: (id) => {
        set((state) => ({ plotCards: state.plotCards.filter((p) => p.id !== id) }));
        if (isCloudEnabled() && !id.startsWith('temp-')) {
          plotCardsApi.remove(id).catch((err) => console.error('云端删除大纲失败:', err));
        }
      },
      reorderPlotCards: (novelId, orderedIds) => {
        set((state) => ({
          plotCards: state.plotCards.map((p) => {
            if (p.novelId === novelId) {
              const newSequence = orderedIds.indexOf(p.id);
              if (isCloudEnabled() && newSequence >= 0 && !p.id.startsWith('temp-')) {
                plotCardsApi.update(p.id, { sequence: newSequence } as any).catch(() => {});
              }
              return { ...p, sequence: newSequence >= 0 ? newSequence : p.sequence };
            }
            return p;
          }),
        }));
      },

      // Foreshadowing actions
      addForeshadowing: (foreshadowing) => {
        const newForeshadowing: Foreshadowing = {
          ...foreshadowing,
          id: generateId(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({ foreshadowings: [...state.foreshadowings, newForeshadowing] }));
        if (isCloudEnabled() && !foreshadowing.novelId.startsWith('temp-')) {
          foreshadowingsApi.create(foreshadowing.novelId, foreshadowing as any).then(({ foreshadowing: saved }) => {
            const mapped: Foreshadowing = {
              ...saved,
              status: saved.status as Foreshadowing['status'],
              plantedChapterId: saved.plantedChapterId || undefined,
              resolvedChapterId: saved.resolvedChapterId || undefined,
              plantedPlotCardId: saved.plantedPlotCardId || undefined,
              resolvedPlotCardId: saved.resolvedPlotCardId || undefined,
              createdAt: toTimestamp(saved.createdAt),
              updatedAt: toTimestamp(saved.updatedAt),
            };
            set((state) => ({ foreshadowings: state.foreshadowings.map((f) => f.id === newForeshadowing.id ? mapped : f) }));
          }).catch((err) => console.error('云端创建伏笔失败:', err));
        }
        return newForeshadowing;
      },
      updateForeshadowing: (id, updates) => {
        set((state) => ({
          foreshadowings: state.foreshadowings.map((f) => f.id === id ? { ...f, ...updates, updatedAt: Date.now() } : f),
        }));
        if (isCloudEnabled() && !id.startsWith('temp-')) {
          foreshadowingsApi.update(id, updates as any).catch((err) => console.error('云端更新伏笔失败:', err));
        }
      },
      deleteForeshadowing: (id) => {
        set((state) => ({ foreshadowings: state.foreshadowings.filter((f) => f.id !== id) }));
        if (isCloudEnabled() && !id.startsWith('temp-')) {
          foreshadowingsApi.remove(id).catch((err) => console.error('云端删除伏笔失败:', err));
        }
      },

      // Getters
      getCurrentNovel: () => {
        const { currentNovelId, novels } = get();
        return novels.find((n) => n.id === currentNovelId);
      },
      getCurrentChapter: () => {
        const { currentChapterId, chapters } = get();
        return chapters.find((c) => c.id === currentChapterId);
      },
      getNovelChapters: (novelId) => {
        return get().chapters
          .filter((c) => c.novelId === novelId)
          .sort((a, b) => a.sequence - b.sequence);
      },
      getNovelCharacters: (novelId) => {
        return get().characters.filter((c) => c.novelId === novelId);
      },
      getNovelWorldSettings: (novelId) => {
        return get().worldSettings.filter((w) => w.novelId === novelId);
      },
      getNovelSessions: (novelId) => {
        return get().sessions
          .filter((s) => s.novelId === novelId)
          .sort((a, b) => b.updatedAt - a.updatedAt);
      },
      getNovelPlotCards: (novelId) => {
        return get().plotCards
          .filter((p) => p.novelId === novelId)
          .sort((a, b) => a.sequence - b.sequence);
      },
      getNovelForeshadowings: (novelId) => {
        return get().foreshadowings
          .filter((f) => f.novelId === novelId)
          .sort((a, b) => a.createdAt - b.createdAt);
      },
    }),
    {
      name: 'novel-agent-storage',
      partialize: (state) => ({
        novels: state.novels,
        chapters: state.chapters,
        characters: state.characters,
        worldSettings: state.worldSettings,
        sessions: state.sessions,
        plotCards: state.plotCards,
        foreshadowings: state.foreshadowings,
        currentNovelId: state.currentNovelId,
        currentChapterId: state.currentChapterId,
        currentView: state.currentView,
      }),
      migrate: (persistedState: any) => {
        const state = persistedState as Partial<NovelState>;
        return {
          ...state,
          // 兼容旧版三幕式大纲：没有 type 的旧 plotCard 视为章节大纲；旧状态统一映射为 pending/completed。
          plotCards: (state.plotCards || []).map((p: any) => ({
            ...p,
            type: p.type || 'chapter',
            status: p.status === 'completed' ? 'completed' : 'pending',
            volumeId: p.volumeId || undefined,
          })),
        };
      },
    }
  )
);
