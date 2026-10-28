import type { Chapter, Novel } from '@/types';
import { paragraphText, readManuscript } from './manuscript';
import type { ManuscriptParagraph } from './manuscript';

export type ExportFormat = 'txt' | 'md' | 'docx';
export type ExportScope = 'novel' | 'chapter';
export interface ExportChapter { title: string; paragraphs: ManuscriptParagraph[] }
export interface NovelExportData { title: string; summary: ManuscriptParagraph[]; chapters: ExportChapter[] }
export interface ExportOptions { scope: ExportScope; chapterId?: string | null; includeSummary?: boolean }

export function sanitizeExportFilename(title: string): string {
  let name = Array.from(title.replace(/[<>:"/\\|?*]/g, '_'), character => character.codePointAt(0)! < 32 ? '_' : character).join('').replace(/[. ]+$/g, '').trim();
  name = Array.from(name).slice(0, 100).join('').replace(/[. ]+$/g, '');
  if (!name) name = '未命名小说';
  if (/^(CON|PRN|AUX|NUL|COM[0-9¹²³]|LPT[0-9¹²³])(?:\.|$)/i.test(name)) name = `_${name}`;
  return name;
}

export function exportChapterTitle(title: string, number: number): string {
  const clean = title.trim() || '未命名章节';
  return /^(?:第[零〇一二两三四五六七八九十百千万\d]+章|序章|楔子|尾声|后记|番外)/.test(clean) ? clean : `第${number}章 ${clean}`;
}

export function prepareNovelExport(novel: Novel, chapters: Chapter[], options: ExportOptions): NovelExportData {
  const ordered = chapters.filter(chapter => chapter.novelId === novel.id).slice().sort((a, b) => a.sequence - b.sequence);
  const selected = ordered.flatMap((chapter, index) => options.scope === 'chapter' && chapter.id !== options.chapterId ? [] : [{ title: exportChapterTitle(chapter.title, index + 1), paragraphs: readManuscript(chapter.content) }]);
  if (!selected.length) throw new Error(options.scope === 'chapter' ? '请先选择一个可导出的章节。' : '这本小说还没有章节可导出。');
  return { title: novel.title || '未命名小说', summary: options.includeSummary && options.scope === 'novel' && novel.summary ? readManuscript(novel.summary) : [], chapters: selected };
}

const plainParagraph = (paragraph: ManuscriptParagraph) => `${paragraph.quote ? '＞ ' : ''}${paragraph.prefix || ''}${paragraphText(paragraph)}`;
export function renderNovelTxt(data: NovelExportData): string {
  const sections = [data.title, ...(data.summary.length ? [`简介\n${data.summary.map(plainParagraph).join('\n')}`] : []), ...data.chapters.map(chapter => `${chapter.title}\n\n${chapter.paragraphs.map(plainParagraph).join('\n')}`)];
  return `${sections.join('\n\n')}\n`.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n');
}

const escapeMarkdown = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_{}[\]()#+.!|~-])/g, '\\$1');
export function renderNovelMarkdown(data: NovelExportData): string {
  const paragraph = (item: ManuscriptParagraph) => {
    const body = item.runs.map(run => {
      let text = escapeMarkdown(run.text).replace(/\r\n?|\n/g, '  \n');
      if (!text.trim()) return text;
      if (run.bold) text = `**${text}**`;
      if (run.italic) text = `*${text}*`;
      return text;
    }).join('');
    const line = `${item.prefix || (item.kind === 'heading' ? '### ' : '')}${body}`;
    return item.quote ? line.split('\n').map(part => `> ${part}`).join('\n') : line;
  };
  return [`# ${escapeMarkdown(data.title)}`, ...(data.summary.length ? ['## 简介', data.summary.map(paragraph).join('\n\n')] : []), ...data.chapters.flatMap(chapter => [`## ${escapeMarkdown(chapter.title)}`, chapter.paragraphs.map(paragraph).join('\n\n')])].join('\n\n') + '\n';
}

export async function createNovelExport(data: NovelExportData, format: ExportFormat, scope: ExportScope): Promise<{ blob: Blob; filename: string }> {
  const stem = scope === 'chapter' ? `${data.title}_${data.chapters[0].title}` : data.title;
  const blob = format === 'docx' ? await (await import('./wordExport')).createWordExport(data) : format === 'txt'
    ? new Blob(['\ufeff', renderNovelTxt(data)], { type: 'text/plain;charset=utf-8' })
    : new Blob([renderNovelMarkdown(data)], { type: 'text/markdown;charset=utf-8' });
  return { blob, filename: `${sanitizeExportFilename(stem)}.${format}` };
}

export function downloadExport(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
