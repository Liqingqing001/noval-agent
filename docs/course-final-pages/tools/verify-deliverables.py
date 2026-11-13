from pathlib import Path
from zipfile import ZipFile
from lxml import etree as E
import json,re,runpy,subprocess
import fitz
from pptx import Presentation
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'deliverables';checks=[]
def check(n,v):
 if not v:raise AssertionError(n)
 checks.append(n)
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
for name,count in [('NovelAgent-Pages-Defense',30),('NovelAgent-Report',18),('NovelAgent-Talk-Guide',6)]:
 pdf=fitz.open(OUT/(name+'.pdf'));check(name+' PDF页数',len(pdf)==count);check(name+' 无空白页',all(len(p.get_text().strip())>70 for p in pdf));check(name+' 文本未越出页面',all(b[0]>=-1 and b[1]>=-1 and b[2]<=p.rect.width+1 and b[3]<=p.rect.height+1 for p in pdf for b in p.get_text('blocks')))
for f in OUT.glob('*.docx'):
 with ZipFile(f) as z:
  for name in z.namelist():
   if name=='word/document.xml' or re.match(r'word/(header|footer)\d+\.xml',name):
    x=E.fromstring(z.read(name))
    check(f.name+' '+name+' 显式中文字体',all((r.find('w:rPr/w:rFonts',ns) is not None and r.find('w:rPr/w:rFonts',ns).get('{'+ns['w']+'}eastAsia') in ['宋体','黑体']) for r in x.xpath('//w:r[w:t]',namespaces=ns)))
    check(f.name+' 无固定行高',not x.xpath('//w:trHeight[@w:hRule="exact"]',namespaces=ns))
    check(f.name+' 无浮动图片',not x.xpath('//*[local-name()="anchor"]'))
r=Presentation(OUT/'NovelAgent-Pages-Defense.pptx');pdf=fitz.open(OUT/'NovelAgent-Pages-Defense.pdf');check('30页PPT均有讲稿备注',len(r.slides)==30 and all(len(s.notes_slide.notes_text_frame.text)>50 for s in r.slides))
norm=lambda s:re.sub(r'\s+','',s)
for i,s in enumerate(r.slides):
 check(f'PPT {i+1} 文本和表格完整渲染',all(norm(sh.text) in norm(pdf[i].get_text()) for sh in s.shapes if sh.has_text_frame and sh.text.strip()) and all(norm(c.text) in norm(pdf[i].get_text()) for sh in s.shapes if sh.has_table for row in sh.table.rows for c in row.cells if c.text.strip()))
 check(f'PPT {i+1} 元素在画布内',all(sh.left>=0 and sh.top>=0 and sh.left+sh.width<=r.slide_width+2 and sh.top+sh.height<=r.slide_height+2 for sh in s.shapes))
links=[];inside=0
with ZipFile(OUT/'NovelAgent-Pages-Defense.pptx') as z:
 for name in z.namelist():
  if re.match(r'ppt/slides/_rels/slide\d+\.xml.rels',name):
   for rel in E.fromstring(z.read(name)):
    if rel.get('Type','').endswith('/hyperlink'):
     target=rel.get('Target');links.append(target)
     check('仅使用HTTPS外链',target.startswith('https://'))
     if '/blob/29589e4/' in target:
      p=target.split('/blob/29589e4/',1)[1];subprocess.run(['git','cat-file','-e','29589e4:'+p],cwd=ROOT.parents[1],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    elif rel.get('Type','').endswith('/slide'):
     m=re.search(r'slide(\d+)\.xml',rel.get('Target',''));check('内部跳转目标存在',m is not None and 1<=int(m[1])<=30);inside+=1
check('包含真实Pages与源码外链',links.count('https://liqingqing001.github.io/noval-agent/')==30 and any('/schema.prisma' in x for x in links))
check('含每页目录和演示台内部导航',inside>=60)
check('PDF每页保留在线按钮',all(any(a.get('uri')=='https://liqingqing001.github.io/noval-agent/' for a in p.get_links()) for p in pdf))
check('PDF保留内部跳转',all(any(a['kind']==fitz.LINK_GOTO for a in p.get_links()) for p in pdf))
meta=json.loads((ROOT/'evidence/sqlite-metadata.json').read_text());check('迁移7表68物理列含历史字段和6个外键',len(meta)==7 and sum(len(v['columns']) for v in meta.values())==68 and sum(len(v['foreignKeys']) for v in meta.values())==6)
fields=json.loads((ROOT/'evidence/schema-fields.json').read_text());check('当前Prisma7模型67标量字段',len(fields)==7 and sum(map(len,fields.values()))==67)
check('迁移与模型仅有已披露actNumber差异',all(set(c['name'] for c in meta[n]['columns'])-set(f['name'] for f in fields[n])==({'actNumber'} if n=='PlotCard' else set()) and set(f['name'] for f in fields[n])<=set(c['name'] for c in meta[n]['columns']) for n in fields))
tests=json.loads((ROOT/'evidence/test-summary.json').read_text());check('59项原系统专项检查通过',tests['total']==59 and tests['allPassed'])
check('真实Pages模式UI验证通过',json.loads((ROOT/'evidence/pages-browser.json').read_text())['result']=='PASS')
result={'result':'PASS','checkedItems':len(checks),'uniqueChecks':list(dict.fromkeys(checks)),'pptSlides':30,'reportPages':18,'guidePages':6,'externalHyperlinkRelationships':len(links),'internalSlideRelationships':inside,'externalURLReachability':'structure/source paths validated; online Pages was 403 in cloud, not claimed reachable','officeValidation':'Linux LibreOffice + Noto CJK substitution, not Windows Office validation','visualReview':'all PDF pages reviewed as contact sheets; ER, save flow and dense pages examined'}
(ROOT/'evidence/deliverable-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in result.items() if k!='uniqueChecks'},ensure_ascii=False,indent=2))
