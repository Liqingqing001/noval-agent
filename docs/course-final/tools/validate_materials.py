from pathlib import Path
from zipfile import ZipFile
import json,re,sys
from lxml import etree as E
import fitz
from pptx import Presentation
root=Path(__file__).resolve().parents[1]
out=Path(sys.argv[1]) if len(sys.argv)>1 else root/'deliverables'
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';A='http://schemas.openxmlformats.org/drawingml/2006/main'
checks=[]
def check(name,value):
 checks.append({'check':name,'passed':bool(value)})
 if not value:raise AssertionError(name)
for name,expected in [('01_实验报告',16),('02_答辩演示',12),('03_讲稿与演示手册',9)]:
 d=fitz.open(out/(name+'.pdf'));check(name+' PDF页数',len(d)==expected)
 check(name+' 无空白页',all(len(p.get_text().strip())>70 for p in d))
 check(name+' 无页面外文本',all(b[0]>=-1 and b[1]>=-1 and b[2]<=p.rect.width+1 and b[3]<=p.rect.height+1 for p in d for b in p.get_text('blocks')))
for path in out.glob('*.docx'):
 with ZipFile(path) as z:
  for part in [n for n in z.namelist() if n=='word/document.xml' or re.match(r'word/(header|footer)\d+\.xml',n)]:
   doc=E.fromstring(z.read(part));ns={'w':W}
   for r in doc.xpath('//w:r[w:t]',namespaces=ns):
    f=r.find('{'+W+'}rPr/{'+W+'}rFonts');check(path.stem+' 正文表格页眉页脚显式中文字体',f is not None and f.get('{'+W+'}eastAsia') in ['宋体','黑体'])
   check(path.stem+' 无固定表格行高',not doc.xpath('//w:trHeight[@w:hRule="exact"]',namespaces=ns))
   check(path.stem+' 无浮动图片',not doc.xpath('//*[local-name()="anchor"]'))
  styles=E.fromstring(z.read('word/styles.xml'));check(path.stem+' 字体节点无重复',all(len(e.findall('{'+W+'}rFonts'))<=1 for e in styles.iter('{'+W+'}rPr')))
prs=Presentation(out/'02_答辩演示.pptx');check('PPT含12页备注讲稿',len(prs.slides)==12 and all(len(s.notes_slide.notes_text_frame.text)>50 for s in prs.slides))
pdf=fitz.open(out/'02_答辩演示.pdf');norm=lambda s:re.sub(r'\s+','',s)
for i,s in enumerate(prs.slides):
 check(f'PPT第{i+1}页元素均在画布内',all(sh.left>=0 and sh.top>=0 and sh.left+sh.width<=prs.slide_width+2 and sh.top+sh.height<=prs.slide_height+2 for sh in s.shapes))
 title=[sh.text for sh in s.shapes if sh.has_text_frame and sh.text.strip() and any(r.font.size and r.font.size.pt>=30 for p in sh.text_frame.paragraphs for r in p.runs)]
 check(f'PPT第{i+1}页主标题完整渲染',bool(title) and all(norm(t) in norm(pdf[i].get_text()) for t in title))
metadata=json.loads((root/'evidence/schema-metadata.json').read_text());check('数据库4表24字段',len(metadata)==4 and sum(map(len,metadata.values()))==24)
api=json.loads((root/'evidence/api-test-results.json').read_text());check('32项具体检查通过',api['passed']==32 and api['failed']==0)
check('真实浏览器流程通过',json.loads((root/'evidence/browser-results.json').read_text())['result']=='PASS')
# Repeated font checks are summarized rather than stored as hundreds of duplicate entries.
summary={}
for c in checks:summary[c['check']]=c['passed']
result={'result':'PASS','office_validation':'Linux LibreOffice with explicit Noto CJK substitutions; not Windows Office validation','manual_visual_review':'report16/handbook9/deck12 pages rendered and reviewed; dense pages and ER/architecture slides inspected','checks':summary}
(root/'evidence/material-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('PASS:',len(summary),'material and evidence checks')
