import type { Chapter } from '@/types';

export function resolveChapter(chapters: Chapter[], novelId: string | null, ...preferred: (string | null | undefined)[]): string | null {
  if (!novelId) return null;
  const own = chapters.filter(chapter => chapter.novelId === novelId);
  for (const id of preferred) if (id && own.some(chapter => chapter.id === id)) return id;
  return [...own].sort((a, b) => a.sequence - b.sequence)[0]?.id ?? null;
}
