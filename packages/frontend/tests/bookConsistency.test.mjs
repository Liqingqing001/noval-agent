import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConsistencyComparisons, buildConsistencyPlan, CONSISTENCY_CALL_LIMIT, consistencyBatchMessages, consistencyFingerprint, consistencyModelKey, localConsistencyIssues, parseConsistencyBatch, parseConsistencyComparison, revalidateConsistencyIssue, runConsistencyCheck } from '../src/lib/bookConsistency.ts';
import { createDefaultConfig } from '../src/lib/modelConfig.ts';
import { reviewVisibleText } from '../src/lib/reviewText.ts';

function fixture() {
  return {
    novel: { id: 'book-a', title: '检查案例', status: 'completed', wordCount: 30, createdAt: 1, updatedAt: 1 },
    chapters: [
      { id: 'chapter-a', novelId: 'book-a', title: '纸条', content: '林遥把唯一的钥匙交给陈默。她的右手没有受伤。', sequence: 1, wordCount: 20, createdAt: 1, updatedAt: 1 },
      { id: 'chapter-b', novelId: 'book-a', title: '门口', content: '林遥一直独自保管着唯一的钥匙。右手的伤口还在流血。', sequence: 2, wordCount: 20, createdAt: 1, updatedAt: 1 },
    ],
    characters: [{ id: 'person-a', novelId: 'book-a', name: '林遥', aliases: ['小林'], description: '高二学生。', relationships: [] }],
    worldSettings: [{ id: 'world-a', novelId: 'book-a', category: '规则', title: '钥匙', content: '校门只有一把钥匙。' }],
    plotCards: [], foreshadowings: [],
  };
}
function replyFor(messages, { facts = true } = {}) {
  const data = JSON.parse(messages.at(-1).content);
  if (data.segments) {
    const chapters = data.segments.filter(segment => segment.sourceType === 'chapter');
    return JSON.stringify({ reviewedSegmentIds: data.segments.map(segment => segment.id), issues: [], facts: facts ? chapters.slice(0, 2).map(segment => ({ entity: '林遥', characterId: 'person-a', dimension: '物品', value: segment.text.slice(0, 60), evidence: { segmentId: segment.id, quote: segment.text.slice(0, 18) } })) : [] });
  }
  return JSON.stringify({ issues: [{ category: 'state', severity: 'warning', title: '钥匙归属需要核对', detail: '可能存在转交后的状态遗漏，也可能中间有取回过程。', suggestion: '核对两章之间的取回情节。', evidence: data.facts.slice(0, 2).map(fact => ({ factId: fact.id, quote: fact.evidence.quote })) }] });
}
function options(book, overrides = {}) {
  let current;
  return { book, modelKey: 'mock-model', signal: new AbortController().signal, generate: async messages => replyFor(messages), save: async run => { current = structuredClone(run); }, progress: () => {}, getCurrent: () => current, ...overrides };
}

test('fingerprints scope to one book and detect every local-check input including completion status', () => {
  const book = fixture(), start = consistencyFingerprint(book);
  const foreign = structuredClone(book); foreign.chapters.push({ ...book.chapters[0], id: 'foreign', novelId: 'other', content: '别书内容' });
  assert.equal(consistencyFingerprint(foreign), start);
  const timestamp = structuredClone(book); timestamp.chapters[0].updatedAt = 900; assert.equal(consistencyFingerprint(timestamp), start);
  for (const mutate of [value => value.novel.status = 'draft', value => value.chapters[1].content += '新内容', value => value.characters[0].aliases.push('另一个名字'), value => value.worldSettings[0].content += '但有备用钥匙', value => value.chapters[0].sequence = 3]) {
    const changed = structuredClone(book); mutate(changed); assert.notEqual(consistencyFingerprint(changed), start);
  }
});

test('local rules detect concrete broken references and chronology without editing the book', () => {
  const book = fixture(); book.characters[0].relationships.push({ targetId: 'foreign-person', kind: 'ally', label: '同伴' }); book.characters[0].firstAppearanceChapterId = 'missing';
  book.plotCards.push({ id: 'outline', novelId: 'book-a', type: 'chapter', title: '失效大纲', summary: '', sequence: 1, status: 'completed', chapterId: 'missing', volumeId: 'missing-volume', createdAt: 1, updatedAt: 1 });
  book.foreshadowings.push({ id: 'thread', novelId: 'book-a', title: '门锁', description: '钥匙', plantedChapterId: 'chapter-b', resolvedChapterId: 'chapter-a', status: 'resolved', createdAt: 1, updatedAt: 1 }, { id: 'open-thread', novelId: 'book-a', title: '尾声', description: '', status: 'planted', createdAt: 1, updatedAt: 1 });
  const snapshot = structuredClone(book), issues = localConsistencyIssues(book), titles = issues.map(issue => issue.title);
  for (const title of ['人物关系目标不存在', '人物初登场关联失效', '大纲章节关联失效', '章节大纲所属卷失效', '大纲完成状态缺少正文依据', '伏笔回收早于埋下', '完本作品仍有未回收伏笔']) assert.ok(titles.includes(title), title);
  assert.ok(issues.every(issue => issue.origin === 'local' && issue.verified)); assert.deepEqual(book, snapshot);
});

