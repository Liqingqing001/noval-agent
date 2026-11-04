import { createStore } from 'zustand/vanilla';
import { storageKey, IS_DEMO } from '../lib/runtime';
import { useAuthStore } from './authStore';
import { applyHistoryOperation, chapterVersion, readChapterHistory } from '../lib/chapterHistory';
import type { ChapterHistoryData, ChapterVersion, ChapterVersionKind, HistoryOperation } from '../lib/chapterHistory';
import type { Chapter } from '../types';

export const CHAPTER_HISTORY_DATABASE = 'novel-agent-chapter-history-v1';
const OBJECT_STORE = 'workspaces';
interface HistoryAdapter { read: () => Promise<unknown>; write: (data: ChapterHistoryData) => Promise<void>; apply?: (operations: HistoryOperation[]) => Promise<ChapterHistoryData> }
export interface ChapterHistoryState {
  versions: ChapterVersion[]; ready: boolean; saving: boolean; error: string;
  capture: (chapter: Chapter, kind?: ChapterVersionKind, label?: string) => Promise<void>;
  remapChapter: (novelId: string, chapterId: string, nextId: string) => Promise<void>;
  remapNovel: (novelId: string, nextId: string) => Promise<void>;
  flush: () => Promise<void>; retry: () => Promise<void>;
}
async function openHistoryDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CHAPTER_HISTORY_DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(OBJECT_STORE)) request.result.createObjectStore(OBJECT_STORE); };
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    request.onerror = () => reject(new Error('无法打开章节版本库，请检查浏览器存储权限。'));
    request.onblocked = () => { blocked = true; reject(new Error('章节版本库被其他标签页占用，请关闭旧页面后重试。')); };
  });
}
function historyAdapter(key: string): HistoryAdapter {
  if (typeof indexedDB === 'undefined') {
    let memory: ChapterHistoryData | undefined;
    return { read: async () => memory, write: async data => { if (typeof window !== 'undefined') throw new Error('此浏览器无法使用版本库，请导出当前历史备份。'); memory = structuredClone(data); } };
  }
  const transaction = async (mode: IDBTransactionMode, data?: ChapterHistoryData): Promise<unknown> => {
    const database = await openHistoryDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const tx = database.transaction(OBJECT_STORE, mode), store = tx.objectStore(OBJECT_STORE);
        const request = data ? store.put(data, key) : store.get(key);
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = tx.onabort = () => reject(new Error('章节历史未保存，浏览器空间不足或不允许写入；当前历史仍保留在页面，请导出备份后重试。'));
      });
    } finally { database.close(); }
  };
  return { read: () => transaction('readonly'), write: async data => { await transaction('readwrite', data); }, apply: async operations => {
    const database = await openHistoryDatabase();
    try {
      return await new Promise<ChapterHistoryData>((resolve, reject) => {
        const tx = database.transaction(OBJECT_STORE, 'readwrite'), objectStore = tx.objectStore(OBJECT_STORE);
        const request = objectStore.get(key);
        let next: ChapterHistoryData, failure: Error | undefined;
        request.onsuccess = () => {
          try {
            const base = request.result === undefined ? { version: 1 as const, versions: [] } : readChapterHistory(request.result);
            next = operations.reduce((data, operation) => applyHistoryOperation(data, operation), base);
            objectStore.put(next, key);
          } catch (error) { failure = error instanceof Error ? error : new Error('章节历史未保存。'); tx.abort(); }
        };
        tx.oncomplete = () => resolve(next);
        tx.onerror = tx.onabort = () => reject(failure || new Error('章节历史未保存，浏览器空间不足或不允许写入；当前快照仍可导出。'));
      });
    } finally { database.close(); }
  } };
}

