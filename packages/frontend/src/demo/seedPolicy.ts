const collections = ['novels', 'chapters', 'characters', 'worldSettings', 'plotCards', 'foreshadowings'] as const;
type SeedRecord = { id: string; [key: string]: unknown };
export type DemoSeedData = { [K in typeof collections[number]]: SeedRecord[] } & { sessions?: unknown[] };
const legacyNovelId = 'demo-lingshi-origin';
// Text/structure fingerprint of the retired public example, excluding derived progress and timestamps.
const pristineLegacyFingerprint = '1ff88ccd';
const ignored = new Set(['createdAt', 'updatedAt', 'wordCount', 'lastOpenedChapterId', 'chapterId', 'statusMode']);
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).filter(key => !ignored.has(key) && !(key === 'status' && 'type' in record)).sort().map(key => [key, normalize(record[key])]));
}
export function demoFixtureFingerprint(data: DemoSeedData): string {
  const input = JSON.stringify(collections.map(key => [key, (data[key] || []).map(item => normalize(item) as SeedRecord).sort((a, b) => a.id.localeCompare(b.id))]));
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16);
}
export function shouldInitializeTideDemo(data: DemoSeedData, reset = false, hasAuxiliaryEdits = false): boolean {
  if (reset || data.novels.length === 0) return true;
  if (hasAuxiliaryEdits || data.sessions?.length || data.plotCards.some(card => card.statusMode === 'manual')) return false;
  return data.novels.length === 1 && data.novels[0].id === legacyNovelId && demoFixtureFingerprint(data) === pristineLegacyFingerprint;
}
