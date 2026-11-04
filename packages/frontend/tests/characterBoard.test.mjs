import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasPosition, defaultPosition, edgeGeometry, emptyBoard, emptySnapshot, remapBoardCharacter, seedCharacterRelationships, validateCharacterBoard, characterFocusGraph, characterEdgePaths, edgeBendFromLabel, draggedEdgeBend, setCharacterEdgeBend, MAX_CHARACTER_EDGE_BEND } from '../src/lib/characterBoard.ts';
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

test('two-person view retains only the selected pair and every connecting direction without modifying data', () => {
  const characters = ['a', 'b', 'c', 'isolated'].map(id => Object.freeze({ id }));
  const relation = (id, source, target) => Object.freeze({ id, source, target, label: id, kind: 'ally', directed: true, notes: '' });
  const edges = [relation('ab', 'a', 'b'), relation('ab-again', 'a', 'b'), relation('ba', 'b', 'a'), relation('ac', 'a', 'c'), relation('bc', 'b', 'c'), relation('foreign', 'a', 'unknown')];
  const original = JSON.stringify({ characters, edges });
  const pair = characterFocusGraph(characters, edges, 'a', 'b');
  assert.deepEqual(pair.characters.map(person => person.id), ['a', 'b']);
  assert.deepEqual(pair.edges.map(edge => edge.id), ['ab', 'ab-again', 'ba']);
  const noRelationship = characterFocusGraph(characters, edges, 'a', 'isolated');
  assert.deepEqual(noRelationship.characters.map(person => person.id), ['a', 'isolated']);
  assert.deepEqual(noRelationship.edges, []);
  assert.deepEqual(characterFocusGraph(characters, edges, 'a', 'missing'), characterFocusGraph(characters, edges, 'a'));
  assert.deepEqual(characterFocusGraph(characters, edges, 'a', 'a'), characterFocusGraph(characters, edges, 'a'));
  assert.equal(JSON.stringify({ characters, edges }), original);
});

test('dragging one curve midpoint works in both axes at every zoom and leaves parallel curves unchanged', () => {
  const a = { x: -120, y: 80 }, b = { x: 450, y: -200 };
  const edges = [
    { id: 'ab', source: 'a', target: 'b', label: '同伴', kind: 'ally', directed: true, notes: '保留备注' },
    { id: 'ba', source: 'b', target: 'a', label: '怀疑', kind: 'rival', directed: true, notes: '' },
  ];
  const original = JSON.stringify(edges), positions = { a, b };
  const before = characterEdgePaths(edges, positions);
  assert.notDeepEqual(before[0].label, before[1].label);
  const worldDelta = { x: 70, y: -35 };
  for (const scale of [.05, .5, 1, 2.2]) {
    const bend = draggedEdgeBend(a, b, before[0].label, { x: worldDelta.x * scale, y: worldDelta.y * scale }, scale);
    const moved = characterEdgePaths([{ ...edges[0], bend }, edges[1]], positions);
    assert.ok(Math.abs(moved[0].label.x - before[0].label.x - worldDelta.x) < 1e-8);
    assert.ok(Math.abs(moved[0].label.y - before[0].label.y - worldDelta.y) < 1e-8);
    assert.equal(moved[1].path, before[1].path);
    assert.equal(moved[0].edge.notes, edges[0].notes);
    const translated = characterEdgePaths([{ ...edges[0], bend }], { a: { x: a.x + 90, y: a.y - 10 }, b: { x: b.x + 90, y: b.y - 10 } })[0];
    assert.ok(Math.abs(translated.label.x - moved[0].label.x - 90) < 1e-8);
    assert.ok(Math.abs(translated.label.y - moved[0].label.y + 10) < 1e-8);
  }
  assert.equal(JSON.stringify(edges), original);
  for (const scale of [0, -1, NaN, Infinity]) assert.throws(() => draggedEdgeBend(a, b, before[0].label, worldDelta, scale), /缩放/);
  assert.throws(() => draggedEdgeBend(a, b, before[0].label, { x: Infinity, y: 0 }, 1), /坐标/);
});

