import { isRichTextContent } from './textModification';

export interface ManuscriptRun { text: string; bold?: boolean; italic?: boolean; underline?: boolean }
export interface ManuscriptParagraph { runs: ManuscriptRun[]; kind: 'paragraph' | 'heading'; prefix?: string; quote?: boolean }
export const paragraphText = (paragraph: ManuscriptParagraph): string => paragraph.runs.map(run => run.text).join('');

/** Read visible structure instead of deleting tags, which would join adjacent paragraphs. */
export function readManuscript(content: string): ManuscriptParagraph[] {
  if (!isRichTextContent(content)) return content.replace(/\r\n?/g, '\n').split('\n').filter(line => line.trim()).map(text => ({ kind: 'paragraph', runs: [{ text }] }));
  const document = new DOMParser().parseFromString(content, 'text/html');
  const paragraphs: ManuscriptParagraph[] = [];
  const inline = (node: Node, marks: Omit<ManuscriptRun, 'text'> = {}): ManuscriptRun[] => {
    if (node.nodeType === 3) return [{ ...marks, text: node.textContent || '' }];
    if (node.nodeType !== 1) return [];
    const element = node as Element;
    const tag = element.tagName;
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(tag)) return [];
    if (tag === 'BR') return [{ ...marks, text: '\n' }];
    const next = { ...marks, ...(/^(B|STRONG)$/.test(tag) ? { bold: true } : {}), ...(/^(I|EM)$/.test(tag) ? { italic: true } : {}), ...(tag === 'U' ? { underline: true } : {}) };
    return [...element.childNodes].flatMap((child, index) => [
      ...(index > 0 && child.nodeType === 1 && /^(P|DIV)$/.test((child as Element).tagName) ? [{ ...next, text: '\n' }] : []),
      ...inline(child, next),
    ]);
  };
  const append = (runs: ManuscriptRun[], options: Partial<ManuscriptParagraph> = {}) => {
    if (runs.some(run => run.text.trim())) paragraphs.push({ kind: 'paragraph', ...options, runs });
  };
  const walk = (element: Element, quote = false, depth = 0) => {
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(element.tagName)) return;
    if (/^(P|H[1-6]|PRE)$/.test(element.tagName)) {
      append(inline(element), { kind: /^H[1-6]$/.test(element.tagName) ? 'heading' : 'paragraph', quote });
      return;
    }
    if (/^(UL|OL)$/.test(element.tagName)) {
      const start = Number(element.getAttribute('start')) || 1;
      [...element.children].filter(child => child.tagName === 'LI').forEach((item, index) => {
        const runs = [...item.childNodes].filter(child => child.nodeType !== 1 || !/^(UL|OL)$/.test((child as Element).tagName)).flatMap((child, childIndex) => [
          ...(childIndex > 0 && child.nodeType === 1 && /^(P|DIV)$/.test((child as Element).tagName) ? [{ text: '\n' }] : []), ...inline(child),
        ]);
        append(runs, { prefix: `${'  '.repeat(depth)}${element.tagName === 'OL' ? `${start + index}. ` : '- '}`, quote });
        [...item.children].filter(child => /^(UL|OL)$/.test(child.tagName)).forEach(child => walk(child, quote, depth + 1));
      });
      return;
    }
    let pending: ManuscriptRun[] = [];
    const flush = () => { append(pending, { quote }); pending = []; };
    for (const child of element.childNodes) {
      if (child.nodeType === 1 && /^(P|DIV|SECTION|ARTICLE|H[1-6]|PRE|UL|OL|BLOCKQUOTE)$/.test((child as Element).tagName)) {
        flush();
        walk(child as Element, quote || (child as Element).tagName === 'BLOCKQUOTE', depth);
      } else pending.push(...inline(child));
    }
    flush();
  };
  walk(document.body);
  return paragraphs;
}