test('duplicate titles, sequences, aliases and empty chapters are reviewable data issues, not semantic success', () => {
  const book = fixture(); book.chapters[1] = { ...book.chapters[1], title: '第2章 纸条', sequence: 1, content: '' };
  book.characters.push({ ...book.characters[0], id: 'person-b', name: '陈默', aliases: ['小林'] });
  const titles = localConsistencyIssues(book).map(issue => issue.title);
  for (const title of ['章节标题重复', '章节序号重复', '人物姓名或别名重合', '章节尚无正文']) assert.ok(titles.includes(title));
  book.chapters[1].sequence = 5; assert.ok(localConsistencyIssues(book).some(issue => issue.title === '章节序号有空缺'));
});

test('empty rich-text editor documents count as empty chapters and cannot justify a completed outline', () => {
  for (const content of ['<p></p>', '<p><br></p>', '<p> &nbsp; </p>']) {
    const book = fixture(); book.chapters[0].content = content;
    book.plotCards.push({ id: 'empty-outline', novelId: book.novel.id, type: 'chapter', title: '空章大纲', summary: '', sequence: 1, status: 'completed', chapterId: book.chapters[0].id, createdAt: 1, updatedAt: 1 });
    const issues = localConsistencyIssues(book);
    assert.ok(issues.some(issue => issue.title === '章节尚无正文' && issue.chapterIds.includes(book.chapters[0].id)));
    assert.ok(issues.some(issue => issue.title === '大纲完成状态缺少正文依据'));
  }
});

test('the plan preserves every Unicode code point and all saved reference text in bounded batches', () => {
  const book = fixture(); book.chapters[0].content = '<p>第一段<b>😀文字</b></p><p>第二段 &amp; 收尾。</p>' + '<p>后文😀。'.repeat(3000) + '</p>';
  const plan = buildConsistencyPlan(book), chapter = plan.segments.filter(row => row.sourceId === 'chapter-a');
  assert.equal(chapter.map(row => row.text).join(''), reviewVisibleText(book.chapters[0].content));
  assert.ok(plan.batches.every(batch => batch.segments.reduce((sum, segment) => sum + segment.end - segment.start, 0) <= 7200));
  assert.ok(plan.batches.every(batch => JSON.stringify(consistencyBatchMessages(book, batch)).length <= 32000));
  assert.equal(plan.totalCharacters, book.chapters.reduce((sum, row) => sum + Array.from(reviewVisibleText(row.content)).length, 0));
  assert.ok(plan.referenceCharacters > 0); assert.ok(plan.maxCalls <= CONSISTENCY_CALL_LIMIT); assert.ok(plan.limitations.some(text => text.includes('最多 8 条')));
});

test('oversized catalogs fail planning explicitly rather than silently truncating or dispatching oversized prompts', () => {
  const book = fixture(); book.characters[0].aliases = ['名字'.repeat(18000)];
  assert.throws(() => buildConsistencyPlan(book), /32000.*尚未发送/);
});

test('batch parsing verifies exact visible-source quotes and rejects invented evidence from fact comparisons', () => {
  const book = fixture(), batch = buildConsistencyPlan(book).batches[0], source = batch.segments[0];
  const data = JSON.parse(replyFor(consistencyBatchMessages(book, batch)));
  data.issues.push({ category: 'state', title: '虚构证据', evidence: [{ segmentId: source.id, quote: '此句从未出现' }] });
  data.facts.push({ entity: '林遥', value: '从未发生的状态', evidence: { segmentId: source.id, quote: '虚构原句' } });
  const parsed = parseConsistencyBatch(JSON.stringify(data), batch, book);
  assert.equal(parsed.issues[0].verified, false); assert.equal(parsed.facts.length, 2);
  assert.ok(parsed.facts.every(fact => fact.evidence.verified));
  data.reviewedSegmentIds.pop(); assert.throws(() => parseConsistencyBatch(JSON.stringify(data), batch, book), /全部文本分段/);
  data.reviewedSegmentIds.push('unknown-segment'); assert.throws(() => parseConsistencyBatch(JSON.stringify(data), batch, book), /全部文本分段/);
  assert.throws(() => parseConsistencyBatch('{"reviewedSegmentIds":', batch, book), /完整 JSON/);
});

