import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_CONFIGS, AgentType } from '../src/types/agents.ts';
import { extractContentBlocks, parseBasicInfo, parseCharacterContent, parseWorldContent, parseChapterContent } from '../src/lib/structuredContent.ts';

// Exercise the shipped format examples with the real write path, never a model or backend.
const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {} };
const { autoSyncContent, parseChapterOutlineContent, parseVolumeContent } = await import('../src/lib/autoSync.ts');
const { useNovelStore } = await import('../src/stores/novelStore.ts');

const prompt = AGENT_CONFIGS[AgentType.MASTER].systemPrompt;
const example = type => {
  const escaped = type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = prompt.match(new RegExp(`【${escaped}】[\\s\\S]*?【/${escaped}】`));
  assert.ok(match, `Missing complete ${type} example`);
  return match[0];
};
function seed(titles) {
  const now = Date.now();
  const chapters = titles.map((title, index) => ({ id: `main-${index}`, novelId: 'prompt-main', title, content: '林逸停在借阅台前。旧表上，两个相同的签名挤在同一格里。', wordCount: 30, sequence: index + 1, createdAt: now, updatedAt: now }));
  const foreign = { id: 'foreign-chapter', novelId: 'prompt-other', title: titles[0] || '图书馆', content: '另一部作品的原文不能被改写。', wordCount: 15, sequence: 1, createdAt: now, updatedAt: now };
  useNovelStore.setState({ novels: [{ id: 'prompt-main', title: '格式契约', status: 'writing', wordCount: 30, createdAt: now, updatedAt: now }, { id: 'prompt-other', title: '另一部作品', status: 'writing', wordCount: 15, createdAt: now, updatedAt: now }], chapters: [...chapters, foreign], characters: [], worldSettings: [], plotCards: [], foreshadowings: [], sessions: [], currentNovelId: 'prompt-main', currentChapterId: chapters[0]?.id || null, lastReadChapterIds: {} });
  return foreign;
}

test('the shipped creation examples have complete parser contracts and retain usable fields', () => {
  const blocks = extractContentBlocks(prompt);
  assert.deepEqual(blocks.map(block => block.type), ['基本信息', '角色', '世界观', '卷', '章节大纲', '章节', '章节列表']);
  assert.ok(blocks.every(block => block.closed && block.body.trim()));
  assert.deepEqual(parseBasicInfo(prompt), { genre: '校园奇幻', summary: '学生发现异常规则，并追查其来源。' });
  const character = parseCharacterContent(prompt)[0];
  assert.equal(character.name, '林逸');
  assert.equal(character.role, 'protagonist');
  for (const field of ['personality', 'background', 'appearance', 'description']) assert.ok(character[field]);
  assert.equal(parseWorldContent(prompt)[0].title, '夜间通行');
  const volume = parseVolumeContent(prompt)[0];
  const outline = parseChapterOutlineContent(prompt)[0];
  assert.equal(outline.volumeTitle, volume.title);
  assert.deepEqual(outline.chapters.map(chapter => chapter.title), ['图书馆', '东楼']);
  assert.ok(outline.chapters.every(chapter => chapter.summary));
  const chapter = parseChapterContent(prompt)[0];
  assert.equal(chapter.title, '图书馆');
  assert.ok(chapter.content.startsWith('林逸停在借阅台前。'));
  assert.equal(parseChapterContent(prompt).length, 1);
});

test('the actual modify, status and delete examples target the intended records in one book', () => {
  const foreign = seed(['图书馆']);
  const state = useNovelStore.getState();
  for (const title of ['图书馆', '东楼']) state.addPlotCard({ novelId: 'prompt-main', type: 'chapter', title, summary: '具体情节', sequence: title === '图书馆' ? 1 : 2, status: 'pending' });
  state.addPlotCard({ novelId: 'prompt-other', type: 'chapter', title: '图书馆', summary: '另一部作品', sequence: 1, status: 'pending', statusMode: 'manual' });
  const modify = autoSyncContent(example('修改'), 'prompt-main');
  assert.equal(modify.modifyCount, 1);
  assert.ok(useNovelStore.getState().chapters.find(chapter => chapter.id === 'main-0').content.startsWith('林逸在借阅台前站定，先看了一眼墙上的时钟。'));
  assert.equal(autoSyncContent(example('章节列表'), 'prompt-main').statusCount, 2);
  assert.equal(useNovelStore.getState().plotCards.find(card => card.novelId === 'prompt-main' && card.title === '图书馆').status, 'completed');
  assert.equal(useNovelStore.getState().plotCards.find(card => card.novelId === 'prompt-other').status, 'pending');
  assert.equal(autoSyncContent(example('删除'), 'prompt-main').deleteCount, 1);
  assert.deepEqual(useNovelStore.getState().chapters, [foreign]);
});
