import type { Chapter, Character, Foreshadowing, Message, Novel, PlotCard, WorldSetting } from '../types';
import type { ChatMessage } from '../services/modelService';
import { estimateChatTokens, estimateTextTokens } from './modelUsage';
import { reviewVisibleText } from './reviewText';
import { writingRequirement } from './writingContext';
import { isLocalSlashCommandText } from './slashCommands';

export const CHAT_CONTEXT_TOKEN_BUDGET = 24_000;
export const CHAT_HISTORY_LIMIT = 15;
export interface ChatContextInput {
  novel: Novel; chapters: Chapter[]; characters: Character[]; worldSettings: WorldSetting[]; plotCards: PlotCard[];
  foreshadowings?: Foreshadowing[]; currentChapterId?: string | null; request: string; history: Message[];
  systemPrompt: string; reviewCount?: number; historyLimit?: number; inputTokenBudget?: number; reviewOnly?: boolean;
}
export interface ChatContextSummary {
  chapterIds: string[]; chapterTitles: string[]; chapterCount: number;
  historyIncluded: number; historyOmitted: number; estimatedInputTokens: number; tokenBudget: number;
  warnings: string[]; omitted: string[]; scopeLabel: string;
}
export interface ChatContextResult { messages: ChatMessage[]; summary: ChatContextSummary; sourceChapterIds: string[]; blockedReason?: string }
const READ_INTENT = /检查|核对|校对|审读|修改|改写|重写|润色|分析/;
const SETTINGS_ONLY = /大纲|卷纲|世界观|设定集|人物(?:档案|设定|背景|关系)|角色(?:档案|设定|背景|关系)|(?:生成|设计|创建|新增).{0,5}(?:角色|人物)/;
const BODY_EXPLICIT = /正文|本章|本章节|当前章|这章|这一章|这一段|这段|续写|扩写|重写|改写|第[零〇一二两三四五六七八九十百千万\d]+章/;
const structured = /【(?:基本信息|角色|人物|世界观|卷|大纲|章节大纲|章节|修改|删除|插入|替换|合并|拆分|重排)】/;
const numberPattern = '[零〇一二两三四五六七八九十百千万\\d]+';

function chapterNumber(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
  let total = 0, section = 0, digit = 0;
  for (const character of value) {
    if (character in digits) digit = digits[character];
    else if (character === '万') { total += (section + digit || 1) * 10000; section = 0; digit = 0; }
    else if (character in units) { section += (digit || 1) * units[character]; digit = 0; }
    else return 0;
  }
  return total + section + digit;
}
const chapterLabel = (chapter: Chapter) => `第${chapter.sequence}章《${chapter.title}》`;
const deduplicate = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map(row => [row.id, row])).values()];
const ordered = (rows: Chapter[]) => [...rows].sort((a, b) => a.sequence - b.sequence);
const labelList = (rows: Chapter[]) => rows.map(chapterLabel).join('、');

/** Local UI notices and incomplete generations are never upgraded to model instructions. */
function historyTurns(messages: Message[]): Message[][] {
  const failedUserIds = new Set<string>();
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role !== 'assistant' || message.generation?.status === 'succeeded' && message.syncStatus?.state !== 'partial') continue;
    if (message.generation && message.generation.status !== 'succeeded' || message.syncStatus?.state === 'partial') {
      const requestId = message.generation?.requestMessageId || [...messages.slice(0, index)].reverse().find(row => row.role === 'user')?.id;
      if (requestId) failedUserIds.add(requestId);
    }
  }
  // A recovered completed response to the same request takes precedence over its earlier failed slot.
  for (const message of messages) if (message.role === 'assistant' && message.generation?.status === 'succeeded' && message.syncStatus?.state !== 'partial') failedUserIds.delete(message.generation.requestMessageId);
  const turns: Message[][] = [];
  let current: Message[] | undefined;
  for (const message of messages) {
    if (message.role === 'system' || !message.content.trim()) continue;
    if (message.role === 'user') {
      current = undefined;
      if (failedUserIds.has(message.id) || message.id.startsWith('cmd-') || isLocalSlashCommandText(message.content)) continue;
      current = [message]; turns.push(current);
    } else {
      if (!current || message.generation && message.generation.status !== 'succeeded' || message.syncStatus?.state === 'partial' || /^【历史对话摘要】/.test(message.content)) continue;
      current.push(message);
    }
  }
  return turns;
}

