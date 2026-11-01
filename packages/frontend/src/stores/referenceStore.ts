import { createStore } from 'zustand/vanilla';
import { storageKey } from '@/lib/runtime';
import { defaultReferenceBrief, parseReferenceSource, parseReferenceReport } from '@/lib/referenceCreation';
import type { ReferenceProject } from '@/types/reference';

interface ReferenceState {
  projects: ReferenceProject[]; currentId: string | null; warning: string;
  add: (title: string, source: string, sourceHash: string) => string;
  select: (id: string | null) => void;
  update: (id: string, patch: Partial<ReferenceProject>) => void;
  remove: (id: string) => void;
  resetUnreadable: () => void;
}
export function createReferenceWorkspace(namespace: string) {
  const key = `${storageKey('novel-agent-reference')}:${namespace}`;
  let initial: { projects: ReferenceProject[]; currentId: string | null } = { projects: [], currentId: null };
  let warning = '';
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.version !== 1 || !Array.isArray(data.projects) || data.projects.length > 10 || raw.length > 1000000) throw new Error();
      for (const project of data.projects) {
        if (typeof project.id !== 'string' || typeof project.title !== 'string' || typeof project.sourceHash !== 'string' || !project.brief || !Array.isArray(project.imports)) throw new Error();
        const parsed = parseReferenceSource(project.source);
        for (const field of ['style', 'methods', 'outline']) if (typeof project[field] !== 'string') throw new Error();
        for (const field of ['topic', 'audience', 'title', 'requirements']) if (typeof project.brief[field] !== 'string') throw new Error();
        if (!['both', 'style', 'structure'].includes(project.brief.mode) || typeof project.brief.min !== 'number' || typeof project.brief.max !== 'number') throw new Error();
        if (project.draft && (typeof project.draft.text !== 'string' || typeof project.draft.context !== 'string')) throw new Error();
        if (project.lastAttempt && (typeof project.lastAttempt.text !== 'string' || typeof project.lastAttempt.error !== 'string')) throw new Error();
        if (project.imports.some((item: ReferenceProject['imports'][number]) => typeof item.hash !== 'string' || typeof item.novelId !== 'string' || typeof item.chapterId !== 'string')) throw new Error();
        // Recompute coverage and quote verification instead of trusting cached flags.
        if (project.report) project.report = parseReferenceReport(JSON.stringify(project.report), parsed.paragraphs);
      }
      initial = { projects: data.projects, currentId: data.projects.some((project: ReferenceProject) => project.id === data.currentId) ? data.currentId : data.projects[0]?.id || null };
    }
  } catch { warning = '本地参考资料无法读取，未覆盖原数据。可先保留浏览器数据，或明确清空本工作台后重新导入。'; }
  return createStore<ReferenceState>()((set, get) => {
    const commit = (projects: ReferenceProject[], currentId: string | null) => {
      if (get().warning) throw new Error(get().warning);
      const raw = JSON.stringify({ version: 1, projects, currentId });
      if (projects.length > 10 || raw.length > 1000000) throw new Error('参考工作台最多保存 10 篇，或约 100 万字符；请先导出并删除不需要的资料。');
      // Write first: quota errors must not pretend that an in-memory update was saved.
      try { localStorage.setItem(key, raw); } catch { throw new Error('浏览器空间不足或不允许保存，本次操作未保存。请先导出、清理资料或更换普通浏览窗口。'); }
      set({ projects, currentId });
    };
    return {
      ...initial, warning,
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
      resetUnreadable: () => { localStorage.removeItem(key); set({ projects: [], currentId: null, warning: '' }); },
    };
  });
}
