import type { Character } from '../types';

export type SlashCommandId = 'help' | 'status' | 'context' | 'compact' | 'clear' | 'export' | 'usage' | 'history' | 'timeline' | 'review' | 'stop' | 'prompt' | 'outline' | 'continue' | 'check' | 'polish' | 'rewrite';
export type SlashLocalAction = Exclude<SlashCommandId, 'outline' | 'continue' | 'check' | 'polish' | 'rewrite'>;
export interface SlashCommandDefinition {
  id: SlashCommandId;
  name: string;
  aliases: readonly string[];
  description: string;
  usage: string;
  examples: readonly string[];
  group: 'local' | 'writing' | 'review';
  kind: 'local' | 'ai';
  busyAllowed: boolean;
  requiresBook: boolean;
  requiresChapter: boolean;
  icon: string;
}
type DefinitionInput = Pick<SlashCommandDefinition, 'aliases' | 'description' | 'usage' | 'examples' | 'group' | 'kind'> & Partial<Pick<SlashCommandDefinition, 'busyAllowed' | 'requiresBook' | 'requiresChapter'>>;
const define = (id: SlashCommandId, input: DefinitionInput): SlashCommandDefinition => ({ id, name: `/${id}`, icon: id, busyAllowed: false, requiresBook: true, requiresChapter: false, ...input });
const GROUP_PRIORITY = { local: 0, writing: 1, review: 2 };

/** One registry powers suggestions, help and execution. Picking a suggestion never runs it. */
export const SLASH_COMMANDS: readonly SlashCommandDefinition[] = [
  define('help', { aliases: ['帮助', '命令'], description: '查看命令帮助，可指定一个命令', usage: '/help [命令]', examples: ['/help', '/help continue'], group: 'local', kind: 'local', busyAllowed: true, requiresBook: false }),
  define('status', { aliases: ['状态'], description: '查看模型、会话和上下文状态', usage: '/status', examples: ['/status'], group: 'local', kind: 'local', busyAllowed: true, requiresBook: false }),
  define('context', { aliases: ['上下文', '资料范围'], description: '查看本次带入的章节与历史范围', usage: '/context', examples: ['/context'], group: 'local', kind: 'local', busyAllowed: true }),
  define('continue', { aliases: ['续写', '继续'], description: '续写当前章节，或按大纲继续下一章、三章', usage: '/continue [当前|下一章|三章] [字数或范围]', examples: ['/continue 当前 2000字', '/continue 下一章 3000-4000字', '/continue 三章 1500字'], group: 'writing', kind: 'ai' }),
  define('outline', { aliases: ['大纲', '提纲'], description: '生成大纲，或用“优化”调整已有大纲', usage: '/outline [需求] 或 /outline 优化 [要求]', examples: ['/outline 校园规则怪谈，五卷群像', '/outline 优化 增加配角线'], group: 'writing', kind: 'ai' }),
  define('check', { aliases: ['检查', '校对'], description: '只审读并提出建议，不自动改稿', usage: '/check [当前|最近N章|起止编号]', examples: ['/check 当前', '/check 最近5章', '/check 1-3'], group: 'review', kind: 'ai' }),
  define('polish', { aliases: ['润色'], description: '按明确要求润色当前章，保留未指定内容', usage: '/polish <润色要求>', examples: ['/polish 对话更自然，保留情节和人称'], group: 'writing', kind: 'ai', requiresChapter: true }),
  define('rewrite', { aliases: ['重写', '改写'], description: '确认范围后按要求重写当前章节', usage: '/rewrite <改写要求>', examples: ['/rewrite 改为第一人称，保留结尾线索'], group: 'writing', kind: 'ai', requiresChapter: true }),
  define('history', { aliases: ['历史', '版本', '版本历史'], description: '打开当前作品的章节版本历史', usage: '/history', examples: ['/history'], group: 'review', kind: 'local' }),
  define('timeline', { aliases: ['时间线', '人物时间线'], description: '打开人物状态时间线，可指定姓名或别名', usage: '/timeline [人物姓名]', examples: ['/timeline', '/timeline 林夏'], group: 'review', kind: 'local' }),
  define('review', { aliases: ['全书检查', '审读'], description: '打开全书一致性检查，不自动调用模型', usage: '/review', examples: ['/review'], group: 'review', kind: 'local' }),
  define('usage', { aliases: ['用量', '预算', '调用'], description: '打开调用记录与预算', usage: '/usage', examples: ['/usage'], group: 'local', kind: 'local', busyAllowed: true, requiresBook: false }),
  define('prompt', { aliases: ['提示词', '本书要求'], description: '查看和编辑本书的自定义提示词', usage: '/prompt', examples: ['/prompt'], group: 'local', kind: 'local' }),
  define('compact', { aliases: ['精简', '压缩'], description: '调整发送给 AI 的历史条数，保留完整会话', usage: '/compact [on|off|2-30]', examples: ['/compact', '/compact off', '/compact 12'], group: 'local', kind: 'local' }),
  define('export', { aliases: ['导出'], description: '将当前完整会话导出为文本', usage: '/export', examples: ['/export'], group: 'local', kind: 'local' }),
  define('stop', { aliases: ['停止', '取消生成'], description: '停止当前生成，保留已收到的文字', usage: '/stop', examples: ['/stop'], group: 'local', kind: 'local', busyAllowed: true, requiresBook: false }),
  define('clear', { aliases: ['清空', '清屏'], description: '确认后清空当前会话，不删除作品资料', usage: '/clear', examples: ['/clear'], group: 'local', kind: 'local' }),
].sort((left, right) => GROUP_PRIORITY[left.group] - GROUP_PRIORITY[right.group]);

