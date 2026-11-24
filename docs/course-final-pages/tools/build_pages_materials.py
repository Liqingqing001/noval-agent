"""Original NovelAgent / Pages course deck. No simplified application is generated."""
from pathlib import Path
import json,re,os,math
from PIL import Image,ImageDraw,ImageFont
from pptx import Presentation
from pptx.util import Inches as I,Pt as P
from pptx.dml.color import RGBColor as C
from pptx.enum.shapes import MSO_SHAPE,MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN
from lxml import etree as E
from docx import Document
from docx.shared import Cm,Pt,Inches,RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
ROOT=Path(__file__).resolve().parents[1];AS=ROOT/'assets';OUT=ROOT/'deliverables';OUT.mkdir(exist_ok=True)
WEB='https://liqingqing001.github.io/noval-agent/'
REPO='https://github.com/Liqingqing001/noval-agent'
SOURCE=REPO+'/blob/29589e4/'
MODEL=SOURCE+'packages/backend/prisma/schema.prisma'
G='295A46';INK='243F34';M='718279';BG='F5F7F1';SOFT='E7EFE7';GOLD='B18A4D';WHITE='FFFFFF'
MODELS=json.loads((ROOT/'evidence/schema-fields.json').read_text())
TESTS=json.loads((ROOT/'evidence/test-summary.json').read_text())
ZH={'User':'用户','Novel':'小说','Chapter':'章节','Character':'人物','WorldSetting':'世界观','PlotCard':'大纲卡片','Foreshadowing':'伏笔'}
DICT={
'id':'主键编号，CUID 字符串','email':'登录邮箱，唯一','passwordHash':'密码散列，不在公开快照中导出','nickname':'昵称','createdAt':'创建时间','updatedAt':'更新时间，由 Prisma @updatedAt 维护',
'userId':'所属用户，物理外键','title':'标题 / 书名','cover':'封面地址或数据','wordCount':'保存的字数，应用维护','status':'业务状态字符串，非数据库枚举','genre':'题材','summary':'简介 / 大纲摘要','agentPrompt':'作品级 AI 提示词','lastOpenedChapterId':'最近阅读章节的业务引用，非外键',
'novelId':'所属小说，物理外键','content':'正文 / 设定内容','sequence':'排序序号，索引非唯一','name':'人物姓名','aliases':'JSON 字符串存储别名','description':'描述 / 伏笔说明','appearance':'外貌','personality':'性格','background':'背景','avatar':'头像路径或图像数据','relationships':'JSON 字符串存同书人物关系','firstAppearanceChapterId':'首次登场章节业务引用，非外键','role':'主角 / 配角等定位字符串',
'category':'世界观分类','type':'卷 / 章节大纲类型','volumeId':'所属卷的业务引用，非外键','chapterId':'关联正文章节的业务引用，非外键','statusMode':'进度判断模式：自动 / 手动',
'plantedChapterId':'埋设正文章节引用，非外键','resolvedChapterId':'回收正文章节引用，非外键','plantedPlotCardId':'埋设大纲引用，非外键','resolvedPlotCardId':'回收大纲引用，非外键'}
MAIN=[1,2,3,5,7,8,10,11,14,15,18,19,20]
TIMES=[20,20,25,25,30,40,25,30,35,30,25,180,20]
TITLES=['NovelAgent 小说创作管理系统','同一个系统，一条讲得清的主线','从创作场景推导需求','答辩导航：点击进入你要讲的部分','作品、章节、AI 放在同一张桌上','人物关系不是一串孤立的名字','概念模型：七类实体围绕小说组织','重点 E-R：用户、小说、章节、人物','完整 E-R：保留真实模型，略去次要属性','把实体联系转换为关系表','关键数据字典：解释这些字段就够了','完整性：数据库约束与应用规则分工','减少重复，也承认现有设计的取舍','同一套界面，两条数据保存路径','一次章节修改如何真正保存','大纲、世界观与伏笔构成创作上下文','AI 是辅助，结果仍需校验与确认','测试证据：59 项原项目专项检查通过','现场演示控制台：查 → 增 → 改 → 删','总结：页面操作背后是数据关系','附录：用户与小说字段','附录：章节与人物字段','附录：世界观、大纲与伏笔字段','附录：接口与 SQL 对照','附录：测试用例与观察方法','附录：源码、资料与答辩问答']
NOTES=[
'大家好，我展示的是自己现有的 NovelAgent 小说创作系统，课堂打开的就是 GitHub Pages。今天我不会把项目的所有功能和字段逐个念一遍，而是沿着“需求、数据关系、保存流程、实际操作”介绍。本次以实际作品和页面操作说明设计。点击右下角“下一讲”即可沿十分钟路线播放。',
'这个系统用于中文长篇创作，把小说、章节、人物、大纲、世界观和伏笔放在一起。现有项目的 Prisma 模型有七类实体、六十七个标量字段，主要讲四个实体。这里的数字来自当前 schema，不是额外设计的一套表。页面上有完整小说案例，可以直接看实际数据。',
'先看需求：作者需要把多本作品分开，需要按顺序管理章节，也需要随时查人物和设定。所以作品是组织中心，章节和设定是它的子项。对这次数据库作业，我的最低验收就是能新增、查询、修改和删除记录，再说明这些操作在完整应用和 Pages 中如何保存。',
'这是可点击的答辩目录。点击需求、数据模型、系统实现或现场演示，可以跳到对应页面。正文和附录都留在这个文件内，老师提问时不用退出去翻 Word。右上角可以打开实际在线系统；在线链接目前只到首页，没有虚构不存在的模块深链接。',
'这是当前系统以 Pages 模式运行的真实界面。左边是书架，中间是章节目录和正文，右边是 AI 助手。展示重点是一本小说如何组织多个章节，以及用户修改后如何保存。课堂将打开同一套在线界面进行操作。',
'人物除了姓名，还有头像、性格、背景和显式关系。画布提供全景、单人聚焦和两人关系，关系线可以调整。这里要区分业务关系和数据库外键：人物之间的关系在当前实现中保存为 JSON 字符串，并没有额外建立人物关系表。',
'这张概念图包含全部七类实体。用户拥有小说，小说包含章节、人物、世界观、大纲和伏笔。主讲只展开用户、小说、章节、人物这条主干。其他模块保留在总览里，不代表系统删掉了它们。',
'重点关系是三个一对多：一个用户写多本小说，一本小说有多个章节，也有多个人物。每个子项只属于一本小说。转成表后，用户编号放在小说表，小说编号放在章节和人物表，成为实际外键。图里只挑了帮助理解的属性，完整字段在 schema 和配套报告中。',
'这是七个实体的完整关系总览。实线只画 Prisma 定义的六个物理外键。chapterId、volumeId 和首次登场等字符串虽然像编号，在当前模型中不是外键，不应把业务引用全部画成数据库已经强制保证的关系。',
'实体转成关系表，一对多联系把一方主键放进多方。User.id 对应 Novel.userId，Novel.id 对应其余五类子项的 novelId。小说不需要存一长串章节编号，查询章节时按 novelId 筛选即可。章节顺序有索引，但现有数据库没有设置同书序号唯一约束。',
'字段不用背全。我重点解释主键 id、归属字段 userId 和 novelId、用于阅读的标题正文，以及 sequence 排序。wordCount 是现有系统实际保存的派生数据，需要应用同步维护；这里采用应用维护的统计字段，而非每次由数据库即时计算。',
'主键、邮箱唯一和六个外键由数据库保证，小说下的子项随删除级联清理。状态字符串、同书人物引用和字段语义更多由应用判断。当前 schema 里没有把所有状态定义成枚举，也没有为每个字符串引用加外键，所以不能把这些写成已经实现的 CHECK 约束。',
'把作品、章节、人物分别建表，可以减少复制书名和用户资料带来的更新问题。但真实项目也有工程取舍：字数冗余保存，别名和人物关系使用 JSON 字符串，部分章节引用只由应用管理。因此我只解释减少冗余的思路，不宣称全部物理设计严格满足第三范式。',
'最重要的边界在这里。普通完整版由 React 调用 Express API，经 Prisma 写入 SQLite。课堂展示的 Pages 是静态站点，不运行这个后端，而是加载从数据库导出的案例快照，后续修改存到当前浏览器。两种模式共用创作界面，数据去向不同。',
'修改章节时，编辑器会做约五百毫秒的防抖保存，再更新 Zustand 状态。Pages 使用带演示命名空间的本机存储；完整应用在登录状态下异步调用 API，后端检查归属后写数据库。刷新能验证当前模式的保存，但 Pages 刷新只证明浏览器持久化，不证明远端数据库发生了 UPDATE。',
'大纲把卷和章节计划联系起来，世界观整理环境规则，伏笔记录埋设与回收。在课堂中可以快速打开这些页面展示系统完整度，但不必逐项解释字段。这里也是后续 AI 生成上下文的来源，而不是额外创建的课程模块。',
'AI 功能可以用模型服务做续写、润色和检查，输出需要解析、校验和用户审阅。现场不依赖模型 API，以免密钥、网络或余额影响演示。公开站点里的已有章节回放不是实时生成，不能当成大模型现场调用。',
'我重新运行了原项目五组专项检查，共五十九项通过：数据库案例三项、人物资料与接口三项、演示初始化八项、同步三十三项、编辑导出十二项。数据库案例测试真的创建临时 SQLite，浏览器测试则验证 Pages 模式的界面和本机保存。这些结果对应本次专项范围，不等于全量回归。',
'现在切到实际 GitHub Pages。先浏览现有作品，再创建一部专门的课堂演示小说，新增一章并输入一小段文字。稍等自动保存，重命名章节，再刷新确认还在，最后删除这个测试章节。说明此处修改只存当前浏览器，不会改掉公开小说或上传仓库。结束后回到 PPT 点“演示结束，去总结”。',
'这个项目的核心是用小说作为组织中心，把章节与设定联系起来。现有系统可以完整展示，讲解只抓关键关系。数据库能力由原项目模型、迁移和接口测试说明，Pages 用于展示同一套界面与本机操作。下一步可以加强引用完整性、事务和并发控制。谢谢大家。',
'附录保留用户和小说的关键字段。密码散列不导出到 Pages，公开快照也不包含邮箱、API Key 和作品级私有配置。完整字段与定义都可以点击右侧源码查看。',
'章节按 novelId 归属，sequence 用于排序。人物的 aliases 和 relationships 是 JSON 字符串，头像路径或数据保存在 avatar，画布局部布局还有本机保存的边界。逻辑引用不能自动等同于外键。',
'世界观、大纲和伏笔都围绕 novelId 归属。PlotCard 的 type 区分卷和章节，statusMode 支持自动或手动进度；Foreshadowing 的埋设和回收字段是字符串业务引用。',
'此页用于回答“接口和 SQL 在哪里”。接口名来自现有路由，展示的是等价 SQL 语义，不是声称 Prisma 每次都生成完全相同的一条 SQL。Pages 现场不会发这些数据库写请求。',
'测试用例区分测试对象与证据。数据库导入检查临时库真实记录；人物接口检查同书关系校验；Pages 检查创建、自动保存、重命名、刷新和删除。未配置模型时不测试真实 API 生成，也不编造并发性能数字。',
'这里提供在线演示、项目仓库、真实 Prisma schema、后端接口和主要专项文档链接。附带回答三个常见问题：Pages 为什么没有数据库服务；为什么不讲完所有字段；人物关系为什么不是独立关系表。报告包含完整字段附录，课堂不逐条朗读。'
]
TITLES += ['附录：版本、一致性与人物时间线','附录：参考作品分析与独立新稿','附录：模型配置与课堂准备','附录：增改删实拍备用页']
NOTES += [
'原系统已有创作检查页面，提供章节历史、全书一致性和人物时间线。截图显示的是实际入口，不把界面静态结果当作模型已经执行。课堂可快速展示，老师追问时再展开相应模块；涉及模型的检查仍需要用户配置 API。',
'参考创作是现有系统中的独立工作区，支持导入参考资料、选择范围、分批分析和生成独立新稿。它的批次进度与本机资料有自己的保存边界。这个页面用来展示系统深度，不在十分钟主线里完整操作大模型流程。',
'设置页展示原有模型接入和创作选项。截图来自没有个人密钥的隔离浏览器。课堂前先打开 Pages、准备窗口和缩放比例；不要在公开放映中输入个人 API Key，也不要把未实际调用的模型描述为刚刚现场生成。',
'这里提供真实 Pages 模式操作后的备用截图：创建测试小说和章节，修改标题并刷新，然后删除章节。只能作为操作结果示意，不能冒充此刻线上操作或数据库服务端写入。正常网络条件下优先现场打开实际 GitHub Pages。'
]
LINKS=[]
prs=Presentation();prs.slide_width=I(13.333);prs.slide_height=I(7.5)

