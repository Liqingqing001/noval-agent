import type { Chapter } from '../types';

export type ChapterVersionKind = 'automatic' | 'manual' | 'before-restore' | 'before-delete';
export interface ChapterVersion {
  id: string; chapterId: string; novelId: string; title: string; content: string;
  wordCount: number; sequence: number; savedAt: number; kind: ChapterVersionKind;
  label: string; baseline?: boolean;
}
export interface ChapterHistoryData { version: 1; versions: ChapterVersion[] }
export type HistoryOperation = { type: 'capture'; version: ChapterVersion } | { type: 'remap'; novelId: string; chapterId: string; nextId: string } | { type: 'remap-novel'; novelId: string; nextId: string };
export const CHAPTER_HISTORY_LIMIT = 50;
export const CHAPTER_HISTORY_WINDOW = 60_000;
export const CHAPTER_HISTORY_MAX_CHARACTERS = 30_000_000;
export const chapterVersionFingerprint = (value: Pick<ChapterVersion, 'title' | 'content'>): string => JSON.stringify([value.title, value.content]);
const kinds = new Set<ChapterVersionKind>(['automatic', 'manual', 'before-restore', 'before-delete']);
const cleanNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

export function chapterVersion(chapter: Chapter, kind: ChapterVersionKind, label: string, now = Date.now(), id = crypto.randomUUID()): ChapterVersion {
  return { id, chapterId: chapter.id, novelId: chapter.novelId, title: chapter.title, content: chapter.content, wordCount: chapter.wordCount, sequence: chapter.sequence, savedAt: now, kind, label: label.trim().slice(0, 100) };
}

/** Reconstruct an allowlisted document; snapshots contain title/body, never request metadata. */
export function readChapterHistory(value: unknown): ChapterHistoryData {
  if (!value || typeof value !== 'object' || (value as ChapterHistoryData).version !== 1 || !Array.isArray((value as ChapterHistoryData).versions)) throw new Error('章节历史格式无法读取，原数据没有被覆盖。');
  const versions = (value as ChapterHistoryData).versions.map(row => {
    if (!row || typeof row.id !== 'string' || typeof row.chapterId !== 'string' || typeof row.novelId !== 'string' || typeof row.title !== 'string' || typeof row.content !== 'string' || !kinds.has(row.kind)) throw new Error('章节历史内容无法读取，原数据没有被覆盖。');
    return { id: row.id, chapterId: row.chapterId, novelId: row.novelId, title: row.title, content: row.content, wordCount: cleanNumber(row.wordCount), sequence: cleanNumber(row.sequence), savedAt: cleanNumber(row.savedAt), kind: row.kind, label: typeof row.label === 'string' ? row.label.slice(0, 100) : '', baseline: row.baseline === true };
  });
  return { version: 1, versions };
}

export function applyHistoryOperation(data: ChapterHistoryData, operation: HistoryOperation, enforceCapacity = true): ChapterHistoryData {
  if (operation.type === 'remap') return { version: 1, versions: data.versions.map(row => row.novelId === operation.novelId && row.chapterId === operation.chapterId ? { ...row, chapterId: operation.nextId } : row) };
  if (operation.type === 'remap-novel') return { version: 1, versions: data.versions.map(row => row.novelId === operation.novelId ? { ...row, novelId: operation.nextId } : row) };
  const incoming = operation.version;
  if (data.versions.some(row => row.id === incoming.id)) return data;
  const sameChapter = data.versions.filter(row => row.novelId === incoming.novelId && row.chapterId === incoming.chapterId).reverse().sort((a, b) => b.savedAt - a.savedAt);
  const latest = sameChapter[0];
  if (incoming.kind === 'automatic' && latest && chapterVersionFingerprint(latest) === chapterVersionFingerprint(incoming)) return data;
  let versions = data.versions;
  if (incoming.kind === 'automatic') {
    const rolling = sameChapter.find(row => row.kind === 'automatic' && !row.baseline);
    if (rolling && incoming.savedAt - rolling.savedAt < CHAPTER_HISTORY_WINDOW && incoming.savedAt >= rolling.savedAt) {
      versions = versions.filter(row => row.id !== rolling.id);
    }
  }
  const added = { ...incoming, baseline: !sameChapter.length && incoming.kind === 'automatic' };
  versions = [...versions, added];
  const siblings = versions.filter(row => row.novelId === added.novelId && row.chapterId === added.chapterId).sort((a, b) => a.savedAt - b.savedAt);
  while (siblings.length > CHAPTER_HISTORY_LIMIT) {
    const prune = siblings.find(row => row.id !== added.id && row.kind === 'automatic' && !row.baseline) || siblings.find(row => row.id !== added.id && !row.baseline) || siblings[0];
    versions = versions.filter(row => row.id !== prune.id);
    siblings.splice(siblings.indexOf(prune), 1);
  }
  if (enforceCapacity && versions.reduce((sum, row) => sum + row.content.length + row.title.length, 0) > CHAPTER_HISTORY_MAX_CHARACTERS) throw new Error('章节历史已达到约 3000 万字符上限。请导出备份并使用其他浏览器资料库后继续保存历史。');
  return { version: 1, versions };
}

export function chapterHistoryText(content: string): string {
  if (!/^\s*<(?:p|div|h[1-6]|ul|ol|blockquote|pre)(?:\s|>)/i.test(content)) return content;
  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(content.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(?:p|div|h[1-6]|li|blockquote|pre)>/gi, '\n'), 'text/html');
    document.querySelectorAll('script,style,noscript,template').forEach(element => element.remove());
    return (document.body.textContent || '').trim();
  }
  return content.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(?:p|div|h[1-6]|li|blockquote|pre)>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
}

/** Ordered, bounded line diff. Large rewrites fall back to the changed middle block. */
export function chapterHistoryDiff(previous: string, current: string): { removed: string[]; added: string[]; unchanged: number } {
  const oldLines = chapterHistoryText(previous).split('\n'), newLines = chapterHistoryText(current).split('\n');
  let start = 0, end = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++;
  while (end < oldLines.length - start && end < newLines.length - start && oldLines[oldLines.length - end - 1] === newLines[newLines.length - end - 1]) end++;
  const oldMiddle = oldLines.slice(start, oldLines.length - end), newMiddle = newLines.slice(start, newLines.length - end);
  if (oldMiddle.length * newMiddle.length > 250_000) return { removed: oldMiddle, added: newMiddle, unchanged: start + end };
  const width = newMiddle.length + 1, lcs = new Uint32Array((oldMiddle.length + 1) * width);
  for (let i = oldMiddle.length - 1; i >= 0; i--) for (let j = newMiddle.length - 1; j >= 0; j--) lcs[i * width + j] = oldMiddle[i] === newMiddle[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
  const removed: string[] = [], added: string[] = [];
  let i = 0, j = 0, unchanged = start + end;
  while (i < oldMiddle.length || j < newMiddle.length) {
    if (i < oldMiddle.length && j < newMiddle.length && oldMiddle[i] === newMiddle[j]) { i++; j++; unchanged++; }
    else if (j < newMiddle.length && (i === oldMiddle.length || lcs[i * width + j + 1] >= lcs[(i + 1) * width + j])) added.push(newMiddle[j++]);
    else removed.push(oldMiddle[i++]);
  }
  return { removed, added, unchanged };
}