test('overlong evidence cannot become verified by keeping only an otherwise valid prefix', () => {
  const book = fixture(); book.chapters[0].content = '真'.repeat(610);
  const batch = buildConsistencyPlan(book).batches[0], segment = batch.segments[0];
  const parsed = parseConsistencyBatch(JSON.stringify({ reviewedSegmentIds: batch.segments.map(row => row.id), issues: [{ title: '长引文', evidence: [{ segmentId: segment.id, quote: '真'.repeat(600) + '假' }] }], facts: [] }), batch, book);
  assert.equal(parsed.issues[0].verified, false);
});

test('cross-batch comparisons cover every same-entity fact pair with bounded payloads', () => {
  const facts = Array.from({ length: 60 }, (_, index) => ({ id: `fact-${index}`, entity: '林遥', characterId: 'person-a', dimension: '状态', value: '状'.repeat(200), evidence: { sourceType: 'chapter', sourceId: `chapter-${index}`, chapterId: `chapter-${index}`, quote: '原'.repeat(500), verified: true } }));
  const comparisons = buildConsistencyComparisons(facts);
  assert.ok(comparisons.every(batch => JSON.stringify(batch.facts).length < 16000));
  for (let first = 0; first < facts.length; first++) for (let second = first + 1; second < facts.length; second++) assert.ok(comparisons.some(batch => batch.facts.some(row => row.id === facts[first].id) && batch.facts.some(row => row.id === facts[second].id)));
});

test('a complete check serially reads full source then compares verified facts and never mutates manuscript', async () => {
  const book = fixture(), snapshot = structuredClone(book), calls = [];
  const config = options(book, { generate: async messages => { calls.push(messages); return replyFor(messages); } });
  const run = await runConsistencyCheck(config);
  assert.equal(run.status, 'completed'); assert.equal(calls.length, 2); assert.equal(run.completedBatches, 2); assert.equal(run.totalBatches, 2);
  assert.equal(run.issues.length, 1); assert.equal(run.issues[0].verified, true); assert.deepEqual(new Set(run.issues[0].chapterIds), new Set(['chapter-a', 'chapter-b'])); assert.deepEqual(book, snapshot);
  assert.equal(config.getCurrent().status, 'completed');
});

test('provider failure preserves streamed partial and continuing reuses paid source batches', async () => {
  const book = fixture(); let current, calls = 0;
  await assert.rejects(runConsistencyCheck(options(book, { partialText: () => '未完成的检查文字', save: async run => { current = structuredClone(run); }, generate: async messages => { calls++; if (JSON.parse(messages.at(-1).content).facts) throw new Error('模拟服务断开'); return replyFor(messages); } })), /模拟服务断开/);
  assert.equal(current.status, 'failed'); assert.equal(current.lastAttempt.text, '未完成的检查文字'); assert.equal(Object.keys(current.batches).length, 1); assert.equal(calls, 2);
  let resumedCalls = 0;
  const completed = await runConsistencyCheck(options(book, { run: current, generate: async messages => { resumedCalls++; assert.ok(JSON.parse(messages.at(-1).content).facts); return replyFor(messages); } }));
  assert.equal(completed.status, 'completed'); assert.equal(resumedCalls, 1);
});

test('cancellation saves completed batches and never silently sends the following request', async () => {
  const book = fixture(); book.chapters[0].content = '正文。'.repeat(6000); const controller = new AbortController(); let current, calls = 0;
  await assert.rejects(runConsistencyCheck(options(book, { signal: controller.signal, save: async run => { current = structuredClone(run); if (run.completedBatches === 1) controller.abort(); }, generate: async messages => { calls++; return replyFor(messages, { facts: false }); } })), /已停止/);
  assert.equal(calls, 1); assert.equal(current.status, 'cancelled'); assert.equal(current.completedBatches, 1);
});

