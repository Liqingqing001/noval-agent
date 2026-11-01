import type { Chapter, PlotCard } from '@/types';

export function hasChapterBody(content: string): boolean {
  return Boolean(content
    .replace(/<!--[\s\S]*?-->|<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#0*160;|&#x0*a0;/gi, '')
    .replace(/[\s\u200B-\u200D\uFEFF]/g, ''));
}

const titleKey = (title: string) => title.trim().replace(/^第[零〇一二两三四五六七八九十百千万\d]+章[\s:：、.\-]*/, '').replace(/\s+/g, '');

/** Explicit links win; legacy title recovery requires uniqueness on both sides within a novel. */
export function outlineProgressUpdates(cards: PlotCard[], chapters: Chapter[], deletedIds: readonly string[] = []): Array<{ id: string; updates: Partial<PlotCard> }> {
  const updates: Array<{ id: string; updates: Partial<PlotCard> }> = [];
  for (const card of cards) {
    if (card.type !== 'chapter') continue;
    const removed = Boolean(card.chapterId && deletedIds.includes(card.chapterId));
    let chapter = removed ? undefined : chapters.find(chapter => chapter.id === card.chapterId && chapter.novelId === card.novelId);
    if (!chapter && !removed) {
      const key = titleKey(card.title);
      const matchingCards = cards.filter(item => item.novelId === card.novelId && item.type === 'chapter' && titleKey(item.title) === key);
      const matchingChapters = chapters.filter(item => item.novelId === card.novelId && titleKey(item.title) === key);
      if (key && matchingCards.length === 1 && matchingChapters.length === 1) chapter = matchingChapters[0];
    }
    // A partial backend load is not evidence that a manuscript was deleted.
    if (!chapter && !removed) continue;
    const patch: Partial<PlotCard> = {};
    if (chapter && card.chapterId !== chapter.id) patch.chapterId = chapter.id;
    if (removed) patch.chapterId = undefined;
    if (card.statusMode !== 'manual') {
      const status = chapter && hasChapterBody(chapter.content) ? 'completed' : 'pending';
      if (card.status !== status) patch.status = status;
    }
    if (Object.keys(patch).length) updates.push({ id: card.id, updates: patch });
  }
  return updates;
}
