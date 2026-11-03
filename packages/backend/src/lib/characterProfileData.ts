export interface StoredCharacterRelationship {
  targetId: string; kind: 'family' | 'ally' | 'rival' | 'other'; label: string; notes: string; directed: boolean;
}

export function characterRelationships(value: unknown): StoredCharacterRelationship[] {
  let values = value;
  if (typeof values === 'string') {
    try { values = JSON.parse(values); } catch { throw new Error('人物关系必须是有效的 JSON 数组'); }
  }
  if (!Array.isArray(values) || values.length > 200) throw new Error('人物关系必须为不超过 200 项的数组');
  return values.map(item => {
    if (!item || typeof item !== 'object' || typeof item.targetId !== 'string' || !item.targetId
      || !['family', 'ally', 'rival', 'other'].includes(item.kind)
      || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 40
      || item.notes !== undefined && (typeof item.notes !== 'string' || item.notes.length > 500)
      || item.directed !== undefined && typeof item.directed !== 'boolean') throw new Error('人物关系的对象、分类、名称或备注无效');
    return { targetId: item.targetId, kind: item.kind, label: item.label.trim(), notes: item.notes || '', directed: item.directed ?? false };
  });
}

export function characterAliases(value: unknown): string {
  let aliases = value;
  if (typeof aliases === 'string') {
    try { aliases = JSON.parse(aliases); } catch { throw new Error('角色别名必须为数组'); }
  }
  if (!Array.isArray(aliases) || aliases.some(item => typeof item !== 'string')) throw new Error('角色别名必须为字符串数组');
  return JSON.stringify(aliases);
}

export function characterAvatarValue(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 100000 || value.startsWith('//') || /[\\<>\u0000-\u001f]/.test(value)
    || (/^[a-z][\w+.-]*:/i.test(value)
      ? !/^https?:\/\//.test(value) && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
      : !/^\/?[\w-]/.test(value))) throw new Error('人物头像地址或大小无效');
  return value;
}