def rect(s,x,y,w,h,fill=WHITE,line=None,r=.08):
 a=s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,I(x),I(y),I(w),I(h));a.adjustments[0]=r;a.fill.solid();a.fill.fore_color.rgb=C.from_string(fill)
 if line:a.line.color.rgb=C.from_string(line)
 else:a.line.fill.background()
 st=a._element.find('{http://schemas.openxmlformats.org/presentationml/2006/main}style')
 if st is not None:a._element.remove(st)
 E.SubElement(a._element.spPr,'{http://schemas.openxmlformats.org/drawingml/2006/main}effectLst')
 return a

def txt(s,x,y,w,h,text,size=18,color=INK,bold=False):
 sh=s.shapes.add_textbox(I(x),I(y),I(w),I(h));tf=sh.text_frame;tf.word_wrap=True;tf.margin_left=tf.margin_right=0;tf.margin_top=tf.margin_bottom=0
 for j,line in enumerate(str(text).split('\n')):
  p=tf.paragraphs[0] if j==0 else tf.add_paragraph();p.text=line;p.space_after=P(6)
  for r in p.runs:
   r.font.name='微软雅黑';r.font.size=P(size);r.font.bold=bold;r.font.color.rgb=C.from_string(color);rp=r._r.get_or_add_rPr();ea=E.SubElement(rp,'{http://schemas.openxmlformats.org/drawingml/2006/main}ea');ea.set('typeface','微软雅黑')
 return sh

def button(s,x,y,w,text,target=None,url=None,fill=G,color=WHITE):
 a=rect(s,x,y,w,.43,fill);tb=txt(s,x+.12,y+.08,w-.24,.3,text,12,color,True)
 if target:LINKS.extend([(a,target),(tb,target)])
 if url:a.click_action.hyperlink.address=url;tb.click_action.hyperlink.address=url
 return a

def line(s,x,y,x2,y2,color=G,width=1.6):
 a=s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT,I(x),I(y),I(x2),I(y2));a.line.color.rgb=C.from_string(color);a.line.width=P(width);st=a._element.find('{http://schemas.openxmlformats.org/presentationml/2006/main}style');a._element.remove(st) if st is not None else None;E.SubElement(a._element.spPr,'{http://schemas.openxmlformats.org/drawingml/2006/main}effectLst');return a

def pic(s,name,x,y,w,h):
 im=Image.open(AS/name);ratio=im.width/im.height;ww=min(w,h*ratio);hh=ww/ratio;s.shapes.add_picture(str(AS/name),I(x+(w-ww)/2),I(y+(h-hh)/2),width=I(ww),height=I(hh))

def crop(name,box,new):Image.open(AS/name).crop(box).save(AS/new)
def caption(s,t,y=6.57):txt(s,.7,y,11.9,.32,t,10,M)

def base(i,section):
 s=prs.slides.add_slide(prs.slide_layouts[6]);s.background.fill.solid();s.background.fill.fore_color.rgb=C.from_string(BG)
 rect(s,.55,.36,.08,.33,G);txt(s,.75,.37,7,.32,'NOVELAGENT  /  数据库 Web 应用系统设计开发',10,M)
 button(s,8.65,.29,1.1,'目录',target=4,fill=SOFT,color=G);button(s,9.9,.29,1.1,'演示台',target=19,fill=SOFT,color=G);button(s,11.15,.29,1.5,'在线系统 ↗',url=WEB)
 txt(s,.7,.97,11.9,.34,section,12,G,True);txt(s,.7,1.48,11.9,.85,TITLES[i-1],29,INK,True)
 line(s,.7,6.98,12.63,6.98,color='DBE4D9',width=.7);txt(s,.7,7.12,8,.22,'现有 NovelAgent · 原系统 Pages 展示 · 主讲精简，模型保留',9,M);txt(s,12.1,7.1,.5,.25,f'{i:02}',11,G)
 if i in MAIN:
  n=MAIN.index(i);target=MAIN[n+1] if n+1<len(MAIN) else 1;button(s,10.32,7.06,1.5,'下一讲 →' if i!=20 else '回到封面',target=target,fill=SOFT,color=G)
 s.notes_slide.notes_text_frame.text=NOTES[i-1]
 return s

