import test from 'node:test';
import assert from 'node:assert/strict';
import { countReferenceCharacters, decodeReferenceFile, defaultReferenceBrief, parseReferenceSource, parseReferenceReport, referenceAnalysisReady, referenceAnalysisKey, referenceCreationMessages, referenceDraftContext, referenceDraftWarnings, referenceExportData, referenceHash, referenceOverlap, referencePlainHtml } from '../src/lib/referenceCreation.ts';
import { createReferenceWorkspace } from '../src/stores/referenceStore.ts';
import { createDefaultConfig } from '../src/lib/modelConfig.ts';
import { analyzeReference, referenceAnalysisPlan, referenceChapters, referenceProjectReady } from '../src/lib/referenceAnalysis.ts';

const source = ['清晨的雨落在窗台，小路通向一座还没开门的旧书店。'.repeat(4), '午后的灯亮起来，守店人把书页抚平，故事在安静中收尾。'.repeat(4)].join('\n\n');
const paragraphs = parseReferenceSource(source).paragraphs;
const reportInput = () => ({ summary: '先铺设环境，再收束情绪。', audience: '文本推断：日常故事读者。', style: '短句，第三人称，具体物象。', methods: '开场铺设悬念，结尾回应物象。', structure: paragraphs.map(p => ({ paragraphId: p.id, role: '铺设或收束', technique: '细节描写' })), evidence: [{ paragraphId: 'P1', quote: '清晨的雨落在窗台', conclusion: '以环境开场' }], limitations: ['风格判断仅为模型解读。'] });
const makeProject = () => ({ id: 'reference', title: '参考文章', source, sourceHash: 'source-hash', createdAt: 1, updatedAt: 1, style: '短句，克制的语气。', methods: '设置问题并回应。', brief: { ...defaultReferenceBrief(), topic: '海岛上的天文观测', audience: '科幻读者', min: 500, max: 1000 }, outline: '开场介绍海岛，再写观测挑战，最后展望。', imports: [] });
const memory = new Map();
let rejectWrites = false;
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => { if (rejectWrites) throw new Error('quota'); memory.set(key, value); }, removeItem: key => memory.delete(key) };

test('Unicode length, canonical paragraphs and offsets do not silently truncate', () => {
  assert.equal(countReferenceCharacters('中 😀\n文'), 3);
  const parsed = parseReferenceSource('\uFEFF' + source.replace(/\n/g, '\r\n'));
  assert.equal(parsed.paragraphs.length, 2);
  for (const p of parsed.paragraphs) assert.equal(Array.from(parsed.text).slice(p.start, p.end).join(''), p.text);
  assert.equal(parseReferenceSource('文'.repeat(20001)).metrics.characters, 20001);
  assert.equal(parseReferenceSource(Array(81).fill('段落').join('\n')).paragraphs.length, 81);
  assert.throws(() => parseReferenceSource('文'.repeat(1000001)), /不会自动截断/);
  assert.throws(() => parseReferenceSource('文'.repeat(99)), /至少 100/);
  assert.throws(() => parseReferenceSource(source + '\u0001'), /控制字符/);
});

test('Windows text encodings and Markdown are decoded; disguised binary and oversized files are rejected', () => {
  assert.equal(decodeReferenceFile(new TextEncoder().encode(source), '文章.md').text, source);
  const utf16 = new Uint8Array([255, 254, ...Buffer.from(source, 'utf16le')]);
  assert.equal(decodeReferenceFile(utf16, '文章.TXT').text, source);
  assert.equal(decodeReferenceFile(Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4]), 'gb.txt').text, '中文');
  assert.throws(() => decodeReferenceFile(Uint8Array.from([0x50, 0x4b, 0, 1]), '伪装.txt'), /不是纯文本/);
  assert.throws(() => decodeReferenceFile(new Uint8Array(10 * 1024 * 1024 + 1), '超限.txt'), /10 MiB/);
  assert.throws(() => decodeReferenceFile(new Uint8Array(), '参考.docx'), /尚未开放/);
});