function historyProjection(message: Message): { role: 'user' | 'assistant'; content: string; excerpt: boolean } {
  const text = message.generation?.syncPolicy === 'review-only' ? `【历史只读审阅回复：未写入作品】\n${message.content}` : message.content;
  const limit = message.role === 'assistant' && message.syncStatus?.state === 'success' && structured.test(text) ? 900 : 3600;
  if (text.length <= limit && estimateTextTokens(text) <= 2400) return { role: message.role as 'user' | 'assistant', content: text, excerpt: false };
  const points = Array.from(text), side = Math.floor(Math.min(limit, 1600) / 2);
  return { role: message.role as 'user' | 'assistant', content: `${points.slice(0, side).join('')}\n[历史消息原文节选，中间 ${Math.max(0, points.length - side * 2)} 字符未带入；完整原文仍保留在会话中]\n${points.slice(-side).join('')}`, excerpt: true };
}

function selection(input: ChatContextInput, chapters: Chapter[], warnings: string[]) {
  const request = input.request, current = chapters.find(row => row.id === input.currentChapterId);
  const required: Chapter[] = [], explicitIds = chapters.filter(row => row.id.length >= 5 && request.includes(row.id));
  let explicit = explicitIds.length > 0, requestedAnchor: number | undefined, anchor = current?.sequence, problem = '';
  required.push(...explicitIds);
  const ranges = [...request.matchAll(new RegExp(`第?(${numberPattern})章?\\s*(?:至|到|[-—~～])\\s*第?(${numberPattern})章`, 'g'))].map(match => [chapterNumber(match[1]), chapterNumber(match[2])] as const);
  const numbers = [...request.matchAll(new RegExp(`第(${numberPattern})章`, 'g'))].map(match => chapterNumber(match[1]));
  const wholeBook = READ_INTENT.test(request) && /全书|整本|所有.{0,8}章|全部.{0,8}章/.test(request);
  if (wholeBook) { required.push(...chapters); explicit = true; }
  for (const [low, high] of ranges) {
    explicit = true; requestedAnchor = Math.min(requestedAnchor ?? low, low);
    if (!Number.isSafeInteger(low) || high < low || high - low > 5000) { problem = '章节范围无法确定，请使用有效的起止章节编号。'; continue; }
    const found = chapters.filter(row => row.sequence >= low && row.sequence <= high);
    required.push(...found);
    if (new Set(found.map(row => row.sequence)).size !== high - low + 1 && READ_INTENT.test(request)) problem = '指定章节范围内有尚不存在的章节，请核对目录后重新选择。';
  }
  for (const number of new Set(numbers)) {
    explicit = true; requestedAnchor = Math.min(requestedAnchor ?? number, number);
    const found = chapters.filter(row => row.sequence === number);
    if (found.length > 1 && !explicitIds.some(row => row.sequence === number)) problem = `第${number}章的编号对应多篇章节，请先在目录中修正序号，或明确提供章节 ID。`;
    else if (!found.length) {
      if (READ_INTENT.test(request)) problem = `第${number}章尚不存在，无法读取其原文；请核对章节编号。`;
      else warnings.push(`第${number}章尚无已保存正文，只带入此前已有章节供创作参考。`);
    } else required.push(...(explicitIds.some(row => row.sequence === number) ? explicitIds.filter(row => row.sequence === number) : found));
  }
  const titles = new Map<string, Chapter[]>();
  for (const chapter of chapters) if (chapter.title.trim().length >= 2) titles.set(chapter.title.trim(), [...titles.get(chapter.title.trim()) || [], chapter]);
  const quotedTitle = (title: string) => [`《${title}》`, `“${title}”`, `「${title}」`, `『${title}』`, `"${title}"`, `'${title}'`].some(value => request.includes(value));
  for (const [title, found] of titles) if (quotedTitle(title)) {
    if (found.length === 1) { required.push(found[0]); explicit = true; }
    else if (!explicit && READ_INTENT.test(request)) problem = `“${title}”对应多篇章节，请补充章节编号。`;
  }
  const count = input.reviewCount === undefined ? 3 : Math.min(50, Math.max(0, Math.floor(input.reviewCount)));
  if (input.reviewCount !== undefined && !explicit) {
    const rows = count ? chapters.slice(-count) : [];
    return { required: rows, optional: [] as Chapter[], label: count ? `最近 ${rows.length} 章` : '未选择章节正文', problem };
  }
  const settingsOnly = SETTINGS_ONLY.test(request) && !BODY_EXPLICIT.test(request);
  const globalContinuation = !explicit && /续写|写作/.test(request) && /大纲顺序|大纲中待写作|下一章待写作/.test(request) && !/当前章|本章|这一章|这章/.test(request);
  if (globalContinuation) {
    const latest = [...chapters].reverse().find(chapter => reviewVisibleText(chapter.content).trim());
    if (latest) required.push(latest);
  } else if (!explicit && !settingsOnly && current) required.push(current);
  let primary = ordered(deduplicate(required));
  if (primary.length) anchor = primary[0].sequence;
  else if (requestedAnchor !== undefined) anchor = requestedAnchor;
  const optionalCount = input.reviewCount !== undefined || primary.length > 1 ? 0 : primary.length ? 2 : count;
  const optional = settingsOnly && !explicit || !optionalCount ? [] : chapters.filter(row => row.sequence < (anchor ?? Number.POSITIVE_INFINITY) && !primary.some(chapter => chapter.id === row.id)).slice(-optionalCount);
  if (READ_INTENT.test(request) && (explicit || BODY_EXPLICIT.test(request)) && primary.some(row => !reviewVisibleText(row.content).trim())) problem = '指定章节尚无可读取的正文，请先补充正文或选择已有章节。';
  if (!explicit && !current && !settingsOnly) { primary = []; return { required: primary, optional, label: '最近章节与相关资料', problem }; }
  return { required: primary, optional, label: globalContinuation ? '按全书写作进度续写' : explicit ? '按本次指定章节' : settingsOnly ? '以设定和大纲为主' : current ? '当前章节及此前章节' : '作品资料', problem };
}

