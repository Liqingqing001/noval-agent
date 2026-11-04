import test from 'node:test';
import assert from 'node:assert/strict';
import { SLASH_COMMANDS, findSlashCommand, getSlashCommandSuggestions, isLocalSlashCommandText, parseSlashCommand, resolveTimelineCharacter } from '../src/lib/slashCommands.ts';
import { buildChatContext } from '../src/lib/chatContext.ts';
import { writingRequirement } from '../src/lib/writingContext.ts';

const novel = { id: 'novel-a', title: '夜校', status: 'writing', summary: '校园群像', wordCount: 1, createdAt: 1, updatedAt: 1 };
const chapters = Array.from({ length: 8 }, (_, index) => ({ id: `chapter-${index + 1}`, novelId: novel.id, title: `场景${index + 1}`, sequence: index, content: `BODY_${index + 1}_END 林夏记录当晚线索。`, wordCount: 10, createdAt: 1, updatedAt: 1 }));
const context = result => buildChatContext({ novel, chapters, characters: [], worldSettings: [], plotCards: [], history: [], currentChapterId: 'chapter-2', systemPrompt: '仅按本次范围处理。', request: result.request, reviewCount: result.reviewCount });
const payload = result => result.messages.map(message => message.content).join('\n');

test('one discoverable registry has unique canonical names, aliases and stable local/writing/review grouping', () => {
  assert.equal(SLASH_COMMANDS.length, 17);
  assert.equal(new Set(SLASH_COMMANDS.map(command => command.id)).size, SLASH_COMMANDS.length);
  const names = SLASH_COMMANDS.flatMap(command => [command.id, ...command.aliases]);
  assert.equal(new Set(names).size, names.length);
  const order = { local: 0, writing: 1, review: 2 };
  assert.deepEqual(SLASH_COMMANDS.map(command => order[command.group]), SLASH_COMMANDS.map(command => order[command.group]).sort());
  assert.equal(findSlashCommand('/帮助').id, 'help');
  assert.equal(findSlashCommand('/CONTINUE').id, 'continue');
  assert.ok(getSlashCommandSuggestions('/c').some(command => command.id === 'context'));
  assert.ok(getSlashCommandSuggestions('润色').some(command => command.id === 'polish'));
  assert.ok(getSlashCommandSuggestions('/timeline 林夏').some(command => command.id === 'timeline'));
  assert.equal(getSlashCommandSuggestions('/continue')[0].id, 'continue');
  assert.equal(getSlashCommandSuggestions('/contin')[0].id, 'continue');
  assert.deepEqual(getSlashCommandSuggestions('命令不存在的随机检索'), []);
  assert.notEqual(getSlashCommandSuggestions('')[0], undefined);
});

test('unknown commands and unexpected arguments cannot turn into a local mutation or a provider request', () => {
  assert.equal(parseSlashCommand('请帮我检查章节').kind, 'not-command');
  for (const command of ['/', '//clear', '/unknown', '/clear nonsense', '/clear\n/rewrite 修改结局', '/stop now', '/export md', '/status extra', '/usage model', '/review start', '/prompt 替换要求', '/history 1']) {
    assert.equal(parseSlashCommand(command).kind, 'error', command);
  }
  const clear = parseSlashCommand('  /CLEAR  ');
  assert.equal(clear.kind, 'local'); assert.equal(clear.action, 'clear');
  assert.equal(parseSlashCommand('/清空').action, 'clear');
  assert.equal(parseSlashCommand('/help /续写').argument, 'continue');
  assert.equal(parseSlashCommand('/help missing').kind, 'error');
  assert.equal(parseSlashCommand('/help continue extra').kind, 'error');
});

test('compact arguments are explicit and bounded without changing any transcript', () => {
  const original = structuredClone(chapters);
  assert.equal(parseSlashCommand('/compact').historyLimit, 8);
  assert.equal(parseSlashCommand('/compact ON').historyLimit, 8);
  assert.equal(parseSlashCommand('/压缩 12条').historyLimit, 12);
  assert.equal(parseSlashCommand('/compact off').compactMode, 'off');
  assert.equal(parseSlashCommand('/compact off').historyLimit, undefined);
  for (const value of ['0', '1', '31', '8.5', '-2', 'on please', '2-8']) assert.equal(parseSlashCommand(`/compact ${value}`).kind, 'error', value);
  assert.deepEqual(chapters, original);
});

test('all local commands including aliases stay distinguishable from billed AI commands and legacy local history', () => {
  for (const command of SLASH_COMMANDS) {
    const result = parseSlashCommand(command.name);
    if (command.kind === 'local') {
      assert.equal(result.kind, 'local', command.name);
      assert.ok(isLocalSlashCommandText(`${command.name} invalid argument`));
      for (const alias of command.aliases) assert.ok(isLocalSlashCommandText(`/${alias}`));
    } else {
      assert.equal(isLocalSlashCommandText(command.name), false);
    }
  }
  assert.equal(isLocalSlashCommandText('/unknown'), false);
  assert.equal(isLocalSlashCommandText('讨论 /status 的含义'), false);
  assert.equal(parseSlashCommand('/全书检查').action, 'review');
  assert.equal(findSlashCommand('review').kind, 'local');
  assert.deepEqual(SLASH_COMMANDS.filter(command => command.busyAllowed).map(command => command.id).sort(), ['context', 'help', 'status', 'stop', 'usage']);
});