export function createChapterHistoryStore(namespace: string, adapter = historyAdapter(`${storageKey('novel-agent-chapter-history')}:${namespace}`), now = Date.now) {
  const key = `${storageKey('novel-agent-chapter-history')}:${namespace}`;
  let durable: ChapterHistoryData = { version: 1, versions: [] };
  const pending: HistoryOperation[] = [];
  let readingError = false, drain: Promise<void> = Promise.resolve();
  const store = createStore<ChapterHistoryState>()(() => ({
    versions: [], ready: false, saving: false, error: '',
    capture: (chapter, kind = 'automatic', label = '') => enqueue({ type: 'capture', version: chapterVersion({ ...chapter }, kind, label, now()) }),
    remapChapter: (novelId, chapterId, nextId) => enqueue({ type: 'remap', novelId, chapterId, nextId }),
    remapNovel: (novelId, nextId) => enqueue({ type: 'remap-novel', novelId, nextId }),
    flush: () => schedule(),
    retry: () => schedule(true),
  }));
  // The soft storage cap must never discard the only copy of a deleted chapter.
  // Over-cap snapshots remain visible/exportable in memory while persistence reports failure.
  const optimistic = () => pending.reduce((data, operation) => applyHistoryOperation(data, operation, false), durable);
  const load = (async () => {
    try { const raw = await adapter.read(); if (raw !== undefined) durable = readChapterHistory(raw); }
    catch (error) { readingError = true; store.setState({ error: error instanceof Error ? error.message : '章节历史无法读取，原数据没有被覆盖。' }); }
    try { store.setState({ versions: optimistic().versions, ready: true }); }
    catch (error) { store.setState({ ready: true, error: error instanceof Error ? error.message : '章节历史无法保存。' }); }
  })();
  function enqueue(operation: HistoryOperation): Promise<void> {
    pending.push(operation);
    try { store.setState({ versions: optimistic().versions, saving: true }); }
    catch (error) { pending.pop(); store.setState({ saving: false, error: error instanceof Error ? error.message : '章节历史未保存，请先导出备份。' }); return Promise.reject(error); }
    return schedule();
  }
  function schedule(reload = false): Promise<void> {
    const run = async () => {
      await load;
      if (reload) {
        try {
          const raw = await adapter.read();
          durable = raw === undefined ? { version: 1, versions: [] } : readChapterHistory(raw);
          readingError = false;
          store.setState({ versions: optimistic().versions, error: '' });
        } catch (error) {
          readingError = true;
          const message = error instanceof Error ? error.message : '章节历史无法读取，原数据未覆盖。';
          store.setState({ error: message, saving: false });
          throw new Error(message);
        }
      }
      if (readingError) { store.setState({ saving: false }); throw new Error(store.getState().error || '原有版本历史无法读取，未覆盖原数据。'); }
      if (!pending.length) { store.setState({ saving: false }); return; }
      const persist = async () => {
        const batch = pending.slice();
        let next: ChapterHistoryData;
        if (adapter.apply) next = await adapter.apply(batch);
        else {
          const raw = await adapter.read();
          const base = raw === undefined ? { version: 1 as const, versions: [] } : readChapterHistory(raw);
          next = batch.reduce((data, operation) => applyHistoryOperation(data, operation), base);
          await adapter.write(next);
        }
        durable = next;
        pending.splice(0, batch.length);
        store.setState({ versions: optimistic().versions, saving: pending.length > 0, error: '' });
      };
      try {
        if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request(`${key}:write`, persist);
        else await persist();
      } catch (error) {
        const message = error instanceof Error ? error.message : '章节历史未保存，请导出备份并重试。';
        store.setState({ saving: false, error: message });
        throw new Error(message);
      }
    };
    const next = drain.catch(() => {}).then(run);
    drain = next;
    void next.catch(() => {});
    return next;
  }
  return store;
}

export const chapterHistoryNamespace = () => IS_DEMO ? 'demo' : useAuthStore.getState().user?.id || 'local';
const stores = new Map<string, ReturnType<typeof createChapterHistoryStore>>();
export function getChapterHistoryStore(namespace = chapterHistoryNamespace()) {
  let store = stores.get(namespace);
  if (!store) { store = createChapterHistoryStore(namespace); stores.set(namespace, store); }
  return store;
}
/** Snapshot immutable pre-change data synchronously; persistence failures remain visible in the store. */
export function captureChapterHistory(chapter: Chapter | undefined, kind: ChapterVersionKind = 'automatic', label = '') {
  if (chapter) void getChapterHistoryStore().getState().capture(chapter, kind, label).catch(() => {});
}
export function remapChapterHistory(novelId: string, chapterId: string, nextId: string, namespace = chapterHistoryNamespace()) { void getChapterHistoryStore(namespace).getState().remapChapter(novelId, chapterId, nextId).catch(() => {}); }
export function remapNovelHistory(novelId: string, nextId: string, namespace = chapterHistoryNamespace()) { void getChapterHistoryStore(namespace).getState().remapNovel(novelId, nextId).catch(() => {}); }

if (typeof window !== 'undefined') window.addEventListener('beforeunload', event => {
  const state = stores.get(chapterHistoryNamespace())?.getState();
  if (state?.saving || state?.error) { event.preventDefault(); event.returnValue = ''; }
});