/** Build a bounded request projection without modifying saved messages or book data. */
export function buildChatContext(input: ChatContextInput): ChatContextResult {
  const tokenBudget = Math.min(128000, Math.max(256, Math.floor(input.inputTokenBudget || CHAT_CONTEXT_TOKEN_BUDGET)));
  // The directory numbers its sorted rows from one. Legacy/manual data can be
  // zero-based or sparse, so only this request projection receives display ordinals.
  const chapters = ordered(input.chapters.filter(row => row.novelId === input.novel.id)).map((chapter, index) => ({ ...chapter, sequence: index + 1 }));
  const bodies = new Map(chapters.map(chapter => [chapter.id, reviewVisibleText(chapter.content)]));
  const characters = input.characters.filter(row => row.novelId === input.novel.id);
  const worlds = input.worldSettings.filter(row => row.novelId === input.novel.id);
  const plots = input.plotCards.filter(row => row.novelId === input.novel.id);
  const warnings: string[] = [], omitted: string[] = [];
  const chosen = selection(input, chapters, warnings), selected: Chapter[] = [];
  const turns = historyTurns(input.history), eligibleCount = turns.flat().length;
  const summary: ChatContextSummary = { chapterIds: [], chapterTitles: [], chapterCount: 0, historyIncluded: 0, historyOmitted: eligibleCount, estimatedInputTokens: 0, tokenBudget, warnings, omitted, scopeLabel: chosen.label };
  const parts: string[] = [
    `【作品信息】\n书名：${input.novel.title}\n题材：${input.novel.genre || '未设置'}\n简介：${input.novel.summary || '未设置'}\n状态：${input.novel.status === 'completed' ? '已完成' : input.novel.status === 'writing' ? '创作中' : '草稿'}`,
    `【创作进度参考】\n已保存 ${chapters.length} 章、${characters.length} 位人物、${worlds.length} 项世界观、${plots.filter(row => row.type === 'chapter').length} 项章节大纲。${plots.some(row => row.type === 'chapter' && row.summary.trim()) ? '已有情节概要，可按本次需求创作或讨论。' : '大纲尚未完善；可建议补充，但用户已明确要求的试写、片段或修改可直接处理。'}`,
  ];
  if (input.novel.agentPrompt?.trim()) parts.push(`【本书常用要求】\n${input.novel.agentPrompt}\n本次用户提出更具体或不同的要求时，以本次需求为准。`);
  const modelHistory: ChatMessage[] = [];
  const requirement = input.reviewOnly ? '' : writingRequirement(input.request, input.novel.agentPrompt);
  const footer = () => `【本次资料范围】\n${selected.length ? `已附完整正文：${labelList(ordered(selected))}。` : '没有附加章节正文。'}未附章节正文不代表已经阅读。${omitted.length ? `本次未完整带入：${omitted.join('；')}。` : ''}\n\n【用户的问题】\n${input.request}${requirement}`;
  const messages = (): ChatMessage[] => [{ role: 'system', content: input.systemPrompt }, ...modelHistory, { role: 'user', content: `${parts.join('\n\n')}\n\n${ordered(selected).map(chapter => `【已保存章节正文：${chapterLabel(chapter)}】\n${bodies.get(chapter.id) || ''}`).join('\n\n')}\n\n${footer()}` }];
  const tokenCount = () => estimateChatTokens(messages());
  const result = (blockedReason?: string): ChatContextResult => {
    summary.chapterIds = ordered(selected).map(row => row.id); summary.chapterTitles = ordered(selected).map(chapterLabel); summary.chapterCount = selected.length;
    summary.historyIncluded = modelHistory.length; summary.historyOmitted = Math.max(0, eligibleCount - modelHistory.length); summary.estimatedInputTokens = tokenCount();
    return { messages: blockedReason ? [] : messages(), summary, sourceChapterIds: summary.chapterIds, ...(blockedReason ? { blockedReason } : {}) };
  };
  if (!input.request.trim()) return result('请先输入本次需求。');
  if (chosen.problem) return result(chosen.problem);
  for (const chapter of chosen.required) {
    const body = reviewVisibleText(chapter.content);
    if (!body.trim()) { warnings.push(`${chapterLabel(chapter)}暂无正文。`); continue; }
    selected.push(chapter);
  }
  if (tokenCount() > tokenBudget - 256) return result('本次必须保留的用户需求、书籍要求或指定章节正文已超过对话输入范围，未发送模型请求。请缩小章节范围；整本审读可使用“创作检查 → 全书一致性检查”。');
  // Leave a little room for the exact coverage notice that follows optional omissions.
  const fits = (part: string) => { parts.push(part); const accepted = tokenCount() <= tokenBudget - 512; if (!accepted) parts.pop(); return accepted; };
  type Group = 'characters' | 'worlds' | 'plots' | 'threads';
  interface Candidate { group: Group; part: string; priority: boolean; required: boolean; label: string }
  const targetGroup: Group | undefined = /大纲|卷纲/.test(input.request) ? 'plots' : /世界观|设定集/.test(input.request) ? 'worlds' : /人物(?:档案|设定|背景|关系)|角色(?:档案|设定|背景|关系)|(?:生成|设计|创建|新增).{0,5}(?:角色|人物)/.test(input.request) ? 'characters' : undefined;
  const namedTarget = (group: Group, id: string, title: string) => id.length >= 5 && input.request.includes(id) || [`《${title}》`, `“${title}”`, `「${title}」`, `『${title}』`, `"${title}"`, `'${title}'`].some(value => input.request.includes(value)) || title.length >= 2 && input.request.includes(title) && (targetGroup === group || group === 'characters' && /人物|角色|性格|背景|外貌|简介|别名/.test(input.request));
  const globalContinuation = /按全书写作进度/.test(chosen.label);
  const query = `${input.request}\n${selected.map(row => bodies.get(row.id) || '').join('\n')}`;
  const relevantCharacters = [...characters].sort((left, right) => {
    const score = (row: Character) => (input.request.includes(row.name) || row.aliases.some(alias => alias.length > 1 && input.request.includes(alias)) ? 10 : 0) + (query.includes(row.name) ? 3 : 0) + (row.role === 'protagonist' ? 1 : 0);
    return score(right) - score(left) || (left.sequence || 0) - (right.sequence || 0);
  });
  const selectedIds = new Set(selected.map(row => row.id)), selectedTitles = new Set(selected.map(row => row.title));
  const sortedPlots = [...plots].sort((left, right) => {
    const score = (row: PlotCard) => (input.request.includes(row.title) ? 10 : 0) + (selectedIds.has(row.chapterId || '') || selectedTitles.has(row.title) ? 5 : 0) + (globalContinuation && row.status === 'pending' ? 6 : 0) + (row.type === 'volume' ? 2 : 0) + (row.status === 'pending' ? 1 : 0);
    return score(right) - score(left) || left.sequence - right.sequence;
  });
  const nextPlotIds = new Set(sortedPlots.filter(row => row.type === 'chapter' && row.status === 'pending').slice(0, 3).map(row => row.id));
  const candidates: Candidate[] = [
    ...relevantCharacters.map(character => ({ group: 'characters' as const, label: character.name, required: namedTarget('characters', character.id, character.name) || character.aliases.some(alias => alias.length > 1 && namedTarget('characters', character.id, alias)), priority: targetGroup === 'characters' || input.request.includes(character.name) || character.aliases.some(alias => alias.length > 1 && input.request.includes(alias)), part: `【人物资料：${character.name}】\n${JSON.stringify({ 姓名: character.name, 别名: character.aliases, 定位: character.role, 性格: character.personality, 背景: character.background, 外貌: character.appearance, 简介: character.description, 人物关系: (character.relationships || []).map(relation => ({ ...relation, target: characters.find(row => row.id === relation.targetId)?.name || '关联人物不存在' })) })}` })),
    ...[...worlds].sort((left, right) => Number(input.request.includes(right.title)) - Number(input.request.includes(left.title))).map(world => ({ group: 'worlds' as const, label: world.title, required: namedTarget('worlds', world.id, world.title), priority: targetGroup === 'worlds' || input.request.includes(world.title), part: `【世界观资料：${world.category} / ${world.title}】\n${world.content}` })),
    ...sortedPlots.map(plot => ({ group: 'plots' as const, label: plot.title, required: namedTarget('plots', plot.id, plot.title), priority: targetGroup === 'plots' || input.request.includes(plot.title) || globalContinuation && nextPlotIds.has(plot.id), part: `【大纲资料：${plot.type === 'volume' ? '卷' : '章节'} / ${plot.title}】\n状态：${plot.status === 'completed' ? '已完成' : '待写作'}\n${plot.summary}` })),
    ...(input.foreshadowings || []).filter(row => row.novelId === input.novel.id).map(thread => ({ group: 'threads' as const, label: thread.title, required: namedTarget('threads', thread.id, thread.title), priority: input.request.includes(thread.title), part: `【伏笔资料：${thread.title}】\n状态：${thread.status}\n${thread.description}` })),
  ];
  const omittedGroups: Record<Group, number> = { characters: 0, worlds: 0, plots: 0, threads: 0 };
  let targetIncluded = 0;
  for (const candidate of candidates.filter(row => row.required)) {
    if (!fits(candidate.part)) return result(`明确指定的资料“${candidate.label}”无法完整带入本次对话范围，未发送模型请求。请缩小正文或目标资料范围后重试。`);
    if (candidate.group === targetGroup) targetIncluded++;
  }
  for (const candidate of candidates.filter(row => row.priority && !row.required).sort((left, right) => Number(right.group === targetGroup) - Number(left.group === targetGroup))) {
    if (fits(candidate.part)) { if (candidate.group === targetGroup) targetIncluded++; }
    else omittedGroups[candidate.group]++;
  }
  if (targetGroup && candidates.some(row => row.group === targetGroup) && !targetIncluded) return result('本次要处理的设定或大纲资料过长，无法在对话范围中完整带入任何目标条目，未发送模型请求。请明确指定人物、设定条目或卷章范围后重试。');
  for (const chapter of [...chosen.optional].reverse()) {
    const body = reviewVisibleText(chapter.content);
    if (!body.trim()) continue;
    selected.push(chapter);
    if (tokenCount() > tokenBudget - 512) { selected.pop(); omitted.push(`${chapterLabel(chapter)}正文`); }
  }
  const limit = Math.min(100, Math.max(0, Math.floor(input.historyLimit ?? CHAT_HISTORY_LIMIT)));
  const historyBudget = Math.min(6000, Math.max(0, Math.floor((tokenBudget - tokenCount() - 512) * .4)));
  let historyTokens = 0, historyExcerpt = false;
  const keep: ChatMessage[][] = [];
  for (const turn of [...turns].reverse()) {
    if (keep.flat().length + turn.length > limit) break;
    const projected = turn.map(historyProjection), tokens = estimateChatTokens(projected);
    if (historyTokens + tokens > historyBudget) break;
    keep.unshift(projected.map(({ role, content }) => ({ role, content })));
    historyTokens += tokens; historyExcerpt ||= projected.some(row => row.excerpt);
  }
  modelHistory.push(...keep.flat());
  if (eligibleCount > modelHistory.length) omitted.push(`${eligibleCount - modelHistory.length} 条较早或过长的历史消息`);
  if (historyExcerpt) { warnings.push('部分历史消息仅附原文节选；完整对话仍保留在页面和导出中。'); omitted.push('部分历史长消息的中间内容'); }
  for (const candidate of candidates.filter(row => !row.priority && !row.required)) if (!fits(candidate.part)) omittedGroups[candidate.group]++;
  if (omittedGroups.characters) omitted.push(`${omittedGroups.characters} 位人物的详细资料`);
  if (omittedGroups.worlds) omitted.push(`${omittedGroups.worlds} 项世界观资料`);
  if (omittedGroups.plots) omitted.push(`${omittedGroups.plots} 项大纲概要`);
  if (omittedGroups.threads) omitted.push(`${omittedGroups.threads} 条伏笔资料`);
  if (chapters.length && !fits(`【章节目录：只列标题，不代表已读正文】\n${chapters.map(chapterLabel).join('\n')}`)) omitted.push('完整章节目录');
  if (omitted.length) warnings.push('已按输入范围取舍参考资料，请查看本次带入范围；未带入部分不会伪称已阅读。');
  if (tokenCount() > tokenBudget) return result('资料范围说明加入后超出对话输入范围，未发送请求；请缩小章节或历史范围后重试。');
  return result();
}
