/** Older saved chapters may include numbering; the directory already supplies it. */
export function chapterTitleText(title: string): string {
  return title.replace(/^第[零〇一二两三四五六七八九十百千万\d]+章\s*[·:：、.．—-]?\s*/, '').trim() || title;
}
