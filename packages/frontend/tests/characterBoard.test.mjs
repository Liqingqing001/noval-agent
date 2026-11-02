import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedPosition, defaultPosition, edgeGeometry, emptyBoard, emptySnapshot, remapBoardCharacter, validateCharacterBoard } from '../src/lib/characterBoard.ts';

test('board positions are deterministic and constrained to the navigable world', () => {
  assert.deepEqual(defaultPosition(4), { x: 100, y: 280 });
  assert.deepEqual(boundedPosition({ x: -500, y: 90000 }), { x: 0, y: 20000 });
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