test('manual curves survive JSON export and ID remapping; old v1 data and resetting keep automatic geometry', () => {
  const edge = { id: 'relation', source: 'local', target: 'b', label: '同桌', kind: 'ally', directed: false, notes: '座位保持不变', bend: { x: 130, y: -220 } };
  const board = { ...emptyBoard(), edges: [edge] };
  const imported = validateCharacterBoard(JSON.parse(JSON.stringify(board)));
  assert.deepEqual(imported.edges[0].bend, edge.bend);
  assert.deepEqual(remapBoardCharacter(imported, 'local', 'server').edges[0], { ...edge, source: 'server' });
  const a = { x: 0, y: 0 }, b = { x: 250, y: 100 };
  const manual = characterEdgePaths(board.edges, { local: a, b })[0];
  const { bend, ...reset } = edge;
  const auto = characterEdgePaths([reset], { local: a, b })[0];
  assert.notEqual(manual.path, auto.path);
  assert.deepEqual(auto, characterEdgePaths(validateCharacterBoard({ ...emptyBoard(), edges: [reset] }).edges, { local: a, b })[0]);
  const people = [{ id: 'local', relationships: [{ targetId: 'b', kind: 'ally', label: '同桌', directed: false }] }, { id: 'b' }];
  const seeded = seedCharacterRelationships(imported, people);
  assert.deepEqual(seeded.edges, imported.edges, 'Seeding must not replace a manually positioned relation');
  const deleted = { ...seeded, edges: [] };
  assert.deepEqual(seedCharacterRelationships(deleted, people).edges, [], 'Deleted presets remain deleted');
});

test('imported curve offsets reject invalid values and pointer helpers bound distant drags', () => {
  const edge = { id: 'edge', source: 'a', target: 'b', label: '关系', kind: 'other', directed: true, notes: '' };
  for (const bend of [null, {}, { x: NaN, y: 0 }, { x: 0, y: Infinity }, { x: '1', y: 0 }, { x: MAX_CHARACTER_EDGE_BEND + 1, y: 0 }]) {
    assert.throws(() => validateCharacterBoard({ ...emptyBoard(), edges: [{ ...edge, bend }] }), /关系线/);
  }
  const result = edgeBendFromLabel({ x: 0, y: 0 }, { x: 300, y: 200 }, { x: 1e9, y: -1e9 });
  assert.deepEqual(result, { x: MAX_CHARACTER_EDGE_BEND, y: -MAX_CHARACTER_EDGE_BEND });
  assert.doesNotThrow(() => validateCharacterBoard({ ...emptyBoard(), edges: [{ ...edge, bend: result }] }));
  const same = { x: 100, y: 100 };
  assert.notDeepEqual(edgeGeometry(same, same, -85).label, edgeGeometry(same, same, 85).label);
});

test('moving or resetting one edge preserves array order, other relations, state and original data', () => {
  const relation = (id, source, target) => Object.freeze({ id, source, target, label: id, kind: 'rival', directed: true, notes: `${id} 的备注` });
  const nodes = Object.freeze({ a: Object.freeze({ position: Object.freeze({ x: -10, y: 400 }), state: Object.freeze({ ...emptySnapshot(), life: 'alive', condition: '受伤' }) }) });
  const edges = Object.freeze([relation('first', 'b', 'c'), relation('second', 'a', 'b'), relation('third', 'b', 'a')]);
  const board = Object.freeze({ ...emptyBoard(), nodes, edges });
  const moved = setCharacterEdgeBend(board, 'second', { x: -200, y: 80 });
  assert.deepEqual(moved.edges.map(edge => edge.id), edges.map(edge => edge.id));
  assert.equal(moved.nodes, nodes);
  assert.equal(moved.edges[0], edges[0]); assert.equal(moved.edges[2], edges[2]);
  assert.deepEqual(moved.edges[1], { ...edges[1], bend: { x: -200, y: 80 } });
  assert.deepEqual(setCharacterEdgeBend(moved, 'second', undefined), board);
  assert.equal(board.edges[1].bend, undefined);
  assert.throws(() => setCharacterEdgeBend(board, 'missing', { x: 0, y: 0 }), /不存在/);
});
