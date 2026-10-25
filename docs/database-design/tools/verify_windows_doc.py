"""Audit editable DOCX fonts and optional native Word PDF layout evidence."""
import argparse
from collections import Counter
import json
from pathlib import Path
from zipfile import ZipFile
from lxml import etree

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{' + NS['w'] + '}'
ALLOWED = {'宋体', '黑体', '微软雅黑'}


def audit(source, reference=None, pdf=None):
    checks = []
    def check(name, passed, detail):
        checks.append({'name': name, 'passed': bool(passed), 'detail': detail})
    with ZipFile(source) as archive:
        body = etree.fromstring(archive.read('word/document.xml'))
        text = body.xpath('//w:t/text()', namespaces=NS)
        runs = []
        themes = 0
        fixed = 0
        malformed = 0
        for name in archive.namelist():
            if not name.startswith('word/') or not name.endswith('.xml'):
                continue
            root = etree.fromstring(archive.read(name))
            runs.extend(root.xpath('//w:r[w:t]', namespaces=NS))
            themes += sum('theme' in key.lower() for font in root.iter(W + 'rFonts') for key in font.attrib)
            fixed += len(root.xpath('//w:spacing[@w:lineRule="exact"] | //w:trHeight[@w:hRule="exact"]', namespaces=NS))
            malformed += sum(run.index(run.find(W + 'rPr')) != 0 for run in root.xpath('//w:r[w:rPr]', namespaces=NS))
        fonts = Counter()
        missing = 0
        for run in runs:
            font = run.find(W + 'rPr/' + W + 'rFonts')
            name = font.get(W + 'eastAsia') if font is not None else None
            fonts[name] += 1
            if name not in ALLOWED:
                missing += 1
        check('explicit_chinese_fonts_for_all_text_runs', missing == 0, {'text_runs': len(runs), 'fonts': dict(fonts)})
        check('no_conflicting_theme_font_attributes', themes == 0, themes)
        check('no_exact_line_or_row_heights', fixed == 0, fixed)
        check('valid_run_property_order', malformed == 0, malformed)
        check('no_replacement_characters', not any('\ufffd' in item for item in text), len(text))
        if reference:
            with ZipFile(reference) as old:
                original = etree.fromstring(old.read('word/document.xml')).xpath('//w:t/text()', namespaces=NS)
            check('original_body_text_preserved', text == original, {'text_nodes': len(text)})
        check('inline_figures_only', not body.xpath('//*[local-name()="anchor"]'), len(body.xpath('//*[local-name()="inline"]')))
    if pdf:
        import pdfplumber
        font_names = Counter()
        outside, missing_glyphs, cjk_fallbacks = 0, 0, 0
        pages = []
        with pdfplumber.open(pdf) as rendered:
            for number, page in enumerate(rendered.pages, 1):
                font_names.update(char['fontname'].split('+')[-1] for char in page.chars)
                outside += sum(char['x0'] < 10 or char['x1'] > page.width - 10 or char['top'] < 10 or char['bottom'] > page.height - 10 for char in page.chars)
                missing_glyphs += sum('\ufffd' in char['text'] for char in page.chars)
                cjk_fallbacks += sum(any('\u4e00' <= letter <= '\u9fff' for letter in char['text']) and
                                     not any(font in char['fontname'] for font in ['SimSun', 'SimHei', 'MicrosoftYaHei']) for char in page.chars)
                pages.append({'page': number, 'width_pt': page.width, 'height_pt': page.height, 'characters': len(page.chars)})
        check('native_word_pages_have_no_off_page_text', outside == 0, {'page_count': len(pages), 'outside_characters': outside})
        check('native_word_cjk_uses_requested_fonts', cjk_fallbacks == 0, {'unexpected_font_characters': cjk_fallbacks, 'rendered_fonts': dict(font_names)})
        check('native_word_no_replacement_glyphs', missing_glyphs == 0, missing_glyphs)
    return {'source': str(source), 'checks': checks, 'passed': sum(item['passed'] for item in checks), 'total': len(checks)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('--reference', type=Path)
    parser.add_argument('--pdf', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = audit(args.source, args.reference, args.pdf)
    if args.output:
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Windows document audit: {result['passed']}/{result['total']} passed")
    raise SystemExit(0 if result['passed'] == result['total'] else 1)
