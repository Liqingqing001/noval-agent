export interface BoardPoint { x: number; y: number }
export interface CharacterSnapshot {
  life: 'unknown' | 'alive' | 'dead' | 'missing';
  location: string; condition: string; goal: string; inventory: string; notes: string;
  asOfChapterId: string;
}
export interface CharacterNode { position?: BoardPoint; avatar?: string; state?: CharacterSnapshot }
export interface CharacterEdge { id: string; source: string; target: string; label: string; kind: 'family' | 'ally' | 'rival' | 'other'; directed: boolean; notes: string }
export interface CharacterBoardData { version: 1; nodes: Record<string, CharacterNode>; edges: CharacterEdge[] }
export const emptySnapshot = (): CharacterSnapshot => ({ life: 'unknown', location: '', condition: '', goal: '', inventory: '', notes: '', asOfChapterId: '' });
export const emptyBoard = (): CharacterBoardData => ({ version: 1, nodes: {}, edges: [] });
export const defaultPosition = (index: number, count = 16): BoardPoint => { const columns = Math.min(40, Math.max(4, Math.ceil(Math.sqrt(count)))); return { x: 100 + index % columns * 210, y: 90 + Math.floor(index / columns) * 190 }; };
export const canvasPosition = (point: BoardPoint): BoardPoint => {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('人物位置必须是有限坐标。');
  return { x: point.x, y: point.y };
};

export function validateCharacterBoard(raw: unknown): CharacterBoardData {
  const data = raw as CharacterBoardData;
  if (!data || data.version !== 1 || !data.nodes || Array.isArray(data.nodes) || typeof data.nodes !== 'object' || !Array.isArray(data.edges) || data.edges.length > 5000 || Object.keys(data.nodes).length > 2000 || JSON.stringify(data).length > 8000000) throw new Error('人物画布数据无法识别，原记录未覆盖。');
  for (const node of Object.values(data.nodes)) {
    if (!node || typeof node !== 'object') throw new Error('人物节点格式错误。');
    if (node.position) canvasPosition(node.position);
    if (node.avatar && (typeof node.avatar !== 'string' || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(node.avatar) || node.avatar.length > 100000)) throw new Error('头像格式或大小不支持。');
    if (node.state) {
      if (!['unknown', 'alive', 'dead', 'missing'].includes(node.state.life)) throw new Error('人物状态格式错误。');
      for (const field of ['location', 'condition', 'goal', 'inventory', 'notes', 'asOfChapterId'] as const) if (typeof node.state[field] !== 'string' || node.state[field].length > 2000) throw new Error('人物状态文字缺失或过长。');
    }
  }
  const ids = new Set<string>();
  for (const edge of data.edges) {
    if (!edge || typeof edge.id !== 'string' || ids.has(edge.id) || typeof edge.source !== 'string' || typeof edge.target !== 'string' || edge.source === edge.target || typeof edge.label !== 'string' || !edge.label.trim() || edge.label.length > 40 || typeof edge.notes !== 'string' || edge.notes.length > 500 || !['family', 'ally', 'rival', 'other'].includes(edge.kind) || typeof edge.directed !== 'boolean') throw new Error('关系记录格式错误。');
    ids.add(edge.id);
  }
  return data;
}

export function remapBoardCharacter(data: CharacterBoardData, oldId: string, newId: string): CharacterBoardData {
  if (oldId === newId) return data;
  const nodes = { ...data.nodes };
  if (nodes[oldId]) { nodes[newId] = { ...nodes[oldId], ...nodes[newId] }; delete nodes[oldId]; }
  return { ...data, nodes, edges: data.edges.map(edge => ({ ...edge, source: edge.source === oldId ? newId : edge.source, target: edge.target === oldId ? newId : edge.target })).filter(edge => edge.source !== edge.target) };
}

export function edgeGeometry(source: BoardPoint, target: BoardPoint, offset = 0) {
  const a = { x: source.x + 60, y: source.y + 40 }, b = { x: target.x + 60, y: target.y + 40 };
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
  const start = { x: a.x + dx / length * 38, y: a.y + dy / length * 38 };
  const end = { x: b.x - dx / length * 38, y: b.y - dy / length * 38 };
  const control = { x: (a.x + b.x) / 2 - dy / length * offset, y: (a.y + b.y) / 2 + dx / length * offset };
  return { path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`, label: { x: (start.x + 2 * control.x + end.x) / 4, y: (start.y + 2 * control.y + end.y) / 4 } };
}

export function characterEdgePaths(edges: CharacterEdge[], positions: Record<string, BoardPoint>) {
  const groups = new Map<string, CharacterEdge[]>();
  for (const edge of edges) { const key = JSON.stringify([edge.source, edge.target].sort()); const group = groups.get(key) || []; group.push(edge); groups.set(key, group); }
  return [...groups.values()].flatMap(group => group.flatMap((edge, index) => {
    if (!positions[edge.source] || !positions[edge.target]) return [];
    const offset = ((index - (group.length - 1) / 2) * 85 + 24) * (edge.source < edge.target ? 1 : -1);
    return [{ edge, ...edgeGeometry(positions[edge.source], positions[edge.target], offset) }];
  }));
}

export async function characterAvatar(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('请选择 5 MiB 以内的 PNG、JPEG 或 WebP 图片。');
  const url = URL.createObjectURL(file);
  try {
    const picture = new Image(); picture.src = url; await picture.decode();
    if (picture.naturalWidth * picture.naturalHeight > 40000000) throw new Error('图片尺寸过大，请先缩小后上传。');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 160;
    const context = canvas.getContext('2d'); if (!context) throw new Error('浏览器无法处理头像图片。');
    context.fillStyle = '#f9f7ee'; context.fillRect(0, 0, 160, 160);
    const size = Math.min(picture.naturalWidth, picture.naturalHeight);
    context.drawImage(picture, (picture.naturalWidth - size) / 2, (picture.naturalHeight - size) / 2, size, size, 0, 0, 160, 160);
    return canvas.toDataURL('image/jpeg', .82);
  } finally { URL.revokeObjectURL(url); }
}