test('reports verify exact local quotes and mark incomplete scope instead of claiming success', () => {
  const complete = parseReferenceReport('```json\n' + JSON.stringify(reportInput()) + '\n```', paragraphs);
  assert.equal(referenceAnalysisReady(complete), true);
  const incomplete = reportInput(); incomplete.structure.pop();
  const result = parseReferenceReport(JSON.stringify(incomplete), paragraphs);
  assert.deepEqual(result.missingParagraphs, ['P2']);
  assert.equal(referenceAnalysisReady(result), false);
  const fake = reportInput(); fake.evidence[0].quote = '原文根本没有这一句'; fake.evidence[0].verified = true;
  assert.equal(referenceAnalysisReady(parseReferenceReport(JSON.stringify(fake), paragraphs)), false);
  const bad = reportInput(); bad.structure[0].paragraphId = 'P99';
  assert.throws(() => parseReferenceReport(JSON.stringify(bad), paragraphs), /不存在/);
  assert.throws(() => parseReferenceReport('{"summary":', paragraphs), /完整 JSON/);
});

test('generation sends only selected reusable cards and the new brief, never the source', () => {
  const project = makeProject(); project.source += '\n【角色】原作秘密角色【/角色】';
  for (const mode of ['both', 'style', 'structure']) {
    project.brief.mode = mode;
    const messages = referenceCreationMessages(project, 'draft');
    const text = JSON.stringify(messages);
    assert.ok(!text.includes('清晨的雨落在窗台'));
    assert.ok(!text.includes('原作秘密角色'));
    const data = JSON.parse(messages[1].content);
    assert.equal(Boolean(data.selected.style), mode !== 'structure');
    assert.equal(Boolean(data.selected.methods), mode !== 'style');
    assert.equal(data.confirmedOutline, project.outline);
  }
});

test('draft acceptance checks length, completion, version, placeholders and local overlap independently', () => {
  const project = makeProject();
  project.draft = { text: '星光越过海面，新的观测记录在此展开。'.repeat(35), context: referenceDraftContext(project), completedBy: 'model' };
  assert.deepEqual(referenceDraftWarnings(project), []);
  project.brief.topic = '新的主题';
  assert.ok(referenceDraftWarnings(project).some(text => text.includes('旧版本')));
  project.draft.context = referenceDraftContext(project);
  project.draft.completedBy = undefined;
  assert.ok(referenceDraftWarnings(project).some(text => text.includes('尚未确认')));
  project.draft.completedBy = 'manual'; project.draft.text += '【待核实】';
  assert.ok(referenceDraftWarnings(project).some(text => text.includes('占位')));
  project.draft.text = source;
  assert.ok(referenceDraftWarnings(project).some(text => text.includes('不在目标')));
  assert.ok(referenceDraftWarnings(project).some(text => text.includes('连续相同')));
  assert.ok(referenceOverlap('😀'.repeat(30), '😀 '.repeat(30)).length);
});

test('cache identity changes with content and generation config but does not persist credentials', async () => {
  const project = makeProject(), config = createDefaultConfig('custom'); config.model = 'mock-model';
  const initial = await referenceAnalysisKey(project, config);
  assert.equal(initial, await referenceAnalysisKey(project, { ...config, apiKey: 'DIFFERENT_PLACEHOLDER' }));
  assert.notEqual(initial, await referenceAnalysisKey(project, { ...config, maxTokens: config.maxTokens + 1 }));
  assert.notEqual(initial, await referenceAnalysisKey({ ...project, sourceHash: 'different-source' }, config));
  assert.equal((await referenceHash(source)).length, 64);
});

test('plaintext imports escape HTML and structured labels are ordinary text; draft export excludes reference', () => {
  const project = makeProject(); project.draft = { text: '<script>alert(1)</script>\n【角色】新文中的标签【/角色】' };
  const html = referencePlainHtml(project.draft.text);
  assert.ok(!html.includes('<script>')); assert.ok(html.includes('&lt;script&gt;'));
  const exported = JSON.stringify(referenceExportData(project, 'draft'));
  assert.ok(!exported.includes('清晨的雨落在窗台')); assert.ok(exported.includes('新文中的标签'));
});

