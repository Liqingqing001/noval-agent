import { paragraphText, readManuscript } from './manuscript';
import { isRichTextContent } from './textModification';

/** Same visible paragraph projection for review prompts and exact evidence checks. */
export function reviewVisibleText(content: string): string {
  if (!isRichTextContent(content) && !/<\/?(?:script|style|noscript|template|img|iframe|svg)\b/i.test(content)) return content.replace(/\r\n?/g, '\n');
  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(content, 'text/html');
    document.querySelectorAll('script,style,noscript,template,iframe,svg,[hidden],[aria-hidden="true"]').forEach(element => element.remove());
    document.querySelectorAll('[style]').forEach(element => { if (/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(element.getAttribute('style') || '')) element.remove(); });
    return readManuscript(`<div>${document.body.innerHTML}</div>`).map(paragraphText).join('\n');
  }
  // Node-only tests have no DOM. This conservative projection discards nonvisual
  // nodes and attributes and never runs saved markup. Browser review uses the DOM.
  const decode = (text: string) => text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, entity: string) => {
    const known: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
    if (!entity.startsWith('#')) return known[entity.toLowerCase()] || whole;
    const point = Number.parseInt(entity.slice(/^#x/i.test(entity) ? 2 : 1), /^#x/i.test(entity) ? 16 : 10);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : whole;
  });
  return decode(content.replace(/<!--[\s\S]*?(?:-->|$)/g, '').replace(/<(script|style|noscript|template|iframe|svg)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n').replace(/<\/(?:p|div|h[1-6]|li|blockquote|pre)\s*>/gi, '\n')
    .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, '')).replace(/\r\n?/g, '\n').split('\n').filter(line => line.trim()).join('\n');
}