test('continue preserves the author word-count range and targets current versus whole-book progress correctly', () => {
  const current = parseSlashCommand('/continue 当前 2000字');
  assert.equal(current.kind, 'ai'); assert.equal(current.requiresChapter, true);
  assert.match(current.request, /2000字/);
  assert.equal(current.request.startsWith('/'), false);
  const currentPayload = payload(context(current));
  assert.match(currentPayload, /BODY_2_END/); assert.doesNotMatch(currentPayload, /BODY_8_END/);
  const next = parseSlashCommand('/续写 下一章3000-4000字');
  assert.equal(next.kind, 'ai'); assert.equal(next.requiresChapter, false);
  assert.match(writingRequirement(next.request), /3000-4000/);
  assert.match(payload(context(next)), /BODY_8_END/);
  assert.match(parseSlashCommand('/continue 三章 1500').request, /续写三章/);
  assert.match(parseSlashCommand('/continue 3 1500').request, /每章正文1500字/);
  assert.equal(parseSlashCommand('/continue').requiresChapter, true);
  for (const value of ['当前 0字', '当前 3000-1000字', '当前 50001', '五章 2000', 'next 2000 extra', '当前 三千字']) assert.equal(parseSlashCommand(`/continue ${value}`).kind, 'error', value);
});

test('check scope resolves full requested chapter bodies and remains review-only without a prose-length requirement', () => {
  const current = parseSlashCommand('/检查 当前');
  assert.equal(current.kind, 'ai'); assert.equal(current.syncPolicy, 'review'); assert.equal(current.requiresChapter, true);
  assert.equal(writingRequirement(current.request), '');
  const ranged = parseSlashCommand('/check 3-6');
  assert.equal(ranged.kind, 'ai'); assert.equal(ranged.syncPolicy, 'review');
  assert.deepEqual(context(ranged).sourceChapterIds, ['chapter-3', 'chapter-4', 'chapter-5', 'chapter-6']);
  assert.doesNotMatch(payload(context(ranged)), /BODY_[1278]_END/);
  const recent = parseSlashCommand('/check 最近 3 章');
  assert.equal(recent.kind, 'ai'); assert.equal(recent.reviewCount, 3);
  assert.deepEqual(context(recent).sourceChapterIds, ['chapter-6', 'chapter-7', 'chapter-8']);
  assert.equal(parseSlashCommand('/check recent').reviewCount, 5);
  for (const value of ['3-1', '0-3', '1-21', '最近0章', '最近21章', '明天', 'all']) assert.equal(parseSlashCommand(`/check ${value}`).kind, 'error', value);
});

test('outline optimization and rewrite/polish express their required scopes instead of silently accepting empty instructions', () => {
  assert.equal(parseSlashCommand('/outline').kind, 'ai');
  const optimized = parseSlashCommand('/outline 优化 增加配角线');
  assert.equal(optimized.requiresOutline, true); assert.match(optimized.request, /增加配角线/);
  assert.equal(parseSlashCommand('/outline optimize 增加配角线').requiresOutline, true);
  assert.equal(parseSlashCommand('/outline 校园怪谈').requiresOutline, false);
  assert.equal(parseSlashCommand('/polish').kind, 'error'); assert.equal(parseSlashCommand('/rewrite').kind, 'error');
  const polish = parseSlashCommand('/润色 对话更自然，保留情节');
  assert.equal(polish.kind, 'ai'); assert.equal(polish.requiresChapter, true); assert.equal(polish.requiresRewriteConfirm, false);
  assert.match(polish.request, /完整【修改】/); assert.match(polish.request, /只改指定范围/);
  const rewrite = parseSlashCommand('/rewrite 改成第一人称\n保留结尾线索');
  assert.equal(rewrite.kind, 'ai'); assert.equal(rewrite.requiresRewriteConfirm, true); assert.equal(rewrite.syncPolicy, 'normal');
  assert.match(rewrite.request, /目标范围仅为当前章节/); assert.match(rewrite.request, /保留结尾线索/);
});

test('explicit no-write instructions become review-only while scoped preservation requests still permit intended changes', () => {
  for (const command of ['/polish 不要修改正文，只讨论写法', '/rewrite 先不要重写，只给建议', '/润色 不改原文，仅给对照建议']) {
    const result = parseSlashCommand(command);
    assert.equal(result.kind, 'ai', command);
    assert.equal(result.syncPolicy, 'review', command);
    assert.equal(result.requiresRewriteConfirm, false, command);
    assert.match(result.request, /不改变已保存内容/);
  }
  for (const command of ['/polish 不改人称，只改错别字', '/rewrite 保留结尾，只重写开头', '/polish 不修改人物关系，只让对话更自然', '/rewrite 不要只给建议，直接重写本章']) {
    const result = parseSlashCommand(command);
    assert.equal(result.kind, 'ai', command);
    assert.equal(result.syncPolicy, 'normal', command);
  }
});

test('timeline lookup is exact, alias-aware, same-book and fails safely for ambiguous people', () => {
  const characters = [
    { id: 'a', novelId: novel.id, name: '林夏', aliases: ['小夏'] },
    { id: 'b', novelId: novel.id, name: '林夏的同桌', aliases: ['同桌'] },
    { id: 'foreign', novelId: 'other', name: '林夏', aliases: ['小夏'] },
  ];
  assert.equal(resolveTimelineCharacter('', characters, novel.id).kind, 'none');
  assert.equal(resolveTimelineCharacter('林夏', characters, novel.id).character.id, 'a');
  assert.equal(resolveTimelineCharacter('《小夏》', characters, novel.id).character.id, 'a');
  assert.equal(resolveTimelineCharacter('林', characters, novel.id).kind, 'error');
  assert.equal(resolveTimelineCharacter('林夏', [...characters, { id: 'duplicate', novelId: novel.id, name: '另一个人', aliases: ['林夏'] }], novel.id).kind, 'error');
  assert.equal(parseSlashCommand('/timeline “林夏”').argument, '林夏');
  assert.equal(parseSlashCommand('/timeline 林夏\n/clear').kind, 'error');
});