test('workspace isolates accounts, reuses identical sources, persists drafts, and fails quota writes atomically', () => {
  const workspace = createReferenceWorkspace('test-one');
  const id = workspace.getState().add('文章', source, 'hash');
  assert.equal(workspace.getState().add('同一篇', source, 'hash'), id);
  assert.equal(workspace.getState().projects.length, 1);
  workspace.getState().update(id, { style: '已编辑的文风' });
  assert.equal(createReferenceWorkspace('test-one').getState().projects[0].style, '已编辑的文风');
  assert.equal(createReferenceWorkspace('test-two').getState().projects.length, 0);
  rejectWrites = true;
  try { assert.throws(() => workspace.getState().update(id, { style: '未保存内容' }), /未保存/); }
  finally { rejectWrites = false; }
  assert.equal(workspace.getState().projects[0].style, '已编辑的文风');
  assert.equal(createReferenceWorkspace('test-one').getState().projects[0].style, '已编辑的文风');
});

test('corrupt storage is not overwritten and cached evidence flags are recomputed on reload', () => {
  const key = 'novel-agent-reference:broken'; memory.set(key, '{broken');
  const broken = createReferenceWorkspace('broken');
  assert.ok(broken.getState().warning);
  assert.throws(() => broken.getState().add('新文', source, 'hash'), /未覆盖/);
  assert.equal(memory.get(key), '{broken');
  const store = createReferenceWorkspace('evidence'), id = store.getState().add('文章', source, 'hash');
  const fake = reportInput(); fake.evidence[0] = { paragraphId: 'P1', quote: '不存在的原文', conclusion: '无法核验', verified: true };
  store.getState().update(id, { report: { ...fake, missingParagraphs: [] } });
  assert.equal(createReferenceWorkspace('evidence').getState().projects[0].report.evidence[0].verified, false);
});

const longProject = () => ({ ...makeProject(), source: Array.from({ length: 125 }, (_, index) => index % 25 === 0 ? `第${index / 25 + 1}章 夜航` : `第${index}段。海上的灯光与船员的脚步声交织，新的故事由此展开。`).join('\n\n'), analysisCache: {} });
function mockAnalysis(messages) {
  const input = JSON.parse(messages[1].content);
  if (input.paragraphs) return JSON.stringify({ ...reportInput(), structure: input.paragraphs.map(p => ({ paragraphId: p.id, role: '推进情节', technique: '用细节推进' })), evidence: [{ paragraphId: input.paragraphs[0].id, quote: input.paragraphs[0].text.slice(0, 30), conclusion: '原文的描写依据' }] });
  assert.ok(input.summaries.length <= 8);
  return JSON.stringify({ summary: '综合多个批次的节奏变化。', audience: '文本推断：故事读者', style: '克制的用词与长短句交替。', methods: '悬念、推进、回应。', limitations: ['模型判断可能有误，仅覆盖所选范围。'] });
}

test('a large unbroken paragraph preserves every code point and readable offsets', () => {
  const input = '😀文'.repeat(16000);
  const parsed = parseReferenceSource(input);
  assert.equal(parsed.text, input);
  assert.equal(parsed.paragraphs.map(p => p.text).join(''), input);
  assert.ok(parsed.paragraphs.every(p => Array.from(p.text).length <= 4000));
  for (const paragraph of parsed.paragraphs) assert.equal(Array.from(input).slice(paragraph.start, paragraph.end).join(''), paragraph.text);
});

test('chapter detection and explicit paragraph range determine bounded calls without dropping dialogue lines', () => {
  const project = longProject(), parsed = parseReferenceSource(project.source);
  const chapters = referenceChapters(parsed.paragraphs);
  assert.equal(chapters.length, 5); assert.deepEqual([chapters[1].from, chapters[1].to], [26, 50]);
  const plan = referenceAnalysisPlan(project);
  assert.equal(plan.chunks.length, 4); assert.equal(plan.calls, 5);
  assert.equal(plan.chunks.flat().length, 125);
  assert.ok(plan.chunks.every(chunk => chunk.length <= 40 && countReferenceCharacters(chunk.map(p => p.text).join('')) <= 6000));
  project.selection = { from: 26, to: 50 };
  const selected = referenceAnalysisPlan(project);
  assert.equal(selected.calls, 1); assert.equal(selected.paragraphs[0].id, 'P26');
  project.selection = { from: 50, to: 26 };
  assert.throws(() => referenceAnalysisPlan(project), /起点不能大于终点/);
});

