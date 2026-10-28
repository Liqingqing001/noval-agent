import { Document, Packer, Paragraph, TextRun, HeadingLevel, LineRuleType } from 'docx';
import type { NovelExportData } from './novelExport';
import type { ManuscriptParagraph } from './manuscript';

const bodyFont = { ascii: 'Times New Roman', hAnsi: 'Times New Roman', eastAsia: '宋体', cs: 'Times New Roman' };
const headingFont = { ...bodyFont, eastAsia: '黑体' };

export async function createWordExport(data: NovelExportData): Promise<Blob> {
  const paragraph = (item: ManuscriptParagraph) => new Paragraph({
    heading: item.kind === 'heading' ? HeadingLevel.HEADING_2 : undefined,
    indent: item.kind === 'paragraph' && !item.prefix && !item.quote ? { firstLine: 480 } : item.quote ? { left: 480 } : undefined,
    spacing: { before: 0, after: 0, line: 360, lineRule: LineRuleType.AUTO },
    children: [
      ...(item.prefix ? [new TextRun({ text: item.prefix, font: bodyFont, size: 24 })] : []),
      ...item.runs.flatMap(run => run.text.replace(/\r\n?/g, '\n').split('\n').map((text, index) => new TextRun({ text, break: index ? 1 : undefined, bold: run.bold || item.kind === 'heading', italics: run.italic, underline: run.underline ? {} : undefined, font: item.kind === 'heading' ? headingFont : bodyFont, size: item.kind === 'heading' ? 28 : 24 }))),
    ],
  });
  const document = new Document({
    creator: 'NovelAgent', title: data.title,
    styles: {
      default: {
        document: { run: { font: bodyFont, size: 24, language: { value: 'en-US', eastAsia: 'zh-CN' } }, paragraph: { spacing: { before: 0, after: 0, line: 360, lineRule: LineRuleType.AUTO } } },
        title: { run: { font: headingFont, size: 40, color: '000000', bold: true }, paragraph: { spacing: { before: 0, after: 240 }, keepNext: true } },
        heading1: { run: { font: headingFont, size: 32, color: '000000', bold: true }, paragraph: { keepNext: true, spacing: { before: 240, after: 120 } } },
        heading2: { run: { font: headingFont, size: 28, color: '000000', bold: true }, paragraph: { keepNext: true, spacing: { before: 120, after: 80 } } },
      },
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: data.title, font: headingFont, size: 40, bold: true })] }),
        ...data.summary.map(paragraph),
        ...data.chapters.flatMap((chapter, index) => [
          new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: index > 0, children: [new TextRun({ text: chapter.title, font: headingFont, size: 32, bold: true })] }),
          ...chapter.paragraphs.map(paragraph),
        ]),
      ],
    }],
  });
  return Packer.toBlob(document);
}
