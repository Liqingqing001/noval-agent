import { createStore } from 'zustand/vanilla';
import { storageKey } from '@/lib/runtime';
import { defaultReferenceBrief, parseReferenceSource, parseReferenceReport } from '@/lib/referenceCreation';
import type { ReferenceProject } from '@/types/reference';
import { readReferenceWorkspace, writeReferenceWorkspace } from '@/lib/referencePersistence';

interface ReferenceState {
  projects: ReferenceProject[]; currentId: string | null; warning: string;
  ready: boolean; saving: boolean; saveError: string;
  flush: () => Promise<void>;
  add: (title: string, source: string, sourceHash: string) => string;
  select: (id: string | null) => void;
  update: (id: string, patch: Partial<ReferenceProject>) => void;
  remove: (id: string) => void;
  resetUnreadable: () => void;
}
export function createReferenceWorkspace(namespace: string) {
  const key = `${storageKey('novel-agent-reference')}:${namespace}`;
  const useDatabase = typeof indexedDB !== 'undefined';
  let initial: { projects: ReferenceProject[]; currentId: string | null } = { projects: [], currentId: null };
  let warning = '';
  const validate = (data: any) => {
      if (data.version !== 1 || !Array.isArray(data.projects) || data.projects.length > 10 || JSON.stringify(data).length > 20000000) throw new Error();
      for (const project of data.projects) {
        if (typeof project.id !== 'string' || typeof project.title !== 'string' || typeof project.sourceHash !== 'string' || !project.brief || !Array.isArray(project.imports)) throw new Error();
        const parsed = parseReferenceSource(project.source);
        for (const field of ['style', 'methods', 'outline']) if (typeof project[field] !== 'string') throw new Error();
        for (const field of ['topic', 'audience', 'title', 'requirements']) if (typeof project.brief[field] !== 'string') throw new Error();
        if (!['both', 'style', 'structure'].includes(project.brief.mode) || typeof project.brief.min !== 'number' || typeof project.brief.max !== 'number') throw new Error();
        if (project.draft && (typeof project.draft.text !== 'string' || typeof project.draft.context !== 'string')) throw new Error();
        if (project.lastAttempt && (typeof project.lastAttempt.text !== 'string' || typeof project.lastAttempt.error !== 'string')) throw new Error();
        if (project.imports.some((item: ReferenceProject['imports'][number]) => typeof item.hash !== 'string' || typeof item.novelId !== 'string' || typeof item.chapterId !== 'string')) throw new Error();
        const range = project.analyzedRange;
        if (range && (!Number.isInteger(range.from) || !Number.isInteger(range.to) || range.from < 1 || range.to > parsed.paragraphs.length || range.from > range.to)) throw new Error();
        if (project.report) project.report = parseReferenceReport(JSON.stringify(project.report), range ? parsed.paragraphs.slice(range.from - 1, range.to) : parsed.paragraphs);
      }
      return { projects: data.projects as ReferenceProject[], currentId: data.projects.some((project: ReferenceProject) => project.id === data.currentId) ? data.currentId : data.projects[0]?.id || null };
  };
  try {
    const raw = localStorage.getItem(key);
    if (raw) initial = validate(JSON.parse(raw));
  } catch { warning = '本地参考资料无法读取，未覆盖原数据。可先保留浏览器数据，或明确清空本工作台后重新导入。'; }
  let pending: Promise<void> = Promise.resolve();
  let revision = 0;
  const store = createStore<ReferenceState>()((set, get) => {
    const commit = (projects: ReferenceProject[], currentId: string | null) => {
      if (get().warning) throw new Error(get().warning);
      if (!get().ready) throw new Error('参考资料正在加载，请稍候。');
      const raw = JSON.stringify({ version: 1, projects, currentId });
      if (projects.length > 10 || raw.length > 20000000) throw new Error('参考资料库最多保存 10 份、合计约 2000 万序列化字符；请先导出并删除不需要的资料。');
      if (useDatabase) {
        const currentRevision = ++revision;
        const snapshot = { version: 1, projects, currentId };
        set({ projects, currentId, saving: true, saveError: '' });
        // Serialize active writes and skip superseded queued snapshots while typing.
        pending = pending.catch(() => {}).then(async () => {
          if (revision === currentRevision) await writeReferenceWorkspace(key, snapshot);
        }).then(() => {
          if (revision === currentRevision) set({ saving: false, saveError: '' });
        }).catch(error => {
          if (revision === currentRevision) set({ saving: false, saveError: error instanceof Error ? error.message : '参考资料未保存，请导出备份。' });
          throw error;
        });
        void pending.catch(() => {});
        return;
      }
      // Write first: quota errors must not pretend that an in-memory update was saved.
      try { localStorage.setItem(key, raw); } catch { throw new Error('浏览器空间不足或不允许保存，本次操作未保存。请先导出、清理资料或更换普通浏览窗口。'); }
      set({ projects, currentId });
    };
    return {
      ...initial, warning, ready: !useDatabase, saving: false, saveError: '',
      flush: () => pending,
      add: (title, source, sourceHash) => {
        const existing = get().projects.find(project => project.sourceHash === sourceHash);
        if (existing) { commit(get().projects, existing.id); return existing.id; }
        const id = crypto.randomUUID(), now = Date.now();
        const project: ReferenceProject = { id, title: title.trim().slice(0, 120) || '未命名参考文', source, sourceHash, createdAt: now, updatedAt: now, style: '', methods: '', brief: defaultReferenceBrief(), outline: '', imports: [] };
        commit([...get().projects, project], id);
        return id;
      },
      select: id => commit(get().projects, id),
      update: (id, patch) => commit(get().projects.map(project => project.id === id ? { ...project, ...patch, id: project.id, source: project.source, sourceHash: project.sourceHash, updatedAt: Date.now() } : project), get().currentId),
      remove: id => {
        const projects = get().projects.filter(project => project.id !== id);
        commit(projects, get().currentId === id ? projects[0]?.id || null : get().currentId);
      },
      resetUnreadable: () => {
        if (useDatabase) {
          set({ warning: '' });
          commit([], null);
          void pending.then(() => { try { localStorage.removeItem(key); } catch {} }).catch(() => {});
        } else { localStorage.removeItem(key); set({ projects: [], currentId: null, warning: '' }); }
      },
    };
  });
  if (useDatabase) void (async () => {
    try {
      const saved = await readReferenceWorkspace(key);
      if (saved !== undefined) { store.setState({ ...validate(saved), warning: '', ready: true }); return; }
      if (warning) { store.setState({ ready: true }); return; }
      // Keep legacy data until the entire IndexedDB transaction has succeeded.
      await writeReferenceWorkspace(key, { version: 1, ...initial });
      try { localStorage.removeItem(key); } catch { /* A retained legacy copy is harmless. */ }
      store.setState({ ready: true });
    } catch (error) { store.setState({ ready: true, warning: error instanceof Error && error.message.trim() ? error.message : '参考资料无法读取，原数据未覆盖。请先保留浏览器数据，或明确清空本工作台后重新导入。' }); }
  })();
  return store;
}
