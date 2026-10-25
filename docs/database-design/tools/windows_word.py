"""Deterministic Windows Chinese font and layout settings for this report.

Usage: py windows_word.py INPUT.docx [OUTPUT.docx]
All text stays editable. Fonts are referenced, not redistributed or embedded.
"""
from pathlib import Path
import sys
from lxml import etree
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt

BODY_FONT = '宋体'
HEADING_FONT = '黑体'
SUBTITLE_FONT = '微软雅黑'


def child(parent, name):
    element = parent.find(qn('w:' + name))
    if element is None:
        element = OxmlElement('w:' + name)
        if name == 'rPr' and parent.tag == qn('w:r'):
            parent.insert(0, element)
        else:
            parent.append(element)
    elif name == 'rPr' and parent.tag == qn('w:r') and parent.index(element) != 0:
        parent.remove(element)
        parent.insert(0, element)
    return element


def fonts(rpr, east_asia=BODY_FONT, latin='Times New Roman'):
    font = rpr.find(qn('w:rFonts'))
    if font is None:
        font = OxmlElement('w:rFonts')
        rpr.insert(0, font)
    # Theme attributes take precedence in Word. Setting eastAsia alone is insufficient.
    for key in list(font.attrib):
        if 'theme' in key.lower():
            del font.attrib[key]
    for key, value in [('ascii', latin), ('hAnsi', latin), ('cs', latin), ('eastAsia', east_asia), ('hint', 'eastAsia')]:
        font.set(qn('w:' + key), value)
    lang = child(rpr, 'lang')
    lang.set(qn('w:val'), 'en-US')
    lang.set(qn('w:eastAsia'), 'zh-CN')
    # No squeezed/scaled text or shifted baselines inherited from a template.
    for name in ['spacing', 'w', 'position']:
        for element in list(rpr.findall(qn('w:' + name))):
            rpr.remove(element)


def apply_windows_format(doc):
    defaults = child(child(doc.styles.element, 'docDefaults'), 'rPrDefault')
    fonts(child(defaults, 'rPr'))
    for style in doc.styles:
        rpr = child(style.element, 'rPr')
        heading = style.style_id.startswith('Heading') or style.name == 'Title'
        fonts(rpr, HEADING_FONT if heading else SUBTITLE_FONT if style.name == 'Subtitle' else BODY_FONT,
              'Arial' if heading or style.name == 'Subtitle' else 'Times New Roman')
    # Linked/conditional styles also carry nested run/paragraph-mark formatting.
    for font in list(doc.styles.element.iter(qn('w:rFonts'))):
        style = next((ancestor for ancestor in font.iterancestors() if ancestor.tag == qn('w:style')), None)
        style_id = style.get(qn('w:styleId'), '') if style is not None else ''
        heading = style_id.startswith('Heading') or style_id == 'Title'
        fonts(font.getparent(), HEADING_FONT if heading else SUBTITLE_FONT if style_id == 'Subtitle' else BODY_FONT,
              'Arial' if heading or style_id == 'Subtitle' else 'Times New Roman')
    doc.styles['Normal'].font.size = Pt(11)
    doc.styles['Normal'].paragraph_format.line_spacing = 1.25

    # Include header/footer parts as well as the main body and every table cell.
    roots = [doc.element]
    for section in doc.sections:
        for area in [section.header, section.footer, section.first_page_header, section.first_page_footer,
                     section.even_page_header, section.even_page_footer]:
            if area._element not in roots:
                roots.append(area._element)
    for root in roots:
        for paragraph in root.iter(qn('w:p')):
            ppr = paragraph.find(qn('w:pPr'))
            if ppr is None:
                ppr = OxmlElement('w:pPr')
                paragraph.insert(0, ppr)
            child(ppr, 'snapToGrid').set(qn('w:val'), '0')
            spacing = ppr.find(qn('w:spacing'))
            if spacing is not None and spacing.get(qn('w:lineRule')) == 'exact':
                spacing.set(qn('w:lineRule'), 'atLeast')
            style = ppr.find(qn('w:pStyle'))
            style_id = style.get(qn('w:val'), '') if style is not None else ''
            heading = style_id.startswith('Heading') or style_id == 'Title'
            east_asia = HEADING_FONT if heading else SUBTITLE_FONT if style_id == 'Subtitle' else BODY_FONT
            in_table = any(ancestor.tag == qn('w:tc') for ancestor in paragraph.iterancestors())
            if in_table:
                spacing = child(ppr, 'spacing')
                spacing.set(qn('w:line'), '276')
                spacing.set(qn('w:lineRule'), 'auto')
            for run in paragraph.iter(qn('w:r')):
                rpr = child(run, 'rPr')
                existing = rpr.find(qn('w:rFonts'))
                code = existing is not None and existing.get(qn('w:ascii')) == 'Consolas'
                fonts(rpr, east_asia, 'Consolas' if code else 'Arial' if heading or style_id == 'Subtitle' else 'Times New Roman')
                if in_table:
                    child(rpr, 'sz').set(qn('w:val'), '19')  # 9.5 pt dense dictionary tables
            # Paragraph-mark formatting can otherwise retain a different font.
            fonts(child(ppr, 'rPr'), east_asia, 'Arial' if heading else 'Times New Roman')
        for height in root.iter(qn('w:trHeight')):
            if height.get(qn('w:hRule')) == 'exact':
                height.set(qn('w:hRule'), 'atLeast')
        for grid in list(root.iter(qn('w:docGrid'))):
            grid.getparent().remove(grid)
        for border in list(root.iter(qn('w:pBdr'))):
            border.getparent().remove(border)
    settings = doc.settings.element
    language = child(settings, 'themeFontLang')
    language.set(qn('w:val'), 'en-US')
    language.set(qn('w:eastAsia'), 'zh-CN')
    compat = child(settings, 'compat')
    mode = next((entry for entry in compat if entry.get(qn('w:name')) == 'compatibilityMode'), None)
    if mode is not None:
        mode.set(qn('w:val'), '15')

    for part in doc.part.package.parts:
        name = str(part.partname)
        if name == '/word/stylesWithEffects.xml':
            tree = etree.fromstring(part.blob)
            for font in list(tree.iter(qn('w:rFonts'))):
                fonts(font.getparent())
            part._blob = etree.tostring(tree, xml_declaration=True, encoding='UTF-8', standalone=True)
        elif name == '/word/fontTable.xml':
            tree = etree.fromstring(part.blob)
            for font_name, alternative in [(BODY_FONT, 'SimSun'), (HEADING_FONT, 'SimHei'), (SUBTITLE_FONT, 'Microsoft YaHei'),
                                           ('Arial', ''), ('Times New Roman', ''), ('Consolas', '')]:
                if any(font.get(qn('w:name')) == font_name for font in tree):
                    continue
                font = OxmlElement('w:font')
                font.set(qn('w:name'), font_name)
                if alternative:
                    child(font, 'altName').set(qn('w:val'), alternative)
                tree.append(font)
            part._blob = etree.tostring(tree, xml_declaration=True, encoding='UTF-8', standalone=True)


if __name__ == '__main__':
    source = Path(sys.argv[1])
    target = Path(sys.argv[2]) if len(sys.argv) > 2 else source
    document = Document(source)
    apply_windows_format(document)
    document.save(target)
    print(target)
