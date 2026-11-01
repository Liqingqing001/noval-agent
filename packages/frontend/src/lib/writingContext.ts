import type { Chapter } from '@/types';

function wordNumber(raw: string): number {
  const text = raw.replace(/[,，\s]/g, '');
  if (/^\d+(?:\.\d+)?[千万]?$/.test(text)) return parseFloat(text) * (text.endsWith('万') ? 10000 : text.endsWith('千') ? 1000 : 1);
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
  let total = 0, section = 0, digit = 0;
  for (const char of text) {
    if (char in digits) digit = digits[char];
    else if (char === '万') { total += (section + digit || 1) * 10000; section = 0; digit = 0; }
    else if (char in units) { section += (digit || 1) * units[char]; digit = 0; }
    else return 0;
  }
  return total + section + digit;
}

/** Preserve the full requested range, including Chinese numbers, instead of treating its end as a minimum. */
export function writingRequirement(request: string, customPrompt = ''): string {
  if (!/(?:续写|扩写|重写|补写|撰写|写|创作|生成).{0,24}(?:章|正文)|(?:章节|正文).{0,12}(?:续写|扩写|重写|创作|生成)/.test(request)) return '';
  if (/(?:生成|优化|写|规划).{0,6}(?:大纲|角色|世界观|设定)/.test(request) && !/(?:正文|续写|扩写|重写|写[一二两三四五六七八九十\d]+章)/.test(request)) return '';
  const number = '[\\d零〇一二两三四五六七八九十百千万.,，]+';
  const range = request.match(new RegExp(`(${number})\\s*(?:字\\s*)?(?:[-—－~～至到]|与)\\s*(${number})\\s*字`));
  const single = request.match(new RegExp(`(?:(?:至少|最多|不超过|不少于|大约|约)\\s*)?(${number})\\s*字`));
  if (range) {
    const low = wordNumber(range[1]), high = wordNumber(range[2]);
    if (low > 0 && high >= low) return `\n\n【本次章节字数要求】每章正文 ${low}-${high} 字；同时遵守下限与上限，不要把范围末端当成最低字数。不要用摘要或省略说明代替正文。`;
  }
  if (single) {
    const count = wordNumber(single[1]);
    if (count > 0) return `\n\n【本次章节字数要求】用户原要求：${single[0]}。目标正文 ${count} 字，并保留用户对至少、最多或约数的限定；不要用摘要或省略说明代替正文。`;
  }
  if (/字/.test(customPrompt)) return '';
  return '\n\n【本次章节字数要求】未指定篇幅时，每章正文默认 3000-4000 字；避免摘要和省略说明。';
}

export function timelineContext(chapters: Pick<Chapter, 'title' | 'content'>[]): string {
  if (!chapters.length) return '';
  const start = Math.max(0, chapters.length - 3);
  const entries = chapters.slice(start).map((chapter, index) => {
    const times = chapter.content.replace(/<[^>]*>/g, ' ').match(/(?:上午|下午|晚上|早上)?\s*\d{1,2}[:：]\d{2}|第[一二两三四五六七八九十百\d]+天|[一二两三四五六七八九十百\d]+(?:天|小时)[以之]?后|次[日晨早]|当天|傍晚|清晨|中午|晚上|下午|上午|周[一二三四五六日天]|[一二三四五六七八九十\d]+月[一二三四五六七八九十\d]+[日号]/g);
    return `  - 第${start + index + 1}章《${chapter.title}》：${times?.slice(0, 5).map(time => time.trim()).join(' → ') || '无明确时间标记，按章节顺序核对'}`;
  });
  return `\n\n【时间线提醒】\n${entries.join('\n')}\n续写时核对日期、时段和事件先后；修改既有章节或明确采用倒叙时遵循用户要求，不要无意重复已发生情节。`;
}
