import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasPosition, defaultPosition, edgeGeometry, emptyBoard, emptySnapshot, remapBoardCharacter, seedCharacterRelationships, validateCharacterBoard, characterFocusGraph } from '../src/lib/characterBoard.ts';
import { parseCharacterRelationships, resolveCharacterPortrait } from '../src/lib/characterProfiles.ts';

test('board positions retain negative and distant coordinates without a world boundary', () => {
  assert.deepEqual(defaultPosition(4), { x: 100, y: 280 });
  assert.deepEqual(canvasPosition({ x: -500, y: 90000 }), { x: -500, y: 90000 });
  for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => canvasPosition({ x: value, y: 1 }), /坐标/);
  const data = { ...emptyBoard(), nodes: { a: { position: { x: -95000, y: -120000 } } } };
  assert.equal(validateCharacterBoard(data), data);
  assert.ok(!edgeGeometry(data.nodes.a.position, { x: 30000, y: -2000 }).path.includes('NaN'));
});
test('empty and valid boards retain manual state, direction, notes and Unicode labels', () => {
  const data = emptyBoard();
  data.nodes.a = { position: { x: 100, y: 90 }, state: { ...emptySnapshot(), life: 'alive', location: '旧书院', asOfChapterId: 'chapter-1' } };
  data.edges.push({ id: 'edge', source: 'a', target: 'b', label: '师徒', kind: 'family', directed: true, notes: '从第一章开始' });
  assert.equal(validateCharacterBoard(data), data);
});
test('untrusted avatar URLs, malformed state, duplicate edges and self relationships are rejected', () => {
  assert.throws(() => validateCharacterBoard({ ...emptyBoard(), nodes: { a: { avatar: 'https://tracking.example/image.png' } } }), /头像/);
  assert.throws(() => validateCharacterBoard({ ...emptyBoard(), nodes: { a: { state: { ...emptySnapshot(), life: 'invalid' } } } }), /状态/);
  const edge = { id: 'e', source: 'a', target: 'b', label: '同盟', kind: 'ally', directed: false, notes: '' };
  assert.throws(() => validateCharacterBoard({ ...emptyBoard(), edges: [edge, edge] }), /关系/);
  assert.throws(() => validateCharacterBoard({ ...emptyBoard(), edges: [{ ...edge, target: 'a' }] }), /关系/);
});
test('server ID reconciliation preserves portrait, state, position and both relation directions', () => {
  const data = { ...emptyBoard(), nodes: { local: { position: { x: 30, y: 40 }, state: { ...emptySnapshot(), condition: '右手受伤' } } }, edges: [{ id: 'e1', source: 'local', target: 'other', label: '信任', kind: 'ally', directed: true, notes: '' }, { id: 'e2', source: 'other', target: 'local', label: '怀疑', kind: 'rival', directed: true, notes: '' }] };
  const mapped = remapBoardCharacter(data, 'local', 'server');
  assert.equal(mapped.nodes.local, undefined); assert.equal(mapped.nodes.server.state.condition, '右手受伤');
  assert.equal(mapped.edges[0].source, 'server'); assert.equal(mapped.edges[1].target, 'server');
  assert.ok(data.nodes.local); assert.equal(validateCharacterBoard(mapped), mapped);
});
test('curved relationships have finite geometry and distinct labels for parallel connections', () => {
  const a = { x: 100, y: 100 }, b = { x: 400, y: 300 };
  const first = edgeGeometry(a, b, -40), second = edgeGeometry(a, b, 40);
  assert.notEqual(first.path, second.path); assert.notDeepEqual(first.label, second.label);
  assert.ok(!edgeGeometry(a, a).path.includes('NaN'));
});

