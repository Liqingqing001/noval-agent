import { useNovelStore } from '@/stores/novelStore';
import { applyTextModification, contentWordCount } from './textModification';

export interface ModifyInstruction {
  target: '章节' | '大纲' | '角色' | '世界观' | '卷';
  title?: string;
  name?: string;
  field?: string;
  originalContent: string;
  newContent: string;
}

export interface ModificationResult {
  index: number;
  target?: ModifyInstruction['target'];
  title?: string;
  state: 'applied' | 'already-applied' | 'failed';
  message: string;
}

interface ParsedModification { index: number; instruction?: ModifyInstruction; error?: string }

function withoutCodeExamples(content: string): string {
  let fence: { character: string; length: number } | undefined;
  return content.replace(/\r\n?/g, '\n').split('\n').map(line => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = { character: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.character && marker[1].length >= fence.length) fence = undefined;
      return '';
    }
    return fence ? '' : line;
  }).join('\n');
}

function fieldMarkers(text: string, names: string[]) {
  return [...text.matchAll(new RegExp(`(?:^|\\s)(?:\\*\\*|__)?(${names.join('|')})(?:\\*\\*|__)?[ \\t]*[：:](?:\\*\\*|__)?[ \\t]*`, 'g'))];
}

function parseBlock(body: string): { instruction?: ModifyInstruction; error?: string } {
  const originalMarkers = fieldMarkers(body, ['原内容']);
  const original = originalMarkers[0];
  if (!original) return { error: '缺少原内容，未执行修改' };
  const afterOriginal = body.slice(original.index! + original[0].length);
  const replacements = fieldMarkers(afterOriginal, ['新内容']);
  const replacement = replacements[0];
  if (!replacement || replacements.length !== 1 || originalMarkers.length !== 1) return { error: '原内容和新内容字段缺失或重复，未执行修改' };
  const header = body.slice(0, original.index);
  const metadata: Record<string, string> = {};
  const markers = fieldMarkers(header, ['目标', '标题', '姓名', '字段']);
  for (const [index, marker] of markers.entries()) {
    if (marker[1] in metadata) return { error: `重复的${marker[1]}字段，未执行修改` };
    metadata[marker[1]] = header.slice(marker.index! + marker[0].length, markers[index + 1]?.index ?? header.length).trim();
  }
  const target = metadata['目标'];
  if (!['章节', '大纲', '角色', '世界观', '卷'].includes(target)) return { error: '缺少有效目标，请明确章节、大纲、角色、世界观或卷' };
  if (target === '角色' ? !metadata['姓名'] || !metadata['字段'] : !metadata['标题']) return { error: target === '角色' ? '缺少角色姓名或字段，未执行修改' : '缺少目标标题，未执行修改' };
  const originalContent = afterOriginal.slice(0, replacement.index).trim();
  const newContent = afterOriginal.slice(replacement.index! + replacement[0].length).trim();
  if (!originalContent || !newContent) return { error: '原内容或新内容为空，未执行修改' };
  return { instruction: { target: target as ModifyInstruction['target'], title: metadata['标题'], name: metadata['姓名'], field: metadata['字段'], originalContent, newContent } };
}

/** Mutations require a complete, standalone block; a broken block cannot swallow the next one. */
export function parseModificationResponse(content: string): ParsedModification[] {
  const text = withoutCodeExamples(content);
  const results: ParsedModification[] = [];
  let open: { start: number; index: number } | undefined;
  let nextIndex = 1;
  let lastEnd = 0;
  let ignoredOpen = false;
  for (const tag of text.matchAll(/【\s*([/／]?)\s*修改\s*】/g)) {
    const start = tag.index!;
    const end = start + tag[0].length;
    if (!tag[1]) {
      const before = text.slice(Math.max(text.lastIndexOf('\n', start - 1) + 1, lastEnd), start);
      if (before.replace(/^[\s*\-\d.、)）]+/u, '').trim()) { ignoredOpen = true; continue; }
      ignoredOpen = false;
      if (open) results.push({ index: open.index, error: '缺少闭合标签，未执行该条修改' });
      open = { start: end, index: nextIndex++ };
    } else if (ignoredOpen) {
      ignoredOpen = false;
    } else if (open) {
      results.push({ index: open.index, ...parseBlock(text.slice(open.start, start)) });
      open = undefined;
    } else {
      // An orphan closing tag is actionable feedback, not permission to guess a target.
      const before = text.slice(lastEnd, start);
      if (/原内容[：:]|新内容[：:]/.test(before)) results.push({ index: nextIndex++, error: '缺少【修改】开头或目标信息，未执行该条修改' });
    }
    lastEnd = end;
  }
  if (open) results.push({ index: open.index, error: '缺少闭合标签，未执行该条修改' });
  return results;
}

