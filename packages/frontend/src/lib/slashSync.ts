import { useNovelStore } from '../stores/novelStore';
import type { Message } from '../types';
import { extractContentBlocks, parseChapterContent } from './structuredContent';
import { normalizeModificationTitle, parseModificationResponse } from './modificationInstructions';
import { applyTextModification, contentWordCount, isRichTextContent } from './textModification';
import { reviewVisibleText } from './reviewText';

/** The author authorizes this immutable chapter snapshot, not arbitrary tags
 * returned by the model. The caller also verifies its captured account. */
export interface SlashSyncScope {
  novelId: string;
  chapterId: string;
  title: string;
  content: string;
  kind: 'polish' | 'rewrite' | 'continue';
}
type SyncStatus = NonNullable<Message['syncStatus']>;
const controlNames = new Set(['基本信息', '角色', '人物', '人物设定', '角色设定', '世界观', '世界观设定', '卷', '大纲', '章节大纲', '章节列表', '章节', '修改', '删除', '替换', '插入章节', '合并章节', '拆分章节', '调整顺序']);
const scopeWarning = (): SyncStatus => ({ state: 'warning', message: '回复超出当前章节范围，未写入作品；候选内容仍保留在对话中。' });
const rejected = (reason: string, details?: string[]): SyncStatus => ({ state: 'warning', message: `${reason}，未写入作品；候选内容仍保留在对话中。`, ...(details?.length ? { details } : {}) });

/** Append visible new prose without serializing or changing the saved prefix.
 * A repeated complete source prefix is removed once; a partly rewritten prefix
 * is rejected rather than being mistaken for an entirely new continuation. */
export function appendSlashContinuation(original: string, candidate: string, modifiedFullBody = false): { content: string; error?: string } {
  const before = reviewVisibleText(original).trim(), proposed = reviewVisibleText(candidate).trim();
  const firstSentence = before.match(/^[\s\S]*?[。！？\n]/u)?.[0] || Array.from(before).slice(0, 32).join('');
  let tail = proposed;
  if (before && proposed.startsWith(before)) tail = proposed.slice(before.length).trim();
  else if (modifiedFullBody || before && (proposed.includes(before) || firstSentence.length >= 4 && proposed.includes(firstSentence))) {
    return { content: original, error: '续写回复改动或重复了旧稿，无法安全区分新增段落' };
  }
  if (!tail) return { content: original };
  if (isRichTextContent(original)) {
    const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return { content: original + tail.split('\n').filter(line => line.trim()).map(line => `<p>${escape(line)}</p>`).join('') };
  }
  return { content: original + (original && !original.endsWith('\n\n') ? original.endsWith('\n') ? '\n' : '\n\n' : '') + tail };
}

const wordCount = (content: string) => typeof DOMParser === 'undefined' && isRichTextContent(content) ? reviewVisibleText(content).trimEnd().length : contentWordCount(content);