test('explicit saved relationships seed once and preserve local edits, removals and node state', () => {
  const relation = { targetId: 'b', kind: 'ally', label: '同桌', notes: '彼此保留座位', directed: false };
  const characters = [{ id: 'a', relationships: [relation, { ...relation, targetId: 'missing' }] }, { id: 'b', relationships: [{ ...relation, targetId: 'a' }] }];
  const board = emptyBoard(); board.nodes.a = { state: { ...emptySnapshot(), goal: '归还笔记' } };
  const seeded = seedCharacterRelationships(board, characters);
  assert.equal(seeded.edges.length, 1);
  assert.equal(seeded.edges[0].notes, '彼此保留座位');
  assert.equal(seeded.nodes.a.state.goal, '归还笔记');
  assert.equal(seedCharacterRelationships(seeded, characters), seeded);
  const edited = { ...seeded, edges: [{ ...seeded.edges[0], label: '搭档' }] };
  assert.equal(seedCharacterRelationships(edited, characters), edited);
  const removed = { ...seeded, edges: [] };
  assert.equal(seedCharacterRelationships(removed, characters), removed);
  const manual = { ...emptyBoard(), edges: [{ id: 'visitor', source: 'a', target: 'b', ...relation, notes: '访客备注' }] };
  assert.equal(seedCharacterRelationships(manual, characters).edges.length, 1);
  assert.equal(validateCharacterBoard(seeded), seeded);
});

test('portrait atlas paths honor Pages base, retain cell geometry and reject invalid cell references', () => {
  assert.deepEqual(resolveCharacterPortrait('school/images/portraits.webp#cell=11,4,3', '/noval-agent/'), { src: '/noval-agent/school/images/portraits.webp', cell: { index: 11, columns: 4, rows: 3 } });
  assert.equal(resolveCharacterPortrait('/book/images/portraits.webp#cell=0,4,2', '/noval-agent/').src, '/noval-agent/book/images/portraits.webp');
  assert.equal(resolveCharacterPortrait('https://example.com/portrait.png', '/noval-agent/').src, 'https://example.com/portrait.png');
  assert.equal(resolveCharacterPortrait('school/portraits.webp#cell=12,4,3'), null);
  assert.equal(resolveCharacterPortrait('school/portraits.webp#cell=0,0,3'), null);
  assert.equal(resolveCharacterPortrait('../outside.webp'), null);
  assert.equal(resolveCharacterPortrait('//example.com/pixel.png'), null);
});

test('DB relationship JSON normalizes defensively without guessing from prose', () => {
  const relation = { targetId: 'other', kind: 'family', label: '姐妹', notes: '共同生活' };
  assert.deepEqual(parseCharacterRelationships(JSON.stringify([relation])), [relation]);
  assert.deepEqual(parseCharacterRelationships('[invalid'), []);
  assert.deepEqual(parseCharacterRelationships([{ targetName: '顾夏', kind: 'friend', label: '友人' }, { ...relation, directed: 'yes' }]), []);
});

test('person focus keeps incoming and outgoing neighbors, excludes peer lines, and never rewrites the board', () => {
  const characters = ['a', 'b', 'c', 'isolated'].map(id => Object.freeze({ id, name: id }));
  const relation = (id, source, target) => Object.freeze({ id, source, target, label: '同伴', kind: 'ally', directed: true, notes: '' });
  const edges = [relation('ab', 'a', 'b'), relation('ca', 'c', 'a'), relation('bc', 'b', 'c'), relation('foreign', 'a', 'missing')];
  const original = JSON.stringify({ characters, edges });
  const focused = characterFocusGraph(Object.freeze(characters), Object.freeze(edges), 'a');
  assert.deepEqual(focused.characters.map(person => person.id), ['a', 'b', 'c']);
  assert.deepEqual(focused.edges.map(edge => edge.id), ['ab', 'ca']);
  assert.deepEqual(characterFocusGraph(characters, edges, 'isolated'), { characters: [characters[3]], edges: [] });
  assert.deepEqual(characterFocusGraph(characters, edges, null).edges.map(edge => edge.id), ['ab', 'ca', 'bc']);
  assert.deepEqual(characterFocusGraph(characters, edges, 'deleted').characters, characters);
  assert.equal(JSON.stringify({ characters, edges }), original);
});
