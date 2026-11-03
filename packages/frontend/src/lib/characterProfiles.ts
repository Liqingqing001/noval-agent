import type { CharacterRelationship } from '../types/index';

/** Read older records and DB JSON defensively without inventing relationships. */
export function parseCharacterRelationships(raw: unknown): CharacterRelationship[] {
  let values = raw;
  if (typeof values === 'string') {
    try { values = JSON.parse(values); } catch { return []; }
  }
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is CharacterRelationship => !!value && typeof value === 'object'
    && typeof value.targetId === 'string' && !!value.targetId
    && ['family', 'ally', 'rival', 'other'].includes(value.kind)
    && typeof value.label === 'string' && !!value.label.trim() && value.label.length <= 40
    && (value.notes === undefined || typeof value.notes === 'string' && value.notes.length <= 500)
    && (value.directed === undefined || typeof value.directed === 'boolean'));
}

export function resolveCharacterPortrait(avatar: string | undefined, baseUrl = '/') {
  if (!avatar) return null;
  const [path, fragment = ''] = avatar.split('#');
  if (!path || path.startsWith('//') || /[\\<>\u0000-\u001f]/.test(path) || /(?:^|\/)\.\.(?:\/|$)/.test(path)
    || (/^[a-z][\w+.-]*:/i.test(path)
      ? !/^https?:\/\//.test(path) && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(path)
      : !/^\/?[\w-]/.test(path))) return null;
  const src = /^(?:https?:\/\/|data:)/.test(path) ? path : `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  if (!fragment) return { src };
  const match = /^cell=(\d+),(\d+),(\d+)$/.exec(fragment);
  if (!match) return null;
  const [index, columns, rows] = match.slice(1).map(Number);
  if (columns < 1 || rows < 1 || columns > 32 || rows > 32 || index >= columns * rows) return null;
  return { src, cell: { index, columns, rows } };
}