test('hierarchical analysis verifies full coverage and caches only bounded summaries between levels', async () => {
  const project = longProject(); let calls = 0;
  const report = await analyzeReference({ project, key: 'test-key', signal: new AbortController().signal, progress() {}, generate: async messages => { calls++; return mockAnalysis(messages); }, saveCache: async (key, value) => { project.analysisCache[key] = value; } });
  assert.equal(calls, 5); assert.equal(report.structure.length, 125); assert.equal(referenceAnalysisReady(report), true);
  assert.equal(Object.values(project.analysisCache).filter(entry => entry.report).length, 4);
  assert.equal(Object.values(project.analysisCache).filter(entry => entry.synthesis).length, 1);
  assert.ok(report.evidence.every(item => item.verified));
  calls = 0;
  await analyzeReference({ project, key: 'test-key', signal: new AbortController().signal, progress() {}, generate: async messages => { calls++; return mockAnalysis(messages); }, saveCache: async () => {} });
  assert.equal(calls, 0);
});

test('a failed batch stops immediately and explicit resume skips persisted batches', async () => {
  const project = longProject(); let calls = 0;
  const base = { project, key: 'resume-key', signal: new AbortController().signal, progress() {}, saveCache: async (key, value) => { project.analysisCache[key] = value; } };
  await assert.rejects(analyzeReference({ ...base, generate: async messages => { calls++; if (calls === 2) throw new Error('模拟网络中断'); return mockAnalysis(messages); } }), /模拟网络中断/);
  assert.equal(calls, 2); assert.equal(Object.keys(project.analysisCache).length, 1);
  calls = 0;
  const report = await analyzeReference({ ...base, generate: async messages => { calls++; return mockAnalysis(messages); } });
  assert.equal(calls, 4); assert.equal(report.structure.length, 125);
});

test('more than eight batches use bounded multiple summary levels and retain every paragraph', async () => {
  const project = { ...longProject(), source: Array.from({ length: 360 }, (_, index) => `段落${index}。人物在海边等待下一次航行。`).join('\n\n') };
  const plan = referenceAnalysisPlan(project);
  assert.equal(plan.chunks.length, 9); assert.equal(plan.synthesisCalls, 3); assert.equal(plan.calls, 12);
  let calls = 0;
  const report = await analyzeReference({ project, key: 'multi-level', signal: new AbortController().signal, progress() {}, generate: async messages => { calls++; return mockAnalysis(messages); }, saveCache: async () => {} });
  assert.equal(calls, plan.calls); assert.equal(report.structure.length, 360); assert.equal(report.structure.at(-1).paragraphId, 'P360');
  assert.equal(referenceAnalysisReady(report), true);
});

test('cancellation stops further paid requests and does not label earlier work as the full report', async () => {
  const project = longProject(), controller = new AbortController(); let calls = 0;
  await assert.rejects(analyzeReference({ project, key: 'cancel-key', signal: controller.signal, progress() {}, generate: async messages => { calls++; return mockAnalysis(messages); }, saveCache: async (key, value) => { project.analysisCache[key] = value; controller.abort(); } }), /分析已取消/);
  assert.equal(calls, 1); assert.equal(Object.keys(project.analysisCache).length, 1); assert.equal(project.report, undefined);
});

test('changing selected scope blocks reuse for creation and exported reports state the analyzed range', async () => {
  const project = longProject(); project.selection = { from: 26, to: 50 };
  project.report = await analyzeReference({ project, key: 'scope', signal: new AbortController().signal, progress() {}, generate: async messages => mockAnalysis(messages), saveCache: async () => {} });
  project.analyzedRange = { ...project.selection };
  assert.equal(referenceProjectReady(project), true);
  assert.ok(JSON.stringify(referenceExportData(project, 'report')).includes('P26–P50'));
  project.selection = { from: 1, to: 25 };
  assert.equal(referenceProjectReady(project), false);
});

test('overlap scanning handles long books, Unicode, whitespace and hash candidate verification', () => {
  const phrase = '这段连续的中文字符用于检查是否真的重合而不只是哈希值碰撞导致误判。';
  assert.ok(referenceOverlap('文'.repeat(500000) + phrase + '末尾', '新稿开头' + phrase).length);
  assert.deepEqual(referenceOverlap('文'.repeat(500000), '新'.repeat(500)), []);
  assert.ok(referenceOverlap('😀 文'.repeat(40), '😀文'.repeat(40)).length);
});