function strictBlocks(response: string, expected: '修改' | '章节'): string[] | null {
  const text = response.replace(/\r\n?/g, '\n');
  // A fenced example is a candidate for the author, never an executable edit.
  if (/^\s*(?:`{3,}|~{3,})/m.test(text)) return null;
  const tags = [...text.matchAll(/【\s*([/／]?)\s*([^【】\n]+?)\s*】/g)];
  if (tags.some(tag => controlNames.has(tag[2].trim()) && tag[2].trim() !== expected)) return null;
  // The permissive creation parser also recognizes Markdown headings. Reject
  // those alternate mutation scopes before considering any allowed block.
  if (extractContentBlocks(text).some(block => block.type !== expected)) return null;
  const regex = new RegExp(`(?:^|\\n)[ \\t]*【\\s*${expected}\\s*】[ \\t]*\\n[\\s\\S]*?\\n[ \\t]*【\\s*[/／]\\s*${expected}\\s*】[ \\t]*(?=\\n|$)`, 'g');
  const blocks = [...text.matchAll(regex)].map(match => match[0].trim());
  // Every allowed tag must belong to a complete standalone block. This rejects
  // incomplete tails, nested blocks, inline quotations and orphan closures.
  if (!blocks.length || tags.filter(tag => tag[2].trim() === expected).length !== blocks.length * 2) return null;
  return blocks;
}

/** Validate and stage the entire response before one central chapter write.
 * Other chapters, settings and ordering never enter the mutation path. */
export function applyScopedSlashResponse(response: string, scope: SlashSyncScope): SyncStatus {
  const current = () => useNovelStore.getState().chapters.find(chapter => chapter.id === scope.chapterId && chapter.novelId === scope.novelId);
  const state = useNovelStore.getState();
  if (state.currentNovelId !== scope.novelId || !state.novels.some(novel => novel.id === scope.novelId)) return rejected('作品已切换或删除');
  const chapter = current();
  if (!chapter) return rejected('原章节已不存在');
  if (chapter.title !== scope.title || chapter.content !== scope.content) return rejected('目标章节在生成期间已变化，请重新核对');
  const normalizedTitle = normalizeModificationTitle(scope.title);
  if (state.chapters.filter(row => row.novelId === scope.novelId && normalizeModificationTitle(row.title) === normalizedTitle).length !== 1) return rejected('当前作品有同名章节，无法安全确定回复目标');

  const chapterBlocks = scope.kind !== 'polish' ? strictBlocks(response, '章节') : null;
  const modificationBlocks = scope.kind !== 'rewrite' && !chapterBlocks ? strictBlocks(response, '修改') : null;
  const blocks = chapterBlocks || modificationBlocks;
  if (!blocks) return scopeWarning();
  let next = scope.content;
  const details: string[] = [];
  try {
    if (modificationBlocks) {
      for (const [index, block] of blocks.entries()) {
        const parsed = parseModificationResponse(block);
        const instruction = parsed.length === 1 ? parsed[0].instruction : undefined;
        if (!instruction || parsed[0].error) return rejected('回复中的修改指令不完整', parsed.map(item => item.error || '无法识别的修改'));
        if (instruction.target !== '章节' || normalizeModificationTitle(instruction.title || '') !== normalizedTitle || instruction.field && !['正文', '内容'].includes(instruction.field)) return scopeWarning();
        const patch = applyTextModification(next, instruction.originalContent, instruction.newContent);
        if (patch.state === 'failed') return rejected('有修改无法匹配原文，本次整批保留为候选', [`第 ${index + 1} 处：${patch.message}`]);
        next = patch.content;
        details.push(`第 ${index + 1} 处：${patch.message}`);
      }
    } else {
      if (blocks.length !== 1) return scopeWarning();
      const parsed = parseChapterContent(blocks[0]);
      if (parsed.length !== 1 || normalizeModificationTitle(parsed[0].title) !== normalizedTitle || !parsed[0].content.trim()) return scopeWarning();
      next = parsed[0].content;
      details.push(scope.kind === 'continue' ? '仅追加当前章节的新正文，保留旧稿与原排版。' : '完整改写仅替换已确认的当前章节正文，标题与目录顺序保持原值。');
    }
    if (scope.kind === 'continue') {
      const appended = appendSlashContinuation(scope.content, next, !!modificationBlocks);
      if (appended.error) return rejected(appended.error);
      next = appended.content;
    }
    if (next === scope.content) return { state: 'success', message: '当前章节已与回复一致，无需重复写入。', details };
    // Re-read immediately before the only write; a late edit is never overwritten.
    const latest = current();
    if (useNovelStore.getState().currentNovelId !== scope.novelId || latest?.title !== scope.title || latest.content !== scope.content) return rejected('目标章节已变化，请重新核对');
    const count = wordCount(next);
    try { useNovelStore.getState().updateChapter(scope.chapterId, { content: next, wordCount: count }); }
    catch { return { state: 'error', message: '当前章节保存出错，可能已保存在本页；请检查章节并导出备份。', details }; }
    return { state: 'success', message: `已更新当前章节《${scope.title}》；修改前版本已按现有版本历史规则留档。`, details };
  } catch {
    return rejected('无法安全解析本次改稿格式，请核对候选内容');
  }
}