export const parseModifyInstructions = (content: string): ModifyInstruction[] => parseModificationResponse(content).flatMap(item => item.instruction ? [item.instruction] : []);
export const hasModificationInstructions = (content: string): boolean => parseModificationResponse(content).length > 0;

// Text quoted inside a modification is never a separate creation command.
export const withoutModificationBlocks = (content: string): string => content.replace(/【\s*修改\s*】[\s\S]*?(?:【\s*[/／]\s*修改\s*】|(?=【\s*修改\s*】)|$)/g, '');

export function normalizeModificationTitle(title: string): string {
  return title.trim().replace(/^第[零〇一二两三四五六七八九十百千万\d]+章[\s:：、.-]*/, '').trim();
}

export function applyModificationInstructions(content: string, novelId: string): ModificationResult[] {
  const pending = new Map<string, { id: string; target: ModifyInstruction['target']; updates: Record<string, string | number>; indices: number[] }>();
  const results = parseModificationResponse(content).map(item => {
    const instruction = item.instruction;
    const base = { index: item.index, target: instruction?.target, title: instruction?.title || instruction?.name };
    const failed = (message: string): ModificationResult => ({ ...base, state: 'failed', message });
    if (!instruction) return failed(item.error || '无法识别修改指令');
    try {
      const store = useNovelStore.getState(); // Staged content below includes every earlier edit to this record.
      const { target, originalContent, newContent } = instruction;
      const requestedTitle = instruction.title || instruction.name || '';
      const characterFields = { 性格: 'personality', 背景: 'background', 外貌: 'appearance', 描述: 'description', 简介: 'description', personality: 'personality', background: 'background', appearance: 'appearance', description: 'description' } as const;
      const field = target === '角色' ? characterFields[instruction.field as keyof typeof characterFields] : target === '章节' || target === '世界观' ? 'content' : 'summary';
      if (!field) return failed('不支持该角色字段，未修改');
      const records = (target === '章节' ? store.chapters : target === '角色' ? store.characters : target === '世界观' ? store.worldSettings : store.plotCards.filter(card => card.type === (target === '卷' ? 'volume' : 'chapter')))
        .filter(record => record.novelId === novelId);
      const titleOf = (record: typeof records[number]) => 'name' in record ? record.name : record.title;
      const exact = records.filter(record => titleOf(record).trim() === requestedTitle.trim());
      const candidates = exact.length ? exact : target === '章节' || target === '大纲'
        ? records.filter(record => normalizeModificationTitle(titleOf(record)) === normalizeModificationTitle(requestedTitle)) : [];
      if (!candidates.length) return failed(`未找到${target}《${requestedTitle}》，未修改其他内容`);
      if (candidates.length > 1) return failed(`找到 ${candidates.length} 个同名${target}，请提供唯一标题`);
      const record = candidates[0];
      const key = `${target}:${record.id}`;
      const staged = pending.get(key);
      const source = staged?.updates[field] ?? (record as unknown as Record<string, unknown>)[field];
      const patched = applyTextModification(typeof source === 'string' ? source : '', originalContent, newContent);
      if (patched.state === 'applied') {
        const updates = { ...staged?.updates, [field]: patched.content, ...(target === '章节' ? { wordCount: contentWordCount(patched.content) } : {}) };
        pending.set(key, { id: record.id, target, updates, indices: [...(staged?.indices || []), item.index] });
      }
      return { ...base, state: patched.state, message: patched.message };
    } catch {
      return failed('无法安全处理该条修改，请核对原文或重新生成指令');
    }
  });
  // One write per record avoids competing backend requests for edits to the same chapter.
  const store = useNovelStore.getState();
  for (const change of pending.values()) {
    try {
      if (change.target === '章节') store.updateChapter(change.id, change.updates);
      else if (change.target === '角色') store.updateCharacter(change.id, change.updates);
      else if (change.target === '世界观') store.updateWorldSetting(change.id, change.updates);
      else store.updatePlotCard(change.id, change.updates);
    } catch {
      for (const result of results.filter(item => change.indices.includes(item.index))) {
        result.state = 'failed';
        result.message = '写入发生错误，可能已部分保存，请检查面板后重试';
      }
    }
  }
  return results;
}