export type ParsedSlashCommand =
  | { kind: 'not-command' }
  | { kind: 'error'; message: string; command?: SlashCommandDefinition }
  | { kind: 'local'; command: SlashCommandDefinition; action: SlashLocalAction; argument: string; compactMode?: 'on' | 'off'; historyLimit?: number }
  | { kind: 'ai'; command: SlashCommandDefinition; request: string; reviewCount?: number; requiresChapter: boolean; requiresOutline: boolean; requiresRewriteConfirm: boolean; syncPolicy: 'normal' | 'review' };

export function findSlashCommand(name: string): SlashCommandDefinition | undefined {
  const value = name.trim().replace(/^\//, '').toLocaleLowerCase();
  return SLASH_COMMANDS.find(command => command.id === value || command.aliases.some(alias => alias.toLocaleLowerCase() === value));
}

export function getSlashCommandSuggestions(query: string): SlashCommandDefinition[] {
  const search = (query.trimStart().startsWith('/') ? query.trim().slice(1).split(/\s/, 1)[0] : query.trim()).toLocaleLowerCase();
  if (!search) return [...SLASH_COMMANDS];
  const terms = search.split(/\s+/).filter(Boolean);
  const matching = SLASH_COMMANDS.map((command, index) => {
    const names = [command.id, ...command.aliases].map(name => name.toLocaleLowerCase());
    const content = [command.name, ...command.aliases, command.description, command.usage, ...command.examples].join(' ').toLocaleLowerCase();
    const score = names.some(name => name === search) ? 0 : names.some(name => name.startsWith(search)) ? 1 : terms.every(term => content.includes(term)) ? 2 : 3;
    return { command, score, index };
  }).filter(row => row.score < 3);
  // Canonical/alias completion outranks an incidental mention in /help examples.
  // Keep the remaining rows grouped, instead of moving unrelated help above it.
  const best = Math.min(...matching.map(row => row.score));
  return matching.filter(row => best < 2 ? row.score === best : true).sort((left, right) => GROUP_PRIORITY[left.command.group] - GROUP_PRIORITY[right.command.group] || left.index - right.index).map(row => row.command);
}

/** Even malformed local commands in legacy messages remain local-only history. */
export function isLocalSlashCommandText(text: string): boolean {
  const match = text.trimStart().match(/^\/([^\s/]+)/);
  return !!match && findSlashCommand(match[1])?.kind === 'local';
}

const invalid = (command: SlashCommandDefinition, reason: string): ParsedSlashCommand => ({ kind: 'error', command, message: `${reason} 用法：${command.usage}。` });
const local = (command: SlashCommandDefinition, argument = ''): Extract<ParsedSlashCommand, { kind: 'local' }> => ({ kind: 'local', command, action: command.id as SlashLocalAction, argument });
const ai = (command: SlashCommandDefinition, request: string, options: Partial<Pick<Extract<ParsedSlashCommand, { kind: 'ai' }>, 'reviewCount' | 'requiresChapter' | 'requiresOutline' | 'requiresRewriteConfirm' | 'syncPolicy'>> = {}): Extract<ParsedSlashCommand, { kind: 'ai' }> => ({ kind: 'ai', command, request, requiresChapter: command.requiresChapter, requiresOutline: false, requiresRewriteConfirm: false, syncPolicy: 'normal', ...options });
const unquote = (value: string): string => {
  for (const [start, end] of [['《', '》'], ['“', '”'], ['「', '」'], ['『', '』'], ['"', '"'], ["'", "'"]]) if (value.startsWith(start) && value.endsWith(end) && value.length > start.length + end.length) return value.slice(start.length, -end.length).trim();
  return value;
};

function wordCount(value: string): string | undefined {
  const match = value.match(/^(\d{1,5})(?:\s*[-—－~～至到]\s*(\d{1,5}))?\s*字?$/);
  if (!match) return;
  const low = Number(match[1]), high = match[2] ? Number(match[2]) : low;
  if (low < 1 || high < low || high > 50000) return;
  return match[2] ? `${low}-${high}字` : `${low}字`;
}

function reviewOnlyInstructions(value: string): boolean {
  const noWrite = /(?:不(?:要|用|必|需|需要)?|无需|禁止)\s*(?:直接|自动|实际|再)?\s*(?:修改|改变|改写|重写|润色|覆盖|替换|写入|写|改)\s*(?:(?:已保存的?)?(?:正文|原文|稿件|内容)|当前章节|当前章|这一章|这章|本章|整章|全章|(?=$|[，。；,;\n]))/;
  const onlyAdvice = /(?:只|仅)(?:要|需要)?(?:给出|给|提供)?(?:对照)?(?:建议|讨论|分析|审读|检查)|仅供讨论/;
  const nonNegatedAdvice = value.replace(/(?:不要|不用|无需|不必|不需要|禁止)\s*(?:只|仅)(?:要|需要)?(?:给出|给|提供)?(?:对照)?(?:建议|讨论|分析|审读|检查)/g, '');
  return noWrite.test(value) || onlyAdvice.test(nonNegatedAdvice);
}

/** Parse only. Execution, confirmation, storage and paid calls belong to the panel. */
export function parseSlashCommand(input: string): ParsedSlashCommand {
  const value = input.trim();
  if (!value.startsWith('/')) return { kind: 'not-command' };
  const match = value.match(/^\/([^\s/]+)(?:\s+([\s\S]*))?$/);
  if (!match) return { kind: 'error', message: '请选择一个命令，或输入 /help 查看用法。' };
  const command = findSlashCommand(match[1]), argument = (match[2] || '').trim();
  if (!command) return { kind: 'error', message: `未知命令 /${match[1]}。输入 /help 查看可用命令。` };
  if (command.kind === 'local') {
    if (command.id === 'help') {
      if (!argument) return local(command);
      const target = findSlashCommand(argument);
      return target ? local(command, target.id) : invalid(command, '没有找到这个命令，请使用完整命令名');
    }
    if (command.id === 'compact') {
      if (!argument || /^(?:on|开启|精简)$/i.test(argument)) return { ...local(command, argument), compactMode: 'on', historyLimit: 8 };
      if (/^(?:off|关闭|恢复|常规)$/i.test(argument)) return { ...local(command, argument), compactMode: 'off' };
      const count = argument.match(/^(\d{1,2})(?:条)?$/);
      if (count && Number(count[1]) >= 2 && Number(count[1]) <= 30) return { ...local(command, argument), compactMode: 'on', historyLimit: Number(count[1]) };
      return invalid(command, '历史条数须为 2-30 的整数，或使用 on / off');
    }
    if (command.id === 'timeline') return argument.length <= 120 && !/[\r\n]/.test(argument) ? local(command, unquote(argument)) : invalid(command, '请填写一个完整人物姓名或别名');
    return argument ? invalid(command, '这个命令不接受参数，尚未执行') : local(command);
  }
  if (command.id === 'outline') {
    const optimize = argument.match(/^(?:优化|optimize)(?:\s+([\s\S]*))?$/i);
    if (optimize) return ai(command, `请优化当前大纲，保持已经确定的人物和世界观，并按现有卷与章节结构给出可用的调整。${optimize[1] ? `\n具体要求：${optimize[1]}` : ''}`, { requiresOutline: true });
    return ai(command, argument ? `请根据以下需求生成本书的大纲：\n${argument}\n需求明确时可列出合理假设后直接给出卷结构和章节概要；只追问影响方案的关键缺失信息。` : '请帮我生成这本小说的大纲，请先问我一些关键问题。');
  }
  if (command.id === 'continue') {
    const tokens = argument.replace(/^(当前|本章|下一章|下章|下一|一章|三章)(?=\d)/, '$1 ').split(/\s+/).filter(Boolean);
    let target: 'current' | 'next' | 'three' = 'current';
    const targets: Record<string, 'current' | 'next' | 'three'> = { 当前: 'current', 本章: 'current', current: 'current', 下一章: 'next', 下章: 'next', 下一: 'next', next: 'next', 一章: 'next', '1': 'next', 三章: 'three', three: 'three', '3': 'three' };
    const requested = targets[(tokens[0] || '').toLocaleLowerCase()];
    if (requested) { target = requested; tokens.shift(); }
    const count = tokens.length ? wordCount(tokens.join(' ')) : undefined;
    if (tokens.length && !count) return invalid(command, '请指定当前、下一章或三章；字数使用 1-50000 的阿拉伯数字或范围');
    if (target === 'current') return ai(command, `请续写当前章节正文${count ? `，新增正文${count}` : ''}。衔接现有结尾，不重复已有段落，保留未要求变更的人物与设定。`, { requiresChapter: true });
    const number = target === 'three' ? '三' : '一';
    return ai(command, `请按照大纲顺序，续写${number}章。按照大纲中${target === 'three' ? '待写作的章节情节概要，连续写三章内容' : '下一章待写作的情节概要来写'}${count ? `，每章正文${count}` : ''}。先核对已写进度，不重复已经完成的章节；没有待写情节时请先说明并提出续篇方案，不覆盖已有正文。`);
  }
  if (command.id === 'check') {
    const ending = '只报告通顺性、逻辑、时间顺序和人物行为等问题，并给出原文证据与修改建议；本次仅讨论，不改变已保存内容，不产生自动同步指令。';
    if (!argument || /^(?:当前|本章|current)$/i.test(argument)) return ai(command, `请检查当前章节。${ending}`, { requiresChapter: true, syncPolicy: 'review' });
    const recent = argument.match(/^(?:最近|recent)\s*(\d{1,2})?\s*(?:章)?$/i);
    if (recent) {
      const count = recent[1] ? Number(recent[1]) : 5;
      if (count < 1 || count > 20) return invalid(command, '最近章节数须为 1-20；整本审读可用 /review');
      return ai(command, `请检查最近${count}章；不足时检查现有已写章节，以本次实际附带原文为准。${ending}`, { reviewCount: count, syncPolicy: 'review' });
    }
    const range = argument.match(/^第?(\d{1,4})章?\s*[-—－~～至到]\s*第?(\d{1,4})章?$/);
    if (range) {
      const low = Number(range[1]), high = Number(range[2]);
      if (low < 1 || high < low || high - low + 1 > 20) return invalid(command, '请输入正序章节范围，一次最多检查 20 章；整本审读可用 /review');
      return ai(command, `请检查第${low}章至第${high}章。${ending}`, { reviewCount: high - low + 1, syncPolicy: 'review' });
    }
    return invalid(command, '请使用当前、最近N章或起止编号（例如 1-3）');
  }
  if (!argument) return invalid(command, '请先补充具体要求，尚未调用模型');
  if (reviewOnlyInstructions(argument)) return ai(command, `请只讨论当前章节，并尊重作者本次的讨论范围：\n${argument}\n仅提供可核对的建议或对照片段，不改变已保存内容，不产生自动同步指令。`, { requiresChapter: true, syncPolicy: 'review' });
  if (command.id === 'polish') return ai(command, `请按以下要求润色当前章节：\n${argument}\n只改指定范围，保留未要求变更的情节、视角和设定。每处使用完整【修改】指令，准确引用当前已保存原文；无法唯一定位时先说明，不重发或覆盖整章。`, { requiresChapter: true });
  return ai(command, `请按以下要求重写当前章节正文：\n${argument}\n本次目标范围仅为当前章节，保留未要求变更的人物、设定和其他章节。请输出完整【章节】内容，标题沿用当前章节纯标题；不要声称已经保存，以应用结果为准。`, { requiresChapter: true, requiresRewriteConfirm: true });
}

/** Exact same-book matches only; ambiguous aliases cannot silently pick a person. */
export function resolveTimelineCharacter(name: string, characters: readonly Pick<Character, 'id' | 'novelId' | 'name' | 'aliases'>[], novelId: string): { kind: 'none' } | { kind: 'found'; character: Pick<Character, 'id' | 'novelId' | 'name' | 'aliases'> } | { kind: 'error'; message: string } {
  const requested = unquote(name.trim());
  if (!requested) return { kind: 'none' };
  const matches = characters.filter(character => character.novelId === novelId && (character.name.trim() === requested || character.aliases.some(alias => alias.trim() === requested)));
  if (!matches.length) return { kind: 'error', message: `本书没有找到人物“${requested}”。请使用完整姓名或已有别名。` };
  if (matches.length > 1) return { kind: 'error', message: `“${requested}”对应多个本书人物，请在人物时间线面板中明确选择。` };
  return { kind: 'found', character: matches[0] };
}
