import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {} };
const { useNovelStore } = await import('../src/stores/novelStore.ts');
const { applyScopedSlashResponse, appendSlashContinuation } = await import('../src/lib/slashSync.ts');

function setup(content = '林夏回到教室。门口的灯仍亮着。') {
  const store = useNovelStore.getState(); store.clearAll();
  const book = store.addNovel({ title: '当前作品', status: 'writing', wordCount: 0 });
  const other = store.addNovel({ title: '另一本书', status: 'writing', wordCount: 0 });
  const target = store.addChapter({ novelId: book.id, title: '雨夜点名', content, wordCount: content.length, sequence: 1 });
  const neighbor = store.addChapter({ novelId: book.id, title: '钟楼目击', content: '钟楼的钟声响了。', wordCount: 9, sequence: 2 });
  const foreign = store.addChapter({ novelId: other.id, title: '雨夜点名', content: '另一作品的独立正文。', wordCount: 10, sequence: 1 });
  store.setCurrentNovel(book.id); store.setCurrentChapter(target.id);
  return { target, neighbor, foreign, book, scope: { novelId: book.id, chapterId: target.id, title: target.title, content, kind: 'polish' } };
}
const modify = (title, originalContent, newContent) => `【修改】\n目标：章节\n标题：${title}\n原内容：${originalContent}\n新内容：${newContent}\n【/修改】`;
const rewrite = (title, content) => `【章节】\n标题：${title}\n内容：\n${content}\n【/章节】`;
const snapshot = () => structuredClone(useNovelStore.getState().chapters);

test('scoped polish stages sequential edits and performs one current-chapter write', () => {
  const { target, scope } = setup();
  const before = snapshot(), originalUpdate = useNovelStore.getState().updateChapter, writes = [];
  useNovelStore.setState({ updateChapter: (id, update) => { writes.push({ id, update }); originalUpdate(id, update); } });
  try {
    const result = applyScopedSlashResponse(modify(target.title, '林夏回到教室。', '林夏走回教室。') + '\n' + modify(target.title, '门口的灯仍亮着。', '门口的灯始终亮着。'), scope);
    assert.equal(result.state, 'success'); assert.equal(writes.length, 1); assert.equal(writes[0].id, target.id);
    assert.equal(useNovelStore.getState().chapters.find(row => row.id === target.id).content, '林夏走回教室。门口的灯始终亮着。');
    assert.deepEqual(useNovelStore.getState().chapters.filter(row => row.id !== target.id), before.filter(row => row.id !== target.id));
  } finally { useNovelStore.setState({ updateChapter: originalUpdate }); }
});

test('a mixed foreign-chapter edit rejects the whole batch without partial writes', () => {
  const { target, neighbor, scope } = setup(), before = snapshot();
  const result = applyScopedSlashResponse(modify(target.title, '林夏回到教室。', '林夏走回教室。') + '\n' + modify(neighbor.title, '钟声响了', '钟声停了'), scope);
  assert.equal(result.state, 'warning'); assert.match(result.message, /超出当前章节范围.*未写入作品/); assert.deepEqual(snapshot(), before);
});

test('missing original text or incomplete trailing instructions cannot apply earlier valid edits', () => {
  for (const tail of [modify('雨夜点名', '没有这句原文', '新增句子'), modify('雨夜点名', '门口的灯仍亮着。', '改成另一句话。').replace('【/修改】', '')]) {
    const { target, scope } = setup(), before = snapshot();
    assert.equal(applyScopedSlashResponse(modify(target.title, '林夏回到教室。', '林夏走回教室。') + '\n' + tail, scope).state, 'warning');
    assert.deepEqual(snapshot(), before);
  }
});

test('foreign entity, destructive, creation and fenced example scopes never reach a write', () => {
  for (const extra of ['【删除】\n目标：章节\n标题：钟楼目击\n【/删除】', '【世界观】\n名称：校规\n内容：擅自变更\n【/世界观】', '## 角色\n姓名：误建角色', rewrite('雨夜点名', '不能混入全章覆盖'), '```\n' + modify('雨夜点名', '林夏回到教室。', '不执行示例') + '\n```']) {
    const { target, scope } = setup(), before = snapshot();
    const response = modify(target.title, '林夏回到教室。', '林夏走回教室。') + '\n' + extra;
    assert.equal(applyScopedSlashResponse(response, scope).state, 'warning'); assert.deepEqual(snapshot(), before);
  }
});

test('rewrite changes only the confirmed chapter body and preserves title, order and other books', () => {
  const { target, scope } = setup('<p><strong>林夏</strong>回到教室。</p>'), before = snapshot();
  const result = applyScopedSlashResponse(rewrite('第一章 雨夜点名', '林夏站在教室门边，认真听完了新的点名规则。'), { ...scope, kind: 'rewrite' });
  assert.equal(result.state, 'success');
  const after = useNovelStore.getState().chapters, changed = after.find(row => row.id === target.id);
  assert.equal(changed.title, target.title); assert.equal(changed.sequence, target.sequence);
  assert.equal(changed.content, '林夏站在教室门边，认真听完了新的点名规则。');
  assert.deepEqual(after.filter(row => row.id !== target.id), before.filter(row => row.id !== target.id));
});

