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
  return Object.fromEntries(Object.keys(record).filter(key => !ignored.has(key) && !(key === 'status' && 'type' in record)).sort().map(key => [key, key === 'cover' && typeof record[key] === 'string' ? record[key].replace(/^.*?((?:book|school)\/images\/.*)$/, '$1') : normalize(record[key])]));
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

// Published before the two-book library. Derived reading progress is excluded by the fingerprint.
const pristineTideFingerprint = '679c023';
export function mergeDemoLibrary(data: DemoSeedData, fixture: DemoSeedData, options: { resetNovelId?: string; hasAuxiliaryEdits?: boolean } = {}): DemoSeedData {
  const result = Object.fromEntries(collections.map(key => [key, [...(data[key] || [])]])) as DemoSeedData;
  result.sessions = [...(data.sessions || [])];
  for (const novel of fixture.novels) {
    const existing = data.novels.find(item => item.id === novel.id);
    const oldBook = Object.fromEntries(collections.map(key => [key, (data[key] || []).filter(item => key === 'novels' ? item.id === novel.id : item.novelId === novel.id)])) as DemoSeedData;
    const hasSessions = data.sessions?.some(session => !(session as { novelId?: string })?.novelId || (session as { novelId?: string })?.novelId === novel.id);
    const pristineTide = novel.id === 'demo-tide-remembers' && !options.hasAuxiliaryEdits && !hasSessions && !oldBook.plotCards.some(card => card.statusMode === 'manual') && demoFixtureFingerprint(oldBook) === pristineTideFingerprint;
    if (existing && options.resetNovelId !== novel.id && !pristineTide) continue;
    for (const key of collections) {
      result[key] = result[key].filter(item => key === 'novels' ? item.id !== novel.id : item.novelId !== novel.id);
      result[key].push(...fixture[key].filter(item => key === 'novels' ? item.id === novel.id : item.novelId === novel.id));
    }
    if (options.resetNovelId === novel.id) result.sessions = result.sessions?.filter(session => (session as { novelId?: string })?.novelId !== novel.id);
  }
  // Publish the new case first while retaining every visitor-created or retired book.
  const order = new Map(fixture.novels.map((novel, index) => [novel.id, index]));
  result.novels.sort((a, b) => (order.get(a.id) ?? order.size) - (order.get(b.id) ?? order.size));
  return result;
}