def cards(s,items,y=2.75,h=3.35):
 n=len(items);w=(11.9-.22*(n-1))/n
 for j,(title,body) in enumerate(items):
  x=.7+j*(w+.22);rect(s,x,y,w,h);txt(s,x+.23,y+.22,w-.46,.38,f'{j+1:02}',13,G,True);txt(s,x+.23,y+.86,w-.46,.83,title,21,INK,True);txt(s,x+.23,y+1.8,w-.46,h-1.96,body,17,M)

def table_slide(s,headers,rows,x=.7,y=2.65,w=11.9,h=3.7,fs=15,widths=None):
 sh=s.shapes.add_table(len(rows)+1,len(headers),I(x),I(y),I(w),I(h));t=sh.table
 if widths:
  for c,ww in zip(t.columns,widths):c.width=I(ww)
 for i,row in enumerate([headers]+rows):
  for j,v in enumerate(row):
   c=t.cell(i,j);c.fill.solid();c.fill.fore_color.rgb=C.from_string(G if i==0 else (WHITE if i%2 else SOFT));c.margin_left=I(.12);c.margin_top=I(.08);c.margin_bottom=I(.05);c.text=str(v)
   for p in c.text_frame.paragraphs:
    p.space_after=P(2)
    for r in p.runs:
     r.font.name='微软雅黑';r.font.size=P(fs);r.font.bold=i==0;r.font.color.rgb=C.from_string(WHITE if i==0 else INK);ea=E.SubElement(r._r.get_or_add_rPr(),'{http://schemas.openxmlformats.org/drawingml/2006/main}ea');ea.set('typeface','微软雅黑')
 return sh

def two_screens(s,a,b,la,lb):
 rect(s,.7,2.6,5.8,3.75);rect(s,6.72,2.6,5.8,3.75);pic(s,a,.8,2.75,5.6,3.25);pic(s,b,6.82,2.75,5.6,3.25);txt(s,.95,6.08,5.2,.3,la,13,G,True);txt(s,6.95,6.08,5.2,.3,lb,13,G,True)

def entity(s,x,y,w,h,title,attrs):
 rect(s,x,y,w,h,WHITE,line='BDD0C1');rect(s,x,y,w,.47,G);txt(s,x+.13,y+.09,w-.26,.36,title,17,WHITE,True);txt(s,x+.13,y+.65,w-.26,h-.66,attrs,14,INK)

def er_native(s,full=False):
 if not full:
  entity(s,.8,3.45,2.25,1.78,'用户','用户编号（主键）\n邮箱（唯一）、昵称');entity(s,4.0,3.45,2.7,2.1,'小说','小说编号（主键）\n用户编号（外键）\n书名、状态');entity(s,9.0,2.65,3.35,1.65,'章节','章节编号（主键）\n小说编号（外键）、标题');entity(s,9.0,4.85,3.35,1.65,'人物','人物编号（主键）\n小说编号（外键）、姓名')
  line(s,3.05,4.28,4,4.28);txt(s,3.1,3.7,.86,.48,'1 → N',12,G,True)
  for yy in [3.5,5.55]:line(s,6.7,4.3,7.6,4.3);line(s,7.6,4.3,7.6,yy);line(s,7.6,yy,9,yy);txt(s,7.8,yy-.35,1.1,.35,'1 → N',12,G,True)
 else:
  entity(s,.8,3.8,2.25,1.5,'用户','主键：用户编号');entity(s,4.0,3.8,2.65,1.5,'小说','主键：小说编号')
  line(s,3.05,4.5,4,4.5);txt(s,3.1,4.0,.9,.4,'1 → N',12,G,True);line(s,6.65,4.5,7.65,4.5);line(s,7.65,2.9,7.65,6.2)
  for j,title in enumerate(['章节','人物','世界观','大纲卡片','伏笔']):
   yy=2.52+j*.83;rect(s,9,yy,3.35,.65,WHITE,line='BDD0C1');txt(s,9.18,yy+.14,2.9,.4,title,19,G,True);line(s,7.65,yy+.325,9,yy+.325);txt(s,7.8,yy-.05,1.05,.3,'1 → N',11,G)

def draw_png_er():
 im=Image.new('RGB',(2000,1160),'#f5f7f1');d=ImageDraw.Draw(im);f=lambda n,b=False:ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-'+('Bold' if b else 'Regular')+'.ttc',n)
 d.text((65,42),'NovelAgent 现有系统 · 中文 E-R 总览',font=f(42,True),fill='#243f34')
 def box(x,y,w,h,t,attrs):
  d.rounded_rectangle((x,y,x+w,y+h),radius=15,fill='white',outline='#bdd0c1',width=3);d.rectangle((x,y,x+w,y+64),fill='#295a46');d.text((x+18,y+9),t,font=f(31,True),fill='white')
  for i,a in enumerate(attrs):d.text((x+18,y+85+i*43),a,font=f(25),fill='#243f34')
 box(65,430,365,220,'用户',['用户编号（主键）','邮箱（唯一）、昵称']);box(675,410,440,265,'小说',['小说编号（主键）','用户编号（外键）','书名、状态、字数'])
 d.line((430,525,675,525),fill='#295a46',width=4);d.text((460,475),'一 → 多 / 拥有',font=f(25),fill='#295a46')
 for j,(t,a) in enumerate([('章节','标题、正文、章序'),('人物','姓名、头像、关系数据'),('世界观','分类、标题、内容'),('大纲卡片','卷/章节类型、摘要、状态'),('伏笔','说明、埋设与回收标记')]):
  y=150+j*170;box(1500,y,435,162,t,['小说编号（外键）',a]);d.line([(1115,525),(1265,525),(1265,y+70),(1500,y+70)],fill='#295a46',width=3);d.text((1300,y+28),'一 → 多',font=f(23),fill='#295a46')
 d.text((65,1065),'图中仅画六个物理外键；章节/卷等字符串业务引用不作为已实现外键绘制。',font=f(26),fill='#718279');im.save(AS/'er-original-seven.png')