test('rewrite rejects another title, multiple chapters, recovered open tags and side-effect blocks', () => {
  for (const response of [rewrite('钟楼目击', '另一章的完整新正文。'), rewrite('雨夜点名', '当前章候选。') + '\n' + rewrite('钟楼目击', '不能覆写另一章。'), rewrite('雨夜点名', '缺少闭合标签的长候选。'.repeat(20)).replace('【/章节】', ''), rewrite('雨夜点名', '当前章候选。') + '\n【章节列表】\n第2章：钟楼目击 ✅ 已完成\n【/章节列表】']) {
    const { scope } = setup(), before = snapshot();
    assert.equal(applyScopedSlashResponse(response, { ...scope, kind: 'rewrite' }).state, 'warning'); assert.deepEqual(snapshot(), before);
  }
});

test('stale, renamed, deleted and switched targets stay untouched', () => {
  for (const mutate of [({ target }) => useNovelStore.getState().updateChapter(target.id, { content: '作者已经另行改稿。' }), ({ target }) => useNovelStore.getState().updateChapter(target.id, { title: '作者已重命名' }), ({ target }) => useNovelStore.getState().deleteChapter(target.id), ({ foreign }) => useNovelStore.getState().setCurrentNovel(foreign.novelId)]) {
    const data = setup(); mutate(data); const before = snapshot();
    assert.equal(applyScopedSlashResponse(modify(data.target.title, '林夏回到教室。', '不能覆盖作者的新稿'), data.scope).state, 'warning'); assert.deepEqual(snapshot(), before);
  }
});

test('ambiguous normalized titles block a write even when a matching chapter ID is captured', () => {
  const { scope, book } = setup();
  useNovelStore.getState().addChapter({ novelId: book.id, title: '第2章 雨夜点名', content: '同名章另有正文。', wordCount: 8, sequence: 3 });
  const before = snapshot();
  assert.equal(applyScopedSlashResponse(modify('雨夜点名', '林夏回到教室。', '不能猜测同名章'), scope).state, 'warning'); assert.deepEqual(snapshot(), before);
});

test('current continuation appends only new prose and removes a repeated complete source prefix', () => {
  for (const repeated of [false, true]) {
    const { target, scope } = setup(), before = snapshot();
    const response = rewrite(target.title, (repeated ? scope.content + '\n\n' : '') + '她拿起桌上的点名册。');
    assert.equal(applyScopedSlashResponse(response, { ...scope, kind: 'continue' }).state, 'success');
    assert.equal(useNovelStore.getState().chapters.find(row => row.id === target.id).content, scope.content + '\n\n她拿起桌上的点名册。');
    assert.deepEqual(snapshot().filter(row => row.id !== target.id), before.filter(row => row.id !== target.id));
  }
});

test('continuation preserves the exact original HTML prefix and escapes appended visible prose', () => {
  const source = '<p><strong>林夏</strong>回到教室。</p><p>门口的灯仍亮着。</p>';
  const { target, scope } = setup(source);
  assert.equal(applyScopedSlashResponse(rewrite(target.title, '她看见 A&B 的签名。'), { ...scope, kind: 'continue' }).state, 'success');
  const content = useNovelStore.getState().chapters.find(row => row.id === target.id).content;
  assert.equal(content, source + '<p>她看见 A&amp;B 的签名。</p>');
  assert.equal(appendSlashContinuation(source, '林夏回到教室。\n门口的灯仍亮着。\n新增一段。').content, source + '<p>新增一段。</p>');
});

test('continuation modification blocks may only append, never revise or remove an existing sentence', () => {
  const { target, scope } = setup();
  const appended = applyScopedSlashResponse(modify(target.title, '门口的灯仍亮着。', '门口的灯仍亮着。她停在门边。'), { ...scope, kind: 'continue' });
  assert.equal(appended.state, 'success');
  assert.equal(useNovelStore.getState().chapters.find(row => row.id === target.id).content, scope.content + '\n\n她停在门边。');
  const fresh = setup(), before = snapshot();
  assert.equal(applyScopedSlashResponse(modify(fresh.target.title, '林夏回到教室。', '林夏离开了校园。'), { ...fresh.scope, kind: 'continue' }).state, 'warning');
  assert.deepEqual(snapshot(), before);
});

test('continuation refuses mixed foreign scopes and partly repeated or edited source prefixes', () => {
  const { target, neighbor, scope } = setup(), before = snapshot();
  assert.equal(applyScopedSlashResponse(rewrite(target.title, '她开始点名。') + '\n' + rewrite(neighbor.title, '不能续写另一章。'), { ...scope, kind: 'continue' }).state, 'warning');
  assert.deepEqual(snapshot(), before);
  assert.ok(appendSlashContinuation(scope.content, '林夏回到教室。后文已被改掉。').error);
  assert.equal(appendSlashContinuation(scope.content, scope.content).content, scope.content);
});
