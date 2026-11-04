import { createStore } from 'zustand/vanilla';
import { storageKey } from '../lib/runtime';
import { validateTimelineDraft } from '../lib/characterTimeline';
import type { TimelineEntry } from '../types/timeline';

export const TIMELINE_RECORD_LIMIT = 1000;
const TIMELINE_STORAGE_LIMIT = 2_000_000;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
interface TimelineState {
  entries: TimelineEntry[];
  error: string;
  unreadable: boolean;
  save: (entry: TimelineEntry) => void;
  remove: (id: string, novelId: string) => void;
  retrySave: () => void;
  remapReference: (kind: 'chapterId' | 'characterId' | 'novelId', oldId: string, newId: string, novelId: string) => void;
}

function validateEntries(value: unknown): TimelineEntry[] {
  if (!value || typeof value !== 'object' || (value as { version?: number }).version !== 1 || !Array.isArray((value as { entries?: unknown }).entries)) throw new Error('时间线数据格式无法识别。');
  const entries = (value as { entries: unknown[] }).entries;
  if (entries.length > TIMELINE_RECORD_LIMIT) throw new Error('时间线记录数量过多。');
  const ids = new Set<string>();
  return entries.map(candidate => {
    if (!candidate || typeof candidate !== 'object') throw new Error('时间线记录格式无法识别。');
    const entry = candidate as TimelineEntry;
    for (const field of ['id', 'novelId', 'characterId', 'chapterId', 'sourceFingerprint'] as const) if (typeof entry[field] !== 'string' || !entry[field] || entry[field].length > 200) throw new Error('时间线引用格式无法识别。');
    if (ids.has(entry.id)) throw new Error('时间线记录 ID 重复。');
    ids.add(entry.id);
    if (!['manual', 'ai-reviewed'].includes(entry.origin) || !Number.isFinite(entry.createdAt) || !Number.isFinite(entry.updatedAt)) throw new Error('时间线记录来源或时间无效。');
    return { ...validateTimelineDraft(entry), id: entry.id, novelId: entry.novelId, characterId: entry.characterId, chapterId: entry.chapterId, sourceFingerprint: entry.sourceFingerprint, origin: entry.origin, createdAt: entry.createdAt, updatedAt: entry.updatedAt };
  });
}

export function createTimelineStore(namespace: string, options: { storage?: StorageLike | null; key?: string } = {}) {
  const key = options.key || `${storageKey('novel-agent-timeline')}:${namespace}`;
  let storage: StorageLike | undefined, entries: TimelineEntry[] = [], error = '', unreadable = false;
  try {
    storage = options.storage === null ? undefined : options.storage || (typeof localStorage === 'undefined' ? undefined : localStorage);
    const raw = storage?.getItem(key);
    if (raw) { if (raw.length > TIMELINE_STORAGE_LIMIT) throw new Error(); entries = validateEntries(JSON.parse(raw)); }
  } catch { unreadable = true; error = '时间线无法读取，原数据未被覆盖。请保留浏览器数据并检查存储权限。'; }
  return createStore<TimelineState>()((set, get) => {
    const latestEntries = () => {
      if (!storage) return get().entries;
      try {
        const raw = storage.getItem(key);
        if (raw && raw.length > TIMELINE_STORAGE_LIMIT) throw new Error('too large');
        return raw ? validateEntries(JSON.parse(raw)) : [];
      } catch { set({ unreadable: true, error: '时间线无法读取，原数据未被覆盖。请保留浏览器数据并检查存储权限。' }); throw new Error('时间线无法读取，未覆盖原数据。'); }
    };
    const commit = (next: TimelineEntry[]) => {
      if (get().unreadable) throw new Error(get().error);
      const validated = validateEntries({ version: 1, entries: next });
      const raw = JSON.stringify({ version: 1, entries: validated });
      if (raw.length > TIMELINE_STORAGE_LIMIT) throw new Error('时间线空间已满，请先导出并删除不需要的状态记录。');
      try { if (!storage && typeof window !== 'undefined' && options.storage !== null) throw new Error('storage unavailable'); storage?.setItem(key, raw); }
      catch { set({ error: '时间线保存失败，当前表单仍保留，请导出备份或释放浏览器空间后重试。' }); throw new Error('时间线保存失败，请检查浏览器空间后重试。'); }
      set({ entries: validated, error: '' });
    };
    return { entries, error, unreadable,
      save: entry => {
        const latest = latestEntries(), old = latest.find(row => row.id === entry.id);
        if (old && (old.novelId !== entry.novelId || old.characterId !== entry.characterId)) throw new Error('不能将已有状态移动到另一本书或其他人物。');
        commit([...latest.filter(row => row.id !== entry.id), entry]);
      },
      remove: (id, novelId) => commit(latestEntries().filter(entry => entry.id !== id || entry.novelId !== novelId)),
      retrySave: () => commit(latestEntries()),
      remapReference: (kind, oldId, newId, novelId) => commit(latestEntries().map(entry => entry.novelId === novelId && entry[kind] === oldId ? { ...entry, [kind]: newId } : entry)),
    };
  });
}

const workspaces = new Map<string, ReturnType<typeof createTimelineStore>>();
export function getTimelineStore(namespace: string) {
  let store = workspaces.get(namespace);
  if (!store) { store = createTimelineStore(namespace); workspaces.set(namespace, store); }
  return store;
}
export function remapTimelineChapter(oldId: string, newId: string, novelId: string) {
  for (const store of workspaces.values()) if (store.getState().entries.some(row => row.novelId === novelId && row.chapterId === oldId)) {
    try { store.getState().remapReference('chapterId', oldId, newId, novelId); } catch { /* Existing source reference stays visible as missing if local storage failed. */ }
  }
}
export function remapTimelineCharacter(oldId: string, newId: string, novelId: string) {
  for (const store of workspaces.values()) if (store.getState().entries.some(row => row.novelId === novelId && row.characterId === oldId)) {
    try { store.getState().remapReference('characterId', oldId, newId, novelId); } catch { /* Do not match by name or sequence on failure. */ }
  }
}

export function remapTimelineNovel(oldId: string, newId: string) {
  for (const store of workspaces.values()) if (store.getState().entries.some(row => row.novelId === oldId)) {
    try { store.getState().remapReference('novelId', oldId, newId, oldId); } catch { /* Keep failed remapping visibly unresolved. */ }
  }
}