def make_deck():
 s=base(1,'数据库课程汇报 / 现有系统实讲');rect(s,.7,2.65,5.1,3.8,G);txt(s,1,3.05,4.5,1.5,'同一个产品\n讲清数据背后的关系',29,WHITE,True);txt(s,1,5.0,4.5,.9,'姓名：________  学号：________\n班级 / 小组：________________',15,'D9E5DA');pic(s,'01-chapters.png',6.05,2.65,6.57,3.75);button(s,7.15,6.4,2.5,'打开 GitHub Pages ↗',url=WEB);button(s,10,6.4,2.5,'开始 10 分钟路线',target=2);caption(s,'正文 20 页 + 10 页补充分析；点击“下一讲”走 13 页精讲路线。',y=6.7)
 s=base(2,'01 / 项目定位');cards(s,[('真实项目','React + Express + Prisma + SQLite\nPages 共用同一套创作界面。'),('讲解取舍','保留 7 类实体 / 67 个标量字段\n重点展开 4 类实体，不逐项背属性。'),('现场演示','打开现有 GitHub Pages\n展示实际书架与章节增、改、删。')]);caption(s,'讲解主线：需求 → 数据关系 → 保存流程 → 页面操作。')
 s=base(3,'02 / 需求分析');table_slide(s,['使用场景','功能需求','如何验收'],[['多本作品容易混在一起','书架、作品资料与分类','切换小说，内容独立'],['正文需要持续修改','章节增删改查、排序与自动保存','编辑后刷新可继续阅读'],['人物和规则要前后一致','人物关系、世界观、大纲与伏笔','查看设定及关联'],['需要检查与交付稿件','创作检查、版本、导出','查看检查结果与导出入口']]);caption(s,'最低演示闭环：查询 → 新增 → 修改 → 删除；AI 作为扩展，不占用现场生成时间。')
 s=base(4,'交互目录 / 点击任意卡片跳转');
 for j,(a,b,n) in enumerate([('看系统','书架、人物、大纲、世界观',5),('看模型','七类实体、重点 E-R、完整 E-R',7),('看设计','转表、字段、完整性、设计取舍',10),('看实现','两种保存路径、章节保存、AI',14),('看证据','专项测试与实际操作',18),('做演示','在线入口与三分钟操作卡',19)]):
  x=.7+(j%3)*4.05;y=2.6+(j//3)*1.8;rect(s,x,y,3.78,1.55);txt(s,x+.2,y+.18,3.35,.45,a,23,G,True);txt(s,x+.2,y+.8,3.3,.4,b,13,M);button(s,x+2.65,y+.15,.85,'进入',target=n,fill=SOFT,color=G)
 caption(s,'推荐精讲：1 → 2 → 3 → 5 → 7 → 8 → 10 → 11 → 14 → 15 → 18 → 19 → 20')
 s=base(5,'03 / 当前界面');pic(s,'01-chapters.png',.7,2.5,8.9,3.9);rect(s,9.85,2.65,2.75,3.6,WHITE);txt(s,10.05,2.95,2.35,.6,'一部作品的工作区',19,G,True);txt(s,10.05,3.95,2.35,2.1,'书架：小说\n目录：章节\n正文：持续编辑\n助手：按上下文创作',17,M);caption(s,'截图：现有项目同一套创作组件，以 Pages 演示模式实际运行。')
 s=base(6,'功能插图 / 人物与关系');pic(s,'02-characters.png',.7,2.5,9.2,3.95);txt(s,10.1,2.8,2.5,.8,'从档案到关系图',21,G,True);txt(s,10.1,3.85,2.4,2.3,'头像、性格与背景\n单人 / 两人聚焦\n人物、关系线可拖动\n关系数据与画布布局分开保存',16,M);caption(s,'业务人物关系目前采用 JSON 字符串；不虚构独立的人物关系表。')
 s=base(7,'04 / 概念数据模型');cards(s,[('拥有者','用户 User\n负责登录与作品归属。'),('组织中心','小说 Novel\n承载书名、简介、状态等。'),('作品子项','章节 / 人物 / 世界观\n大纲卡片 / 伏笔\n统一按 novelId 归属。')]);button(s,.95,6.15,2.5,'看完整 E-R →',target=9,fill=SOFT,color=G);button(s,3.7,6.15,2.7,'打开真实 schema ↗',url=MODEL,fill=SOFT,color=G)
 s=base(8,'05 / 重点中文 E-R');er_native(s);caption(s,'仅省略次要属性，不删实体或改系统；三个一对多联系 → 三个子表归属字段。')
 s=base(9,'完整关系总览 / 课后或答疑可展开');er_native(s,True);caption(s,'实际为 User→Novel 1 个外键 + Novel→5 类子项 5 个外键；都定义了删除级联。')
 s=base(10,'06 / 关系模式转换');table_slide(s,['概念联系','现有关系表 / 字段','转换结果'],[['用户拥有小说','User.id → Novel.userId','一方主键进入多方，成为外键'],['小说包含章节','Novel.id → Chapter.novelId','章节独立成行，不在小说表堆列表'],['小说设定人物','Novel.id → Character.novelId','按小说查询、维护人物'],['其余子项归属小说','WorldSetting / PlotCard / Foreshadowing.novelId','相同的一对多转换规则']]);caption(s,'关系与字段以原项目 schema 为准；Chapter(novelId, sequence) 是索引，当前不是 UNIQUE。')
 s=base(11,'07 / 关键数据字典');table_slide(s,['表','重点字段','这次讲解要点'],[['User 用户','id / email / passwordHash','唯一身份；邮箱唯一；密码保存散列'],['Novel 小说','id / userId / title / status','主键、归属、作品资料与业务状态'],['Chapter 章节','id / novelId / content / sequence','内容单独存；按作品和章序查询'],['Character 人物','id / novelId / name / relationships','人物属于作品；关系数据为 JSON 字符串']]);caption(s,'完整字段在 Word 附录与真实 schema；课堂先讲“编号、归属、内容、顺序”。')
 s=base(12,'完整性与约束 / 不把规划写成已实现');cards(s,[('数据库保证','主键标识记录\n邮箱唯一\n6 个归属外键\nON DELETE CASCADE'),('应用负责','登录后的归属校验\n人物关系同书校验\n状态、排序与字数维护\n业务引用的检查'),('当前没有','不是所有 Id 都是外键\n章序索引不是唯一约束\nstatus 是字符串\n没有宣称全套 CHECK')]);caption(s,'新增功能前先确认约束落在哪一层，避免图、文档和代码互相矛盾。')
 s=base(13,'范式与工程取舍');cards(s,[('拆表带来的好处','章节不重复存用户资料\n人物不重复存整本小说\n按归属减少复制与更新问题'),('真实项目的冗余','小说与章节保存字数\n由应用同步维护\n不是完全即时统计模型'),('可改进的地方','aliases / relationships 用 JSON\n部分引用无物理外键\n迁移仍有历史字段\n不宣称整套严格 3NF')]);caption(s,'分析现有设计的收益与代价，再据此安排后续改进。')
 s=base(14,'08 / 前后端与部署设计');
 for j,(title,parts) in enumerate([('普通完整版：数据库保存',['React / Zustand','Express API + JWT 归属校验','Prisma → SQLite']),('课堂 Pages：当前浏览器保存',['同一套 React 创作组件','数据库导出快照初始化','localStorage / IndexedDB'])]):
  y=2.65+j*1.85;rect(s,.7,y,11.9,1.6,WHITE);txt(s,.95,y+.2,3,.9,title,20,G,True)
  for k,a in enumerate(parts):x=4.15+k*2.8;rect(s,x,y+.3,2.55,.9,SOFT);txt(s,x+.12,y+.46,2.31,.6,a,15,INK);
 caption(s,'Pages 不运行 Express / SQLite，也不会把浏览器修改写回仓库；两条路径不能混说。')
 s=base(15,'09 / 保存流程');steps=['修改正文','500ms 防抖','更新状态','按模式持久化','刷新回读']
 for j,a in enumerate(steps):x=.7+j*2.42;rect(s,x,2.85,2.2,1.05,WHITE);txt(s,x+.12,3.13,1.96,.55,a,19,G,True)
 rect(s,.7,4.35,5.8,1.65,SOFT);txt(s,.95,4.55,5.3,1.1,'Pages：演示命名空间本机保存\n刷新仍在，只证明浏览器持久化。',18,INK)
 rect(s,6.72,4.35,5.88,1.65,WHITE);txt(s,6.95,4.55,5.4,1.1,'完整版：异步 API → 归属检查 → 数据库\n数据库结果需要接口或查询证据。',18,INK);caption(s,'引用：ChapterEditor.tsx、novelStore.ts、api/client.ts、后端 chapters.ts。')
 s=base(16,'功能插图 / 大纲与世界观');two_screens(s,'03-outline.png','04-world.png','大纲：卷、章节计划与进度','世界观：设定分类、图文内容');caption(s,'伏笔保留在现有大纲业务中；只挑与现场叙事相关的记录展示。')
 s=base(17,'AI 辅助流程 / 加分项，不占用现场生成');cards(s,[('输入上下文','当前 / 指定章节\n作品设定与大纲\n发送前可查看范围'),('生成与校验','配置自己的模型 API\n流式回复、结构化解析\n失败保留内容，可重试'),('审阅与使用','检查、版本、预算提示\n生成结果先审阅\n再进入当前保存流程')]);caption(s,'已有章节回放 ≠ 实时大模型生成；课堂主流程无需个人密钥与外部模型。')
 s=base(18,'10 / 测试结果与证据');
 items=[('数据库导入 / 快照',3),('人物资料 / 真实接口',3),('Pages 初始化 / 数据保护',8),('结构化内容 / 修改同步',33),('编辑 / 导出',12)]
 for j,(name,count) in enumerate(items):
  y=2.65+j*.68;txt(s,.85,y,4,.42,name,16,INK);rect(s,4.95,y+.02,6.2*(count/33),.31,G);txt(s,11.55,y,1,.4,str(count)+' 项',15,G,True)
 caption(s,'本次原系统 5 组专项共 59 项通过；另做 Pages 模式真实界面增改删与刷新保存。非全量测试或线上服务验证。')
 s=base(19,'现场演示 / 约 3 分钟');button(s,.85,2.55,4.05,'一键打开现有 GitHub Pages ↗',url=WEB);button(s,5.1,2.55,3.4,'查看现有数据库模型 ↗',url=MODEL);button(s,8.7,2.55,3.75,'界面截图备用 →',target=5,fill=SOFT,color=G)
 table_slide(s,['顺序','现场操作','一句解释'],[['查','打开《晚自习后，别回头》，切到章节或人物','查看现有作品及关联记录'],['增','新建“课堂演示作品”，新增一章','创建独立测试记录，不改示例原稿'],['改','输入正文，稍等自动保存；重命名章节','修改当前记录，再刷新检查'],['删','删除测试章节；保留原有两部示例','本机记录清理，不是远端 SQL 演示']],x=.85,y=3.3,w=11.6,h=2.65,fs=15)
 button(s,.85,6.3,3.2,'演示结束，去总结 →',target=20);caption(s,'打开在线系统后，用左侧导航切换模块；演示结束返回本页，点击“去总结”。',y=6.77)
 s=base(20,'总结与局限');cards(s,[('做成了什么','已有系统完整展示\n七类实体，六个外键\n页面与数据关系可对应'),('怎么证明','原模型 / 迁移 / 代码\n59 项专项检查\nPages 实际界面操作'),('继续改进','加强业务引用完整性\n多步骤事务与并发控制\n持续完善同步与备份')]);button(s,.95,6.17,2.2,'答疑资料 →',target=26,fill=SOFT,color=G);button(s,3.4,6.17,2.4,'完整 E-R →',target=9,fill=SOFT,color=G)
 s=base(21,'附录 A / 关键字段补充');table_slide(s,['模型','字段片段','语义'],[['User','id / email / passwordHash','主键、登录唯一、密码散列'],['User','nickname / createdAt / updatedAt','显示与审计时间'],['Novel','userId / title / cover / genre','归属、标题、封面与题材'],['Novel','wordCount / status / summary','应用维护的字数、状态和简介'],['Novel','agentPrompt / lastOpenedChapterId','作品级提示词 / 最近阅读逻辑引用']],fs=14);button(s,.85,6.4,3.5,'点击查完整 67 字段 schema ↗',url=MODEL,fill=SOFT,color=G)
 s=base(22,'附录 B / 关键字段补充');table_slide(s,['模型','字段片段','语义'],[['Chapter','id / novelId / title / content','主键、外键、标题及正文'],['Chapter','wordCount / sequence','保存字数、章序；章序索引非唯一'],['Character','id / novelId / name / role','主键、外键、姓名与定位'],['Character','avatar / personality / background','头像、性格、背景'],['Character','aliases / relationships','JSON 字符串；并非独立关系表'],['Character','firstAppearanceChapterId','业务字符串引用，当前无物理外键']],fs=14)
 s=base(23,'附录 C / 其他真实实体');table_slide(s,['模型','字段片段','讲解重点'],[['WorldSetting','novelId / category / title / content','一本小说下的分类设定'],['PlotCard','novelId / type / title / summary','卷或章节计划，正文之外的结构'],['PlotCard','volumeId / chapterId / sequence','卷、正文的业务关联及排序'],['PlotCard','status / statusMode','完成状态与自动 / 手动判断'],['Foreshadowing','novelId / title / description / status','伏笔描述与进度'],['Foreshadowing','planted*Id / resolved*Id','埋设与回收位置：逻辑引用']],fs=14);caption(s,'迁移保留 PlotCard.actNumber 历史列；当前 Prisma 不使用。模型 67 字段，迁移新建库物理列为 68。')
 s=base(24,'附录 D / 后端实现对应');table_slide(s,['动作','现有 API','对应的 SQL 语义'],[['查章节','GET /api/novels/:novelId/chapters','SELECT … WHERE novelId=? ORDER BY sequence'],['增章节','POST /api/novels/:novelId/chapters','INSERT INTO Chapter (…) VALUES (…)'],['改章节','PUT /api/chapters/:id','UPDATE Chapter SET … WHERE id=?'],['删章节','DELETE /api/chapters/:id','DELETE FROM Chapter WHERE id=?']],fs=13);button(s,.85,6.35,3.1,'后端章节路由源码 ↗',url=SOURCE+'packages/backend/src/routes/chapters.ts',fill=SOFT,color=G);caption(s,'SQL 为便于课堂理解的等价语义，非抓取的实际 Prisma SQL；归属检查在路由中完成。',y=6.78)
 s=base(25,'附录 E / 测试用例');table_slide(s,['对象','测试操作','观察结果 / 边界'],[['真实 SQLite','导入双书，重复导入、回读公开快照','不覆盖无关作品；快照去除敏感字段'],['人物接口','同书 / 跨书关系、头像和 JSON 输入','校验合法输入，拒绝跨书引用'],['Pages 初始化','已有改稿与自建作品后加载新案例','保留用户已有内容'],['Pages 页面','新增、编辑、自动保存、刷新、删除','当前浏览器持久化；无后端写入'],['未覆盖','现场实时模型、生产负载和跨设备同步','不纳入本次专项结果']],fs=14)
 s=base(26,'附录 F / 一键资料与答疑');
 targets=[('在线演示',WEB),('GitHub 仓库',REPO),('真实 Prisma 模型',MODEL),('数据库入库说明',SOURCE+'docs/updates/2026-11-03-database-backed-case.md'),('Pages 模式说明',SOURCE+'docs/updates/2026-11-01-github-pages-demo.md'),('编辑与导出说明',SOURCE+'docs/prd/editor-export-v1.0/README.md')]
 for j,(title,url) in enumerate(targets):button(s,.85+(j%3)*4.05,2.65+(j//3)*.8,3.8,title+' ↗',url=url,fill=G if j==0 else SOFT,color=WHITE if j==0 else G)
 txt(s,.85,4.55,11.6,1.55,'老师问 Pages 为什么没有数据库？ → 静态界面展示 + 数据库导出快照 + 浏览器保存。\n老师问为什么没讲所有字段？ → 保留真实模型，只挑能说明归属和 CRUD 的属性。\n老师问人物关系是表吗？ → 现有实现为 JSON 字符串，不能说已完成独立关系表。',17,INK)
 s=base(27,'附录 G / 创作检查实图');pic(s,'05-review.png',.7,2.5,9.2,3.95);txt(s,10.05,2.85,2.5,.8,'版本与检查入口',21,G,True);txt(s,10.05,3.85,2.4,2.3,'章节版本与恢复\n结构一致性检查\n人物状态时间线\nAI 核对按需调用',17,M);caption(s,'现有功能实图；截图不是已经完成一次全书 AI 复核的证明。')
 s=base(28,'附录 H / 参考创作实图');pic(s,'06-reference.png',.7,2.5,9.2,3.95);txt(s,10.05,2.85,2.5,.8,'从参考到新稿',21,G,True);txt(s,10.05,3.85,2.4,2.3,'导入参考资料\n选择范围与批次\n分析结构与文风\n确认后写独立新稿',17,M);caption(s,'此模块作为系统完整性展示，不要求课堂现场进行长文模型分析。')
 s=base(29,'附录 I / 设置与课前准备');pic(s,'07-settings.png',.7,2.5,9.2,3.95);txt(s,10.05,2.85,2.5,.8,'真实调用需配置',21,G,True);txt(s,10.05,3.85,2.4,2.3,'模型与服务地址\n不展示个人密钥\n费用估算有边界\n课堂主线不依赖 API',17,M);caption(s,'截图来自隔离浏览器，无个人 API Key；不是虚构的模型调用结果。')
 s=base(30,'附录 J / 演示操作结果备用');two_screens(s,'09-crud-update.png','10-crud-delete.png','修改章名、正文自动保存并刷新回读','删除测试章节后的页面');button(s,.95,6.42,2.5,'回到现场演示台 →',target=19,fill=SOFT,color=G);caption(s,'同代码 Pages 模式实拍；仅证明浏览器保存，不代替真实 SQLite 测试。',y=6.78)
 for sh,n in LINKS:sh.click_action.target_slide=prs.slides[n-1]
 for s in prs.slides:
  for p in s.notes_slide.notes_text_frame.paragraphs:
   for r in p.runs:r.font.name='微软雅黑';ea=E.SubElement(r._r.get_or_add_rPr(),'{http://schemas.openxmlformats.org/drawingml/2006/main}ea');ea.set('typeface','微软雅黑')
 prs.save(OUT/'NovelAgent-Pages-Defense.pptx')

def doc_base(title):
 d=Document();sec=d.sections[0];sec.page_width=Cm(21);sec.page_height=Cm(29.7);sec.top_margin=Cm(1.65);sec.bottom_margin=Cm(1.5);sec.left_margin=sec.right_margin=Cm(1.8)
 for name in ['Normal','Title','Subtitle','Heading 1','Heading 2','Heading 3','Caption']:
  st=d.styles[name];st.font.name='Arial' if name.startswith('Heading') else 'Times New Roman';st.font.size=Pt(10.5);st.paragraph_format.line_spacing=1.12;st.paragraph_format.space_after=Pt(5)
  rp=st._element.get_or_add_rPr();rf=rp.find(qn('w:rFonts'))
  if rf is None:rf=OxmlElement('w:rFonts');rp.insert(0,rf)
  for k in list(rf.attrib):
   if 'theme' in k.lower():del rf.attrib[k]
  for k,v in [('ascii',st.font.name),('hAnsi',st.font.name),('eastAsia','黑体' if name.startswith('Heading') or name=='Title' else '宋体')]:rf.set(qn('w:'+k),v)
 for name,size in [('Title',27),('Heading 1',18),('Heading 2',12),('Caption',9)]:d.styles[name].font.size=Pt(size);d.styles[name].font.color.rgb=RGBColor.from_string(G if name!='Caption' else M)
 sec.header.paragraphs[0].text='数据库 Web 应用系统设计开发  /  NovelAgent 现有系统与 Pages 展示'
 sec.header.paragraphs[0].style='Caption'
 foot=sec.footer.paragraphs[0];foot.alignment=1;foot.add_run('第 ');el=OxmlElement('w:fldSimple');el.set(qn('w:instr'),'PAGE');foot._p.append(el);foot.add_run(' 页')
 return d

def dp(d,t,style=None):return d.add_paragraph(t,style)
def dh(d,t):return d.add_heading(t,2)
def dpage(d,t):d.add_page_break();d.add_heading(t,1)
def dt(d,heads,rows,widths=None):
 t=d.add_table(rows=1,cols=len(heads));t.style='Table Grid';t.autofit=False
 if widths:
  for c,w in zip(t.columns,widths):c.width=Cm(w)
 for c,tx in zip(t.rows[0].cells,heads):c.text=str(tx);el=OxmlElement('w:shd');el.set(qn('w:fill'),SOFT);c._tc.get_or_add_tcPr().append(el)
 for rr in rows:
  for c,tx in zip(t.add_row().cells,rr):c.text=str(tx)
 for row in t.rows:
  row.height=None;row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
  for c in row.cells:
   for p in c.paragraphs:
    p.paragraph_format.line_spacing=1.0;p.paragraph_format.space_after=Pt(2);p.paragraph_format.space_before=Pt(2)
    for r in p.runs:r.font.size=Pt(8.5)
 t.rows[0]._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'));return t

def dlink(d,label,url):
 p=d.add_paragraph();h=OxmlElement('w:hyperlink');rid=p.part.relate_to(url,'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',is_external=True);h.set(qn('r:id'),rid);r=OxmlElement('w:r');rp=OxmlElement('w:rPr');f=OxmlElement('w:rFonts');f.set(qn('w:ascii'),'Arial');f.set(qn('w:hAnsi'),'Arial');f.set(qn('w:eastAsia'),'宋体');rp.append(f);color=OxmlElement('w:color');color.set(qn('w:val'),G);rp.append(color);r.append(rp);tx=OxmlElement('w:t');tx.text=label; r.append(tx);h.append(r);p._p.append(h)

def dsave(d,name):
 for para in list(d.paragraphs)+[p for t in d.tables for row in t.rows for c in row.cells for p in c.paragraphs]+[p for sec in d.sections for x in [sec.header,sec.footer] for p in x.paragraphs]:
  for r in para.runs:
   rp=r._element.get_or_add_rPr();f=rp.find(qn('w:rFonts'))
   if f is None:f=OxmlElement('w:rFonts');rp.insert(0,f)
   heading=para.style.name.startswith('Heading') or para.style.name=='Title'
   for k in list(f.attrib):
    if 'theme' in k.lower():del f.attrib[k]
   for k,v in [('ascii','Arial' if heading else 'Times New Roman'),('hAnsi','Arial' if heading else 'Times New Roman'),('eastAsia','黑体' if heading else '宋体')]:f.set(qn('w:'+k),v)
 d.save(OUT/name)

def make_report():
 d=doc_base('report');dp(d,'数据库 Web 应用软件系统\n设计开发实验报告','Title');dp(d,'NovelAgent 现有系统\n以 GitHub Pages 进行课堂展示','Subtitle');dp(d,'讲解只取重点；系统、功能与真实数据库模型保持现状。')
 dt(d,['项目','填写 / 说明'],[['姓名 / 学号','________________ / ____________________'],['班级 / 小组 / 成员','______________________________________'],['汇报时间','约 10 分钟；13 页精讲路线 + 现场操作'],['系统入口',WEB],['成果范围','30 页可点击 PPT、配套报告、讲稿、原系统测试及截图'],['实际技术','React + Express + Prisma + SQLite；Pages 为静态演示模式']],[4,13.4])
 dp(d,'本报告的数据模型、功能与测试均以现有 NovelAgent 代码为准，重点分析核心业务与实际实现。当前 Prisma 模型有 67 个标量字段；按历史迁移新建的 SQLite 另保留大纲 actNumber 一列，因此物理列总数为 68，详见附录。','Caption')
 dpage(d,'01  实验目标与要求对照')
 dp(d,'根据上传任务书，完成需求分析、中文 E-R 图、关系转换、数据字典、前后端设计、实现与测试，并通过 PPT 与现场 Web 页面展示增、删、改。本次直接使用已有 NovelAgent；只精简演讲内容，不缩减实体或重新开发另一套程序。')
 dt(d,['要求','本次对应'],[['自选 Web 系统、可结合 AI','中文小说创作工作台；现有 AI 助手为扩展'],['需求分析 / 数据字典','第 02 章需求；第 05 章重点字段；附录完整 7 表 67 字段'],['中文 E-R 图、转表','第 03、04 章；PPT 第 7～12 页'],['前后端设计与代码','第 06、07 章；现有 React、Express 路由与 Prisma 模型'],['测试与测试用例','第 08 章；原项目五组专项 59 项通过 + Pages 模式界面操作'],['现场至少演示增删改','PPT 第 19 页与演讲手册；现有 Pages 中新建、编辑、删除测试章节'],['PPT + 演示 / 录像','26 页含内外部跳转的 PPT；不宣称另外提供录屏'],['一组一份报告，1～3 人','姓名学号及实际分工由成员核实填写']],[4.5,12.9])
 dh(d,'数据库选择与证据边界');dp(d,'原项目实际采用 SQLite，任务书推荐 MySQL，不能将本项目改写成 MySQL 成果。Pages 是 GitHub 托管的静态界面，不运行 Node 后端或数据库服务。课堂的增改删展示的是同一套创作界面的浏览器持久化；数据库开发与真实落库能力由模型、迁移、后端代码及临时 SQLite 测试支撑。如果教师强制要求现场连接数据库，应另开原系统完整版或数据库证据环境，不能将 Pages 操作描述为远端 SQL 写入。')
 dpage(d,'02  需求分析与功能组织');dp(d,'用户是长篇小说作者，需要同时管理多部作品，并保持章节、人物、世界观、大纲和伏笔之间的上下文一致。系统围绕小说组织资料，AI 续写与检查作为辅助，最终稿件可编辑、回溯与导出。')
 dt(d,['编号','需求','验收观察'],[['F01','书架及小说资料','选择作品后，只显示该作品下的记录'],['F02','章节增删改查与自动保存','新建章节、修改标题正文，等待保存后刷新'],['F03','人物与关系','查看头像和档案，聚焦单人或两人关系'],['F04','大纲、世界观、伏笔','按作品组织设定与创作计划'],['F05','创作检查、版本与导出','访问已有功能入口，核对检查/导出流程'],['F06','模型与预算','按自配 API 调用；记录与费用估算有明确边界']],[1.5,5.4,10.5])
 d.add_picture(str(AS/'01-chapters.png'),width=Inches(6.55));dp(d,'图：当前仓库以 VITE_DEMO_MODE=true 运行的实际界面。截图来自本地 Pages 模式，与在线版共用创作组件；课堂通过真实线上入口操作。','Caption')
 dpage(d,'03  概念结构与中文 E-R 图');d.add_picture(str(AS/'er-original-seven.png'),width=Inches(6.65));dp(d,'一个用户可拥有多本小说；每本小说可以包含多个章节、人物、世界观条目、大纲卡片和伏笔。子项均归属唯一小说。图中省略不影响主干理解的字段，但没有删掉真实实体。')
 dh(d,'课堂讲解重点');dp(d,'用户 → 小说 → 章节 / 人物是主讲路径，其余子项只在总览中介绍用途。人物之间可以存在复杂业务关系；当前实现把这些关系放入 Character.relationships 的 JSON 字符串，而非新增人物关系表。因此人物关系画布不能直接等同于已实现的多对多关系表。')
 dh(d,'物理与逻辑关系');dp(d,'实际有六个物理外键：Novel.userId → User.id，以及 Chapter、Character、WorldSetting、PlotCard、Foreshadowing 的 novelId → Novel.id。章节/卷等其他编号字符串为业务引用，当前不受数据库外键强制。PPT 第 9、12、23 页给出区分。')
 dpage(d,'04  转表、完整性与范式分析')
 dt(d,['联系','落表方式','实际约束'],[['用户拥有小说','User.id → Novel.userId','非空归属外键，删除级联'],['小说包含章节','Novel.id → Chapter.novelId','归属外键；(novelId, sequence) 为非唯一索引'],['小说包含人物','Novel.id → Character.novelId','归属外键；姓名不全局唯一'],['小说包含设定 / 计划 / 伏笔','三个子项各有 novelId','相同的一对多转换'],['人物关系与其他章节引用','JSON / String 字段','应用语义与校验，不虚构物理外键']],[4.2,6.1,7.1])
 dh(d,'实体与参照完整性');dp(d,'id 为 String 主键，通常使用 CUID 默认生成；email 有唯一约束。各子项 @relation 指定 onDelete: Cascade，Prisma 迁移创建实际外键。role、status、type 等是 String 字段，并非数据库 enum 或普遍存在的 CHECK。sequence 字段有索引，但不自动禁止同书重复序号。')
 dh(d,'函数依赖与设计取舍');dp(d,'以 id 为标识可定位一条记录，email 也是用户候选键。分离章节、人物与设定，减少把用户昵称、书名反复复制进子项造成的更新问题。但真实项目保存 Novel.wordCount 与 Chapter.wordCount 等冗余统计，aliases / relationships 用 JSON 字符串，部分业务引用不受外键保护。因此可分析规范化思路与可控冗余，不能仅因每表有主键就声称整套物理模式严格满足第三范式。')
 dh(d,'后续改进');dp(d,'可依据业务需要拆分关系数据、增加同作品引用检查或复合约束，补充多步骤事务、并发版本控制。这里是分析建议，不算已完成能力，分析与现有 schema 保持对应。')
 dpage(d,'05  重点数据字典与数据流')
 dt(d,['数据对象','关键字段','主要说明'],[['用户 User','id / email / passwordHash','账号标识、唯一邮箱、密码散列'],['小说 Novel','id / userId / title / status','主键、拥有者、作品资料'],['章节 Chapter','id / novelId / title / content / sequence','归属、标题正文、排序'],['人物 Character','id / novelId / name / relationships','归属、姓名及 JSON 关系'],['世界观 WorldSetting','novelId / category / title / content','按小说分类整理设定'],['大纲 PlotCard','novelId / type / volumeId / chapterId','卷或章节计划及业务关联'],['伏笔 Foreshadowing','novelId / title / planted*Id / resolved*Id','埋设与回收位置、状态']],[4,6.5,6.9])
 dh(d,'需求数据字典');dt(d,['数据流','组成','去向'],[['作品资料输入','书名、封面、题材、简介','前端状态；完整版再经 API 保存'],['章节修改','章节编号、标题、HTML 正文、字数','防抖保存 → 状态 / 持久化'],['人物资料','姓名、角色、头像、关系数组','应用校验，关系落库时转 JSON 字符串'],['公开案例快照','小说与子项的白名单字段','SQLite 查询 → JSON → Pages 初始化']],[4,6.4,7])
 dh(d,'字数与顺序');dp(d,'当前系统实际保存 wordCount，并在应用逻辑中维护章节与小说的统计，示例生成脚本还有汉字计数口径。不能把它统一说成数据库查询时即时计算。sequence 从零开始排序，页面统一生成“第几章”，数据库章节标题保留纯标题。')
 dpage(d,'06  前后端设计与存储边界')
 dt(d,['环节','普通完整版','课堂 GitHub Pages'],[['界面','React + TypeScript + Zustand + Tiptap','共用创作组件与解析逻辑'],['账号','Express JWT 登录与归属判断','无后端账号服务，免登录案例'],['初始数据','通过 API 读 SQLite','导出的案例 JSON 初始化'],['正文 / 设定修改','本机状态先更新；登录后异步 API 同步','当前浏览器本机保存'],['后端与数据库','Express → Prisma → SQLite','站点不运行 Express / SQLite'],['辅助记录','部分排版、预算、版本、布局等本机保存','按相同模块在本机保存']],[3.5,6.9,7])
 dh(d,'普通保存路径');dp(d,'编辑器监听修改，约 500ms 防抖后调用 updateChapter；Zustand 维护当前状态。登录状态下通过章节 API 发出请求，Express 检查小说归属后调用 Prisma 更新，再维护小说字数等信息。由于是异步同步，页面状态变化不自动证明后端成功；测试需观察接口响应与数据库回读。')
 dh(d,'Pages 保存路径');dp(d,'VITE_DEMO_MODE=true 时使用演示命名空间，例如 novel-agent-storage-demo-v1。章节与设定保存在浏览器；历史等模块还使用 IndexedDB。刷新验证的是本机持久化。换浏览器、清理站点数据、换设备，不保证这些修改仍可读取。')
 dh(d,'真实源码入口');dlink(d,'打开：Prisma 数据库模型',MODEL);dlink(d,'打开：前端状态与同步分支',SOURCE+'packages/frontend/src/stores/novelStore.ts');dlink(d,'打开：后端章节路由',SOURCE+'packages/backend/src/routes/chapters.ts')
 dpage(d,'07  现有功能展示与 AI 边界');d.add_picture(str(AS/'02-characters.png'),width=Inches(6.55));dp(d,'人物画布使用原系统档案与关系功能；对应业务归属和人物引用。关系线调整与布局中部分信息保存于当前浏览器，不能笼统宣称所有画布操作已同步 SQLite。')
 dh(d,'大纲与世界观');dp(d,'PlotCard 统一表达卷与章节大纲，关联已写章节并管理状态；WorldSetting 按 category 分类；Foreshadowing 保存埋设和回收标记。课堂通过现有页面展示系统完整性，不逐项讲完所有字段。')
 dh(d,'AI 辅助');dp(d,'模型调用由用户配置 API，提供续写、润色、检查、参考分析等；生成内容需解析、校验与审阅。公开站点的保存文本回放不属于实时生成。现场主流程不依赖模型余额或密钥，不公开个人凭据；模型及预算模块作为加分项截图和链接保留。')
 dpage(d,'08  原系统测试与实际结果')
 labels={'database-case':'真实临时 SQLite 双书入库 / 快照','profiles':'人物资料与真实接口','demo':'Pages 初始化与数据保护','sync':'结构化内容与修改同步','editor':'编辑与多格式导出'}
 dt(d,['测试组 / 命令','验证范围','结果'],[[f'npm run test:{k}',labels[k],f"{v['pass']} 通过 / {v['fail']} 失败"] for k,v in TESTS['suites'].items()],[5.5,8,3.9]);dp(d,'五组共 59 项通过，为本次实际执行记录，不是全量系统测试，结果不代表全量回归。原始日志保存在 evidence/；数据库案例与人物接口实际创建临时 SQLite，不连接用户原数据库。')
 dt(d,['用例','操作','预期 / 实测'],[['数据库导入','双书入库、重复导入、对照快照','幂等且保留无关作品；通过'],['敏感字段','检查公开快照字段','不包含 email、passwordHash、apiKey；通过'],['人物关系','合法同书关系 / 跨书引用','合法保存，跨书被拒；通过'],['Pages 界面','新增书与章节、正文编辑、重命名、刷新、删除','本机保存与清理；独立浏览器流程通过'],['未执行范围','线上请求、实时模型、并发性能','不声称这些范围已通过']],[3.1,7.1,7.2])
 dp(d,'所有测试日志保留在 evidence/。模型、迁移和界面操作分别验证，避免用单一截图代替真实数据检查。')
 dpage(d,'09  课堂演示：使用现有 Pages')
 dlink(d,'点击打开 NovelAgent GitHub Pages',WEB)
 dt(d,['时间','现场操作','讲解重点'],[['0:00—0:25','浏览现有小说，展示章节 / 人物','数据来自导出的公开案例'],['0:25—0:55','创建“课堂演示作品”，新增一章','新增独立测试记录，不改示例正文'],['0:55—1:35','输入一小段文字，等自动保存；改章名','状态更新与本机持久化'],['1:35—2:10','刷新，回到演示作品检查文字','刷新回读不是远端数据库 UPDATE'],['2:10—2:40','删除演示章节','记录在当前浏览器中被清理'],['2:40—3:00','回到 PPT 点击“去总结”','概括关系与保存边界']],[2.5,8,6.9])
 d.add_picture(str(AS/'09-crud-update.png'),width=Inches(6.55));dp(d,'图：原系统 Pages 模式中创建记录、修改章名并刷新回读的实际截图。','Caption')
 dp(d,'PPT 所有“在线系统”按钮指向真实 Pages 首页；原应用没有通用模块深链接，模块切换由页面原有导航完成。功能页通过 PPT 内部按钮一键跳到对应截图和分析，进入网页后按提示点击原有导航。')
 dpage(d,'10  实验结论、分工与资料')
 dh(d,'结论');dp(d,'以现有 NovelAgent 完成数据库 Web 应用案例分析，需求、实体、转表、关键字段、约束、保存流程与测试能够相互对应。讲解只聚焦用户、小说、章节与人物，不改变原系统七类实体和现有能力。Pages 用于课堂展示；真实数据库能力通过同一项目模型、迁移、接口与临时库测试证明。')
 dh(d,'局限');dp(d,'当前角色关系与别名使用 JSON 字符串，部分章节/卷引用无物理外键；字数需要应用维护；异步同步、事务与并发控制仍有改进空间。上述内容属于后续改进。课堂前应使用本人电脑打开真实链接，确认网络与显示效果。')
 dh(d,'实际分工待填写');dt(d,['成员','真实任务 / 演讲部分'],[['成员一：________','________________________'],['成员二（可选）：________','________________________'],['成员三（可选）：________','________________________']],[5,12.4]);dp(d,'不得把建议分工当成真实贡献。项目及材料使用 AI 辅助整理，提交前按学校要求披露并由本人理解、核实。')
 dh(d,'参考');dp(d,'① 用户上传的《实验13_17-18 数据库Web应用软件系统设计开发.docx》。② 当前仓库 Prisma schema、迁移、前后端与专项测试。③ 项目 Pages、入库说明及专项设计文档。')
 dlink(d,'项目 GitHub 仓库',REPO);dlink(d,'Pages 模式说明',SOURCE+'docs/updates/2026-11-01-github-pages-demo.md');dlink(d,'数据库导出案例说明',SOURCE+'docs/updates/2026-11-03-database-backed-case.md')
 dp(d,'Office 检查：显式设置宋体 / 黑体，PPT 使用微软雅黑；在 Linux LibreOffice 以 Noto CJK 替代字体生成 PDF 并检查。未在 Windows Microsoft Word / PowerPoint 实机验证，提交前请在本人电脑核对；PDF 为备用。','Caption')
 for name,fields in MODELS.items():
  dpage(d,'附录 · '+ZH[name]+'表 '+name)
  rows=[]
  for f in fields:
   definition=f['definition'];rules=[]
   if '@id' in definition:rules.append('主键')
   if '@unique' in definition:rules.append('唯一')
   rules.append('可空' if f['optional'] else '必填')
   default=re.search(r'@default\((.*)\)',definition)
   if default:rules.append('默认 '+default.group(1))
   if '@updatedAt' in definition:rules.append('Prisma 自动更新时间')
   if f['name']=='novelId' or name=='Novel' and f['name']=='userId':rules.append('物理外键')
   rows.append([f['name'],f['type']+('?' if f['optional'] else ''),'；'.join(rules),DICT.get(f['name'],'见模型定义')])
  dt(d,['字段','Prisma 类型','实际约束 / 默认','含义'],rows,[3.8,2.6,5.1,5.9]);dp(d,'表内列出所有标量字段；集合关系不是额外物理列。SQLite 类型与外键以 evidence/actual-schema.sql 和 sqlite-metadata.json 复核。')
  if name=='Character':dp(d,'relationships/aliases 是 String 存储的 JSON；同书关系由 characterProfileData 与人物 API 校验，并未形成独立关系表。')
  if name=='PlotCard':dp(d,'迁移遗留列：actNumber INTEGER NOT NULL DEFAULT 1。当前 Prisma schema 已不使用此字段，但现有迁移没有删除它；按迁移新建库会有 68 个物理列。上表与 67 字段统计对应当前模型，不把历史列静默算成新功能。')
  if name=='Chapter':dp(d,'(novelId, sequence) 在 Prisma 中使用 @@index 而非 @@unique；本材料不声称数据库禁止重复章序。')
  dlink(d,'点击查看原项目模型定义',MODEL)
 dsave(d,'NovelAgent-Report.docx')

def make_handbook():
 d=doc_base('guide');dp(d,'10 分钟讲解路线与现场操作','Title');dp(d,'基于现有 NovelAgent 与 GitHub Pages，精讲核心设计并现场操作。','Subtitle')
 dt(d,['顺序','PPT 页','时间'],[[str(j+1),f'{n:02}  {TITLES[n-1]}',f'{t} 秒'] for j,(n,t) in enumerate(zip(MAIN,TIMES))],[1.2,13.1,3.1]);dp(d,'合计约 10 分钟。正文 20 页、附录 10 页都保留，放映时按“下一讲”按钮只走上表路线；用方向键会经过全部页面。按钮在放映模式直接点击，编辑模式可用 Ctrl+单击。网站按钮打开实际 Pages 首页，浏览器里继续使用原导航。')
 dlink(d,'课前先打开并检查在线系统',WEB)
 for start in [0,4,8]:
  indices=MAIN[start:start+4];dpage(d,'逐页讲稿 / '+','.join(map(str,indices))+' 页')
  for n in indices:dh(d,f'第 {n} 页 · {TITLES[n-1]}');dp(d,NOTES[n-1])
 # Conclusion is the thirteenth item, intentionally separate from the demonstration notes.
 dpage(d,'现场演示操作卡 / 第 19 页暂停 PPT')
 dt(d,['操作','页面动作','讲解话术'],[['查询','打开示例小说，查看章节 / 人物','“当前是原系统的 Pages 演示模式。”'],['新增','左侧＋输入“课堂演示作品”，Enter；点章节导航，目录＋输入标题','“新记录属于这本小说，测试内容与示例分开。”'],['修改','正文输入一句话；等待约 1 秒；用目录铅笔重命名章名','“编辑器防抖后更新本机状态。”'],['刷新','刷新后回到测试作品，检查正文和标题','“这是浏览器持久化，不是远程 SQL 写入。”'],['删除','点击测试章节垃圾桶并确认','“只清理自己的测试记录，不改公开小说。”'],['结束','返回放映窗口，点“演示结束，去总结”','“数据模型与保存边界已经对应起来。”']],[2,9.4,6])
 dp(d,'不要删除两部示例原作，不在课堂调用个人模型 API。若页面打不开，回到 PPT 第 5、6、16 页展示实图，明确说明是备用截图，不能说成当前在线操作。原系统没有可靠的模块深链接，PPT 不提供虚假的直达参数。')
 dpage(d,'最后总结与老师常见问题');dh(d,'第 20 页总结');dp(d,NOTES[19])
 for q,a in [('为什么 Pages 没有数据库服务？','GitHub Pages 是静态托管；使用由原系统数据库导出的白名单快照，浏览器修改本机保存。数据库层另有模型、迁移和真实临时库测试证明。'),('七类实体为什么只讲四类？','只取用户、小说、章节、人物说明主干，完整 E-R 和 67 字段字典仍在 PPT / Word 中，系统没有删功能。'),('人物关系是独立表吗？','不是，现有 Character.relationships 用 JSON 字符串保存；画布展示的关系不等同于数据库已规范化为关系表。'),('是否全部满足第三范式？','不能这样笼统保证。现有系统有字数冗余和 JSON 字段；可以解释拆表减少重复与工程取舍。'),('怎么证明数据库真的工作？','展示原项目五组专项 59 项通过的日志；其中数据库入库和人物接口使用真实临时 SQLite，不拿 Pages 的刷新替代数据库回读。'),('为什么不是 MySQL？','现有项目本来使用 SQLite，本次不替换系统或虚构迁移。若老师强制指定 MySQL，需要另行适配与复测。')]:dh(d,q);dp(d,a)
 dp(d,'交付前：填写报告封面与 PPT 首页；在自己的 Windows Office 打开核对；实际访问 Pages 并练一遍。若有组员，填写真实分工。')
 dsave(d,'NovelAgent-Talk-Guide.docx')

if __name__=='__main__':
 assert (ROOT/'evidence/pages-browser.json').exists(),'请先完成原系统 Pages 模式截图与验证'
 draw_png_er();make_deck();make_report();make_handbook();print('Generated 30-slide clickable original-system deck and Word materials:',OUT)