test('source or model changes invalidate paid cache and stale plans cannot dispatch', async () => {
  const book = fixture(), first = await runConsistencyCheck(options(book));
  for (const changes of [config => config.modelKey = 'other-model', config => config.book.chapters[0].content += '新稿']) {
    const currentBook = structuredClone(book), config = options(currentBook, { run: first }); changes(config); let calls = 0; config.generate = async messages => { calls++; return replyFor(messages); };
    await runConsistencyCheck(config); assert.equal(calls, 2);
  }
  const plan = buildConsistencyPlan(book); book.chapters[0].content += '更新'; let calls = 0;
  await assert.rejects(runConsistencyCheck(options(book, { plan, generate: async () => { calls++; return ''; } })), /作品已变化/); assert.equal(calls, 0);
});

test('revalidated evidence derives chapter links from source identity and distrusts a changed quote', () => {
  const book = fixture(), batch = buildConsistencyPlan(book).batches[0], parsed = parseConsistencyBatch(JSON.stringify({ reviewedSegmentIds: batch.segments.map(row => row.id), issues: [{ title: '疑点', evidence: [{ segmentId: batch.segments[0].id, quote: '林遥把唯一的钥匙交给陈默' }] }], facts: [] }), batch, book);
  parsed.issues[0].evidence[0].chapterId = 'chapter-b'; parsed.issues[0].chapterIds = ['chapter-b'];
  const valid = revalidateConsistencyIssue(parsed.issues[0], book); assert.equal(valid.evidence[0].chapterId, 'chapter-a'); assert.deepEqual(valid.chapterIds, ['chapter-a']);
  book.chapters[0].content = '完全不同的新正文。'; const invalid = revalidateConsistencyIssue(valid, book); assert.equal(invalid.verified, false); assert.equal(invalid.evidence[0].verified, false); assert.deepEqual(invalid.chapterIds, []);
});

test('one explicit invocation stops at its request ceiling, with all completed batches available for manual continue', async () => {
  const book = fixture(); book.chapters = Array.from({ length: CONSISTENCY_CALL_LIMIT + 2 }, (_, index) => ({ ...book.chapters[0], id: `long-${index}`, title: `章节${index}`, sequence: index + 1, content: '长'.repeat(7200) })); book.characters = []; book.worldSettings = [];
  let current, calls = 0;
  await assert.rejects(runConsistencyCheck(options(book, { partialText: () => '上一批已经成功保存的完整回复', save: async run => { current = structuredClone(run); }, generate: async messages => { calls++; return replyFor(messages, { facts: false }); } })), /请求上限.*尚未完成/);
  assert.equal(calls, CONSISTENCY_CALL_LIMIT); assert.equal(current.status, 'failed'); assert.equal(current.completedBatches, CONSISTENCY_CALL_LIMIT);
  assert.equal(current.lastAttempt.text, '', 'a local call ceiling must not label the prior successful reply as a failed partial');
  const resumed = await runConsistencyCheck(options(book, { run: current, generate: async messages => replyFor(messages, { facts: false }) })); assert.equal(resumed.status, 'completed'); assert.equal(resumed.completedBatches, CONSISTENCY_CALL_LIMIT + 2);
});

test('model cache identity includes request configuration without exposing keys or endpoints', () => {
  const config = { ...createDefaultConfig('openai'), apiKey: 'private-key', baseUrl: 'https://private.example/v1?secret=hidden' }, first = consistencyModelKey(config);
  assert.ok(!first.includes('private')); assert.ok(!first.includes('secret')); assert.equal(consistencyModelKey({ ...config, apiKey: 'replacement-secret' }), first);
  assert.notEqual(consistencyModelKey({ ...config, model: 'other' }), first); assert.notEqual(consistencyModelKey({ ...config, maxTokens: config.maxTokens + 1 }), first); assert.notEqual(consistencyModelKey({ ...config, baseUrl: 'https://other.example/v1' }), first);
});

test('comparison output cannot invent fact references or confirm a single quoted assertion as a cross-book contradiction', () => {
  const book = fixture(), batch = buildConsistencyPlan(book).batches[0], parsed = parseConsistencyBatch(replyFor(consistencyBatchMessages(book, batch)), batch, book), comparison = buildConsistencyComparisons(parsed.facts)[0];
  const issue = parseConsistencyComparison(JSON.stringify({ issues: [{ title: '虚构比较', evidence: [{ factId: 'missing', quote: '伪造' }] }] }), comparison, book)[0]; assert.equal(issue.verified, false);
  const one = parseConsistencyComparison(JSON.stringify({ issues: [{ title: '单句结论', evidence: [{ factId: comparison.facts[0].id, quote: comparison.facts[0].evidence.quote }] }] }), comparison, book)[0]; assert.equal(one.verified, false);
});
