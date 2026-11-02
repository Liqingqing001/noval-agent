import { createStore } from 'zustand/vanilla';
import { storageKey } from '@/lib/runtime';
import { readReferenceWorkspace, writeReferenceWorkspace } from '@/lib/referencePersistence';
import { emptyBoard, remapBoardCharacter, validateCharacterBoard } from '@/lib/characterBoard';
import type { CharacterBoardData, CharacterNode, CharacterEdge } from '@/lib/characterBoard';

interface BoardState {
  data: CharacterBoardData; ready: boolean; saving: boolean; error: string; remaps: Record<string, string>;
  editNode: (id: string, patch: Partial<CharacterNode>) => void;
  saveEdge: (edge: CharacterEdge) => void;
  removeEdge: (id: string) => void;
  removeCharacter: (id: string) => void;
  layout: (positions: Record<string, CharacterNode>) => void;
  remap: (oldId: string, newId: string) => void;
  flush: () => Promise<void>;
  retry: () => void;
}
const boards = new Map<string, { novelId: string; store: ReturnType<typeof makeStore> }>();

function makeStore(key: string) {
  let pending: Promise<void> = Promise.resolve(), revision = 0;
  let loaded: Promise<void>;
  const store = createStore<BoardState>()((set, get) => {
    const commit = (data: CharacterBoardData) => {
      if (!get().ready) throw new Error('人物画布正在加载，请稍候。');
      validateCharacterBoard(data);
      const sequence = ++revision;
      set({ data, saving: true, error: '' });
      pending = pending.catch(() => {}).then(async () => { if (revision === sequence) await writeReferenceWorkspace(key, data); }).then(() => { if (revision === sequence) set({ saving: false, error: '' }); }).catch(() => { if (revision === sequence) set({ saving: false, error: '人物画布未保存，当前改动仍在页面；请导出备份并重试保存。' }); throw new Error('人物画布未保存，请重试。'); });
      void pending.catch(() => {});
    };
    return {
      data: emptyBoard(), ready: false, saving: false, error: '', remaps: {},
      editNode: (id, patch) => commit({ ...get().data, nodes: { ...get().data.nodes, [id]: { ...get().data.nodes[id], ...patch } } }),
      saveEdge: edge => {
        if (get().data.edges.some(item => item.id !== edge.id && item.source === edge.source && item.target === edge.target && item.label.trim() === edge.label.trim())) throw new Error('这条人物关系已经存在。');
        commit({ ...get().data, edges: [...get().data.edges.filter(item => item.id !== edge.id), edge] });
      },
      removeEdge: id => commit({ ...get().data, edges: get().data.edges.filter(edge => edge.id !== id) }),
      removeCharacter: id => { if (!get().ready) { void loaded.then(() => { if (get().ready) get().removeCharacter(id); }).catch(() => {}); return; } const nodes = { ...get().data.nodes }; delete nodes[id]; commit({ ...get().data, nodes, edges: get().data.edges.filter(edge => edge.source !== id && edge.target !== id) }); },
      layout: positions => commit({ ...get().data, nodes: { ...get().data.nodes, ...positions } }),
      remap: (oldId, newId) => { if (!get().ready) { void loaded.then(() => { if (get().ready) get().remap(oldId, newId); }).catch(() => {}); return; } set({ remaps: { ...get().remaps, [oldId]: newId } }); const data = get().data; if (data.nodes[oldId] || data.edges.some(edge => edge.source === oldId || edge.target === oldId)) commit(remapBoardCharacter(data, oldId, newId)); },
      flush: async () => { for (;;) { const write = pending; try { await write; } catch (error) { if (write === pending) throw error; } if (write === pending) return; } },
      retry: () => commit(get().data),
    };
  });
  loaded = (async () => {
    try { const data = await readReferenceWorkspace(key); store.setState({ data: data === undefined ? emptyBoard() : validateCharacterBoard(data), ready: true }); }
    catch { store.setState({ error: '人物画布无法读取，原记录未覆盖。请检查浏览器存储权限后刷新。' }); }
  })();
  return store;
}

export function characterBoardStore(namespace: string, novelId: string) {
  const key = `${storageKey('novel-agent-character-board')}:${namespace}:${novelId}`;
  if (!boards.has(key)) boards.set(key, { novelId, store: makeStore(key) });
  return boards.get(key)!.store;
}

export function remapCharacterBoards(novelId: string, oldId: string, newId: string) {
  for (const board of boards.values()) if (board.novelId === novelId) {
    try { board.store.getState().remap(oldId, newId); }
    catch { board.store.setState({ error: '人物已同步，但画布关联尚未保存，请重试保存画布。' }); }
  }
}

export function removeCharacterFromBoards(novelId: string, id: string) {
  for (const board of boards.values()) if (board.novelId === novelId) {
    try { board.store.getState().removeCharacter(id); }
    catch { board.store.setState({ error: '人物已删除，但画布关联清理尚未保存，请重试保存画布。' }); }
  }
}
