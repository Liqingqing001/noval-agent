"""Build editable Chinese Word/PPT course materials; run with python-docx/python-pptx/Pillow."""
from pathlib import Path
import json, sys, math, os
from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from pptx import Presentation
from pptx.util import Inches as PI, Pt as PP
from pptx.dml.color import RGBColor as PC
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR
from lxml import etree
ROOT=Path(__file__).resolve().parents[1]
AS=ROOT/'assets'; OUT=Path(os.environ.get('COURSE_OUTPUT_DIR',str(ROOT/'output')));OUT.mkdir(parents=True,exist_ok=True)
GREEN='32664E';INK='233C32';MUTED='75857A';BG='F7F8F3';SOFT='EAF1EB'
FONT='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
BOLD='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'

def diagram():
 im=Image.new('RGB',(1900,1020),'#f7f8f3');d=ImageDraw.Draw(im)
 def font(n,b=False):return ImageFont.truetype(BOLD if b else FONT,n)
 def box(x,y,w,title,rows):
  h=96+len(rows)*49;d.rounded_rectangle((x,y,x+w,y+h),radius=16,fill='white',outline='#bcd0bf',width=3)
  d.rounded_rectangle((x,y,x+w,y+78),radius=16,fill='#32664e');d.rectangle((x,y+40,x+w,y+78),fill='#32664e');d.text((x+24,y+16),title,font=font(31,True),fill='white')
  for i,t in enumerate(rows):d.text((x+24,y+96+i*49),t,font=font(25),fill='#233c32')
  return h
 d.text((65,35),'小说创作管理系统 · 中文 E-R 图',font=font(40,True),fill='#233c32')
 d.text((65,98),'四个实体 · 三组一对多联系 · 主外键保持归属关系',font=font(23),fill='#75857a')
 box(65,360,370,'用户',['用户编号（主键）','邮箱（唯一）','密码散列、昵称','注册时间'])
 box(680,360,420,'小说',['小说编号（主键）','用户编号（外键）','书名、类型、简介','状态、创建及更新时间'])
 box(1410,180,425,'章节',['章节编号（主键）','小说编号（外键）','标题、正文、章序','更新时间'])
 box(1410,620,425,'人物',['人物编号（主键）','小说编号（外键）','姓名、定位、介绍'])
 d.line([(435,480),(680,480)],fill='#32664e',width=4);d.text((452,424),'一',font=font(25),fill='#32664e');d.text((624,424),'多',font=font(25),fill='#32664e');d.text((513,495),'拥有',font=font(25),fill='#233c32')
 for y,label in [(315,'包含'),(730,'设定')]:
  d.line([(1100,480),(1220,480),(1220,y),(1410,y)],fill='#32664e',width=4);d.text((1120,440),'一',font=font(25),fill='#32664e');d.text((1352,y-48),'多',font=font(25),fill='#32664e');d.text((1250,y+12),label,font=font(25),fill='#233c32')
 d.text((65,926),'删除小说 → 同时删除其章节与人物；邮箱不可重复；同书章序不可重复。',font=font(25),fill='#32664e')
 im.save(AS/'er-cn.png')
 # architecture
 im=Image.new('RGB',(1900,640),'#f7f8f3');d=ImageDraw.Draw(im)
 for x,title,body in [(55,'浏览器界面',['登录 / 书架','章节编辑 / 人物卡片','HTML + CSS + JavaScript']),(715,'HTTP 后端',['登录验证 / 归属校验','输入检查 / 参数化查询','Node.js 内置 HTTP']),(1375,'关系数据库',['用户、小说','章节、人物','SQLite 本地持久化'])]:
  d.rounded_rectangle((x,130,x+470,490),radius=18,fill='white',outline='#bcd0bf',width=3);d.text((x+28,170),title,font=font(37,True),fill='#32664e')
  for i,t in enumerate(body):d.text((x+28,260+i*58),t,font=font(25),fill='#233c32')
 for x,label in [(540,'JSON / HTTP'),(1200,'SQL + 参数')]:
  d.line((x,320,x+155,320),fill='#32664e',width=5);d.polygon([(x+155,320),(x+140,308),(x+140,332)],fill='#32664e');d.text((x-5,260),label,font=font(21),fill='#75857a')
 d.text((65,555),'页面提交 → 校验 → 写入数据库 → 查询回读 → 更新界面',font=font(30,True),fill='#32664e');im.save(AS/'architecture.png')

def setup_doc(title):
 doc=Document();sec=doc.sections[0];sec.page_width=Cm(21);sec.page_height=Cm(29.7);sec.top_margin=Cm(1.65);sec.bottom_margin=Cm(1.5);sec.left_margin=Cm(1.8);sec.right_margin=Cm(1.8)
 for name in ['Normal','Body Text','Caption','Title','Subtitle','Heading 1','Heading 2','Heading 3']:
  s=doc.styles[name];s.font.name='Times New Roman';s.font.size=Pt(10.5 if name in ['Normal','Body Text'] else 10)
  rpr=s._element.get_or_add_rPr();f=rpr.find(qn('w:rFonts'))
  if f is None:f=OxmlElement('w:rFonts');rpr.insert(0,f)
  for k,v in [('ascii','Arial' if name.startswith('Heading') or name=='Title' else 'Times New Roman'),('hAnsi','Arial' if name.startswith('Heading') or name=='Title' else 'Times New Roman'),('eastAsia','黑体' if name.startswith('Heading') or name=='Title' else '宋体')]:f.set(qn('w:'+k),v)
  s.paragraph_format.line_spacing=1.15;s.paragraph_format.space_after=Pt(5)
 for name,size in [('Title',28),('Heading 1',19),('Heading 2',13),('Heading 3',11)]:doc.styles[name].font.size=Pt(size);doc.styles[name].font.color.rgb=RGBColor.from_string(GREEN)
 header=sec.header.paragraphs[0];header.text='数据库 Web 应用软件系统设计开发  /  NovelAgent 课程简化版';header.style='Caption'
 footer=sec.footer.paragraphs[0];footer.alignment=WD_ALIGN_PARAGRAPH.CENTER;footer.add_run('第 ');f=OxmlElement('w:fldSimple');f.set(qn('w:instr'),'PAGE');footer._p.append(f);footer.add_run(' 页')
 return doc

def p(doc,text,style=None):return doc.add_paragraph(text,style)
def h(doc,text):return doc.add_heading(text,2)
def table(doc,heads,rows,widths=None):
 t=doc.add_table(rows=1,cols=len(heads));t.style='Table Grid';t.autofit=False
 for cell,tx in zip(t.rows[0].cells,heads):cell.text=str(tx);shade=OxmlElement('w:shd');shade.set(qn('w:fill'),SOFT);cell._tc.get_or_add_tcPr().append(shade)
 for row in rows:
  cells=t.add_row().cells
  for c,v in zip(cells,row):c.text=str(v)
 for r in t.rows:
  r.height=None
  trpr=r._tr.get_or_add_trPr();el=OxmlElement('w:cantSplit');trpr.append(el)
  for c in r.cells:
   for para in c.paragraphs:
    para.paragraph_format.space_after=Pt(2);para.paragraph_format.space_before=Pt(2);para.paragraph_format.line_spacing=1.0
    for run in para.runs:run.font.size=Pt(8.5)
  if widths:
   for c,w in zip(r.cells,widths):c.width=Cm(w)
 repeat=OxmlElement('w:tblHeader');t.rows[0]._tr.get_or_add_trPr().append(repeat)
 return t

def page(doc,title):doc.add_page_break();doc.add_heading(title,1)
def picture(doc,name,width=6.55):doc.add_picture(str(AS/name),width=Inches(width))
def finalize(doc,path):
 # Explicit font references on every run, including tables and header/footer.
 paragraphs=list(doc.paragraphs)
 for t in doc.tables:
  for row in t.rows:
   for c in row.cells:paragraphs.extend(c.paragraphs)
 for sec in doc.sections:paragraphs+=list(sec.header.paragraphs)+list(sec.footer.paragraphs)
 for para in paragraphs:
  head=para.style.name.startswith('Heading') or para.style.name=='Title'
  for r in para.runs:
   f=r._element.get_or_add_rPr().find(qn('w:rFonts'))
   if f is None:f=OxmlElement('w:rFonts');r._element.rPr.insert(0,f)
   for k in list(f.attrib):
    if 'theme' in k.lower():del f.attrib[k]
   for k,v in [('ascii','Arial' if head else 'Times New Roman'),('hAnsi','Arial' if head else 'Times New Roman'),('eastAsia','黑体' if head else '宋体')]:f.set(qn('w:'+k),v)
 doc.save(path)

FIELDS={
'app_user':('用户表',[('id','INTEGER','主键，自增式分配','用户编号'),('email','TEXT','非空、唯一、3～120 字符','登录邮箱，后台统一小写'),('password_hash','TEXT','非空','随机盐与 scrypt 散列，禁止明文'),('nickname','TEXT','非空、1～30 字符','显示昵称'),('created_at','TEXT','非空、默认当前 UTC 时间','ISO 8601 注册时间')]),
'novel':('小说表',[('id','INTEGER','主键','小说编号'),('user_id','INTEGER','非空、外键','所属用户；删除用户时级联删除'),('title','TEXT','非空、1～100 字符','书名，可与其他书重名'),('genre','TEXT','非空、默认空串、≤30','类型，可不填'),('summary','TEXT','非空、默认空串、≤2000','简介，可不填'),('status','TEXT','非空、默认 draft、CHECK','draft / writing / completed'),('created_at','TEXT','非空、默认当前 UTC 时间','创建时间'),('updated_at','TEXT','非空、默认当前 UTC 时间','应用在修改及子项变化时维护')]),
'chapter':('章节表',[('id','INTEGER','主键','章节编号'),('novel_id','INTEGER','非空、外键','所属小说；级联删除'),('title','TEXT','非空、1～100 字符','章节标题'),('content','TEXT','非空、默认空串、≤50000','纯文本正文'),('sequence','INTEGER','非空、>0','同小说内唯一；新增时取最大值+1'),('updated_at','TEXT','非空、默认当前 UTC 时间','应用保存时更新')]),
'story_character':('人物表',[('id','INTEGER','主键','人物编号'),('novel_id','INTEGER','非空、外键','所属小说；级联删除'),('name','TEXT','非空、1～30 字符','人物姓名，允许重名'),('role','TEXT','非空、默认 supporting、CHECK','protagonist / supporting / minor'),('description','TEXT','非空、默认空串、≤2000','人物介绍，可不填')])}

def report():
 doc=setup_doc('报告');p(doc,'人工智能学院 · 综合性必做实验','Subtitle');p(doc,'数据库 Web 应用\n软件系统设计开发','Title');p(doc,'NovelAgent 小说创作管理系统\n课程简化版：山海书房','Subtitle');p(doc,'从一本小说出发，讲清四张表的设计与增删改查。')
 doc.add_paragraph('\n')
 table(doc,['项目','填写内容'],[['课程 / 实验','实验13（17—18） 数据库 Web 应用软件系统设计开发'],['姓名 / 学号','________________ / ____________________'],['班级 / 小组','________________ / ____________________'],['组长及组员（1～3 人）','______________________________________'],['提交日期','________________']],[5,12])
 p(doc,'成果范围：独立简化版源码、中文 E-R 图、关系模式、24 字段数据字典、前后端设计、32 项检查记录、答辩 PPT 与现场演示讲稿。')
 p(doc,'说明：个人信息与实际分工须由提交者核实填写。本报告描述的是本次课程简化版，不将原系统全部能力计为本次实现。','Caption')
 page(doc,'01  实验目标与要求对照')
 p(doc,'本实验以已有小说创作系统为业务背景，完成一个能够在浏览器中使用的数据库 Web 应用。目标不是复刻复杂的 AI 产品，而是展示“需求—数据建模—前后端实现—测试—现场演示”的完整闭环。')
 table(doc,['老师要求','本成果对应位置'],[['选题：Web 应用，允许自选题','小说创作管理；使用浏览器访问，不是桌面 GUI'],['需求分析及数据字典','第 02、03 章：范围、规则、数据流；第 06、07 章：字段字典'],['中文 E-R 图、转表、完整性','第 05 章：中文实体及关系、关系模式、键与依赖'],['前后端设计与代码','第 04、08、09 章及 source/ 源码'],['测试与测试用例','第 11～13 章；32 项实际检查及浏览器验证'],['现场展示数据增、删、改','第 14 章及《答辩讲稿与演示手册》'],['PPT + 现场演示或录像','12 页 PPT；可运行本地程序与逐步操作脚本'],['1～3 人一组、组长提交一份报告','封面待填写；第 15 章提供建议分工，不虚构人员贡献']],[5,12])
 h(doc,'数据库选择说明')
 p(doc,'任务书推荐 MySQL，设备示例列有 MySQL 或 openGauss/PostgreSQL。本成果为降低课堂安装成本，实际采用 SQLite，由 Node.js 内置模块直接访问；这不是 MySQL 实现。若授课教师明确限定数据库品种，应先迁移并重新验证，再提交为指定数据库版本。本版的实际运行和测试结论仅对应 SQLite。')
 h(doc,'演讲主线')
 p(doc,'“一个用户可以写多本小说，一本小说有多个章节和人物。页面上的每次保存，最终都变成数据库中的一条记录变化。” 先解释这句话，再讲四张表，最后做增删改演示。')
 page(doc,'02  需求分析与系统边界')
 h(doc,'2.1 使用场景')
 p(doc,'小说作者需要同时管理书名简介、章节正文和人物设定。如果仅用多个文本文件，作品之间容易混淆，章节顺序与人物归属也不清晰。本系统将这些数据按“用户—小说—子项”组织，支持登录后集中维护。')
 table(doc,['编号','功能需求','验收条件'],[['FR01','注册、登录、退出','密码正确才能登录；退出后原会话失效'],['FR02','小说管理','可新增、查询、编辑及删除自己名下的小说'],['FR03','章节管理','为当前小说增删章节，修改标题与正文，刷新后保留'],['FR04','人物管理','为当前小说增删改查人物及定位、介绍'],['FR05','归属隔离','用户不能操作其他用户的小说或子项'],['FR06','关联清理与统计','删除小说时级联清理子项；显示章节数和字数']],[1.5,5.3,10.2])
 h(doc,'2.2 本次简化')
 p(doc,'保留用户、小说、章节、人物四类实体。暂不纳入世界观、大纲、伏笔、人物关系图、发布渠道、模型配置、对话记录、多端同步与版本历史；正文采用纯文本。AI 可作为开发辅助，但本程序没有接入大模型，因此不把 AI 生成列为已实现功能。')
 h(doc,'2.3 非功能需求')
 p(doc,'本机离线运行；无第三方 npm 依赖；中文界面；写入文件数据库；错误提示可读；使用密码散列、参数化查询和后端归属检查。满足单人课堂演示，不宣称面向高并发或生产部署。')
 h(doc,'2.4 与原系统的区别')
 p(doc,'原系统是 React + Express + Prisma + SQLite 的多模块项目，现有 Prisma 模型有 7 类主要实体。本版沿用其小说管理业务与绿色视觉方向，另建 4 表物理模式及轻量前后端，二者不是同一套数据库，也不共享账号与内容。')
 page(doc,'03  需求数据字典与业务规则')
 table(doc,['数据项 / 数据流','组成与用途','约束 / 来源去向'],[['注册资料','邮箱、密码、昵称','浏览器 → 后端；邮箱格式正确；密码 8～128 字符'],['登录资料','邮箱、密码','后端验证散列；成功创建临时会话'],['小说资料','书名、类型、简介、状态','用户输入 → novel；必须属于当前用户'],['章节资料','章节标题、纯文本正文','用户输入 → chapter；自动分配章序'],['人物资料','姓名、定位、介绍','用户输入 → story_character；归属当前小说'],['书架列表','本人小说、章节数、字数','数据库查询 → JSON → 页面'],['删除指令','当前用户会话、小说或子项编号','确认后提交 → 校验归属 → DELETE'],['界面消息','成功结果或 error 字段','后台 → 浏览器提示；不显示内部堆栈']],[3.1,6.1,7.8])
 h(doc,'关键业务规则')
 p(doc,'BR01：邮箱唯一，后台将邮箱转为小写。BR02：一个用户可以有零到多本小说；每本小说必须且只属于一个用户。BR03：每个章节、人物必须属于一本小说。BR04：同一小说内章序唯一且大于零；删除后可以出现序号间隙，界面按顺序重新显示章号。')
 p(doc,'BR05：删除小说会删除其全部章节与人物，界面先提示确认。BR06：书名和姓名不要求全局唯一。BR07：字数按去掉换行符后的 Unicode 字符数统计，包含标点和空格，不等同于中文分词数；统计时计算，不重复存储。BR08：类型和简介、人物介绍允许空串。')
 h(doc,'输入长度与状态字典')
 p(doc,'书名/章节标题 1～100 字符；昵称/人物名 1～30；类型最多 30；简介/人物介绍最多 2000；正文最多 50000。小说状态为草稿 draft、创作中 writing、已完成 completed；人物定位为主角 protagonist、配角 supporting、其他人物 minor。')
 p(doc,'前端 maxlength 与后台长度校验主要按 JavaScript 字符串长度，SQLite length 按 Unicode 字符计数；含补充平面字符时前端可能更早达到限制，本课题以普通中文文本演示。')
 page(doc,'04  总体设计与数据流')
 picture(doc,'architecture.png')
 h(doc,'4.1 分层与职责')
 p(doc,'表示层由 HTML、CSS 和 JavaScript 完成，负责表单、书架、章节编辑及人物卡片。服务层由 Node.js 内置 HTTP 模块实现，负责解析 JSON、识别会话、校验输入与归属、执行参数化 SQL。存储层使用 SQLite 文件，负责主键、外键、唯一性和 CHECK 约束。')
 h(doc,'4.2 一次章节保存的路径')
 p(doc,'用户编辑标题和正文 → 点击保存章节 → 浏览器 PUT /api/novels/:n/chapters/:id → 后端检查会话和小说归属 → 验证标题与长度 → UPDATE chapter → 更新小说更新时间 → 返回成功 → 页面重新查询并展示。刷新浏览器会重新从数据库读取。')
 h(doc,'4.3 简化的代价')
 p(doc,'接口与页面同源，省略跨域配置。会话保存在进程内存，重启服务后重新登录；业务数据保存在磁盘，不因重启丢失。SQLite 是同一进程访问的文件数据库，不是独立数据库服务器。没有引入缓存、消息队列与微服务，便于解释和排错。')
 h(doc,'4.4 文件职责')
 table(doc,['文件','职责'],[['source/server.mjs','HTTP 路由、认证、归属、SQL 与初始化'],['source/schema.sql','4 表、外键、唯一性、CHECK 和索引'],['source/public/index.html / style.css / app.js','页面结构、绿色样式、交互与 fetch'],['source/test.mjs / inspect-db.mjs','自动检查 / 安全地查看四张表']],[7,10])
 page(doc,'05  概念结构、E-R 图与转表')
 picture(doc,'er-cn.png')
 h(doc,'5.1 从实体联系转换为关系表')
 p(doc,'用户（用户编号，邮箱，密码散列，昵称，注册时间）；小说（小说编号，用户编号，书名，类型，简介，状态，创建时间，更新时间）；章节（章节编号，小说编号，标题，正文，章序，更新时间）；人物（人物编号，小说编号，姓名，定位，介绍）。')
 p(doc,'每个实体转为一张表，实体编号转为主键；一对多联系将“一方”主键放在“多方”作为外键，因此 novel.user_id → app_user.id，chapter.novel_id → novel.id，story_character.novel_id → novel.id。没有多对多联系，不需要中间表。')
 h(doc,'5.2 完整性与函数依赖')
 p(doc,'实体完整性：各表 INTEGER PRIMARY KEY 标识唯一记录。参照完整性：三个归属外键使用 ON DELETE CASCADE，并显式开启 PRAGMA foreign_keys=ON。用户定义完整性：邮箱 UNIQUE；同书 (novel_id, sequence) UNIQUE；状态、非空、长度和序号 CHECK。')
 p(doc,'app_user 中 id、email 均可决定其余属性；novel、story_character 中 id 决定其余属性；chapter 中 id 及候选键 (novel_id, sequence) 决定标题、正文与更新时间。不把用户昵称重复写到小说，也不把书名重复写到章节，减少传递依赖和更新异常。字数按查询计算，避免额外存储派生属性；在本课题给定依赖假设下，四表按第三范式组织。')
 page(doc,'06  数据字典：用户与小说')
 for key in ['app_user','novel']:
  title,rows=FIELDS[key];h(doc,title+'  '+key);table(doc,['字段','类型','约束 / 默认','含义'],rows,[3.2,1.7,5.1,7])
 h(doc,'索引与存储说明')
 p(doc,'邮箱唯一约束为登录查询建立唯一索引。idx_novel_user 加速当前用户书架查询。INTEGER PRIMARY KEY 是 SQLite 行标识的别名，无需额外 AUTOINCREMENT；删除后编号可能重用，编号仅作内部标识，不用作业务流水号。')
 p(doc,'时间以 UTC ISO 8601 字符串保存；不是 SQL TIMESTAMP 类型。表结构的默认值只作用于新增，更新时间由后端在保存时主动维护。SQLite 的 TEXT 不等同于 MySQL VARCHAR，长度限制通过 CHECK 实现。')
 page(doc,'07  数据字典：章节与人物')
 for key in ['chapter','story_character']:
  title,rows=FIELDS[key];h(doc,title+'  '+key);table(doc,['字段','类型','约束 / 默认','含义'],rows,[3.2,1.7,5.1,7])
 h(doc,'关系与索引')
 p(doc,'章节联合唯一约束 (novel_id, sequence) 同时服务按小说筛选、按章序查询。idx_character_novel 用于小说下人物列表。不把同一书的所有章节拼进一个字段，也不把人物列表保存成 JSON 数组，保证每条记录可独立增删改查。')
 h(doc,'为什么字典没有 word_count')
 p(doc,'字数是正文可计算的结果：length(replace(replace(content, char(10), \'\'), char(13), \'\'))。查询别名 word_count 是接口返回值，不是数据表字段。小说章节数使用 COUNT，字数使用子查询 SUM；两个一对多子表不同时直接连接，避免统计倍增。')
 p(doc,'本报告数据字典共 4 表、24 字段，与 source/schema.sql 及 evidence/schema-metadata.json 一致。')
 page(doc,'08  后端接口与安全设计')
 table(doc,['方法与接口','用途','主要检查'],[['POST /api/register、/api/login','注册 / 登录','邮箱、密码；重复邮箱返回 409'],['GET /api/me；POST /api/logout','当前账号 / 退出','会话存在且未过期'],['GET、POST /api/novels','书架 / 新增小说','只查询当前用户'],['GET、PUT、DELETE /api/novels/:n','明细 / 修改 / 删除小说','id 与 user_id 联合归属判断'],['POST /api/novels/:n/chapters','新增章节','小说归属；自动分配序号'],['PUT、DELETE /api/novels/:n/chapters/:id','修改 / 删除章节','子项同时匹配 id 和 novel_id'],['POST /api/novels/:n/characters','新增人物','小说归属、姓名和角色枚举'],['PUT、DELETE /api/novels/:n/characters/:id','修改 / 删除人物','子项归属及字段校验']],[8,3.6,5.4])
 h(doc,'8.1 认证与授权区别')
 p(doc,'认证回答“你是谁”：用随机盐 scrypt 验证密码，成功后创建随机会话标识，8 小时有效，通过 HttpOnly、SameSite=Strict cookie 传递。授权回答“你能操作什么”：每次访问小说都检查 user_id，子项还检查 novel_id。不能仅靠前端隐藏别人的书。')
 h(doc,'8.2 SQL 与错误处理')
 p(doc,'所有用户输入通过 SQL 位置参数绑定；动态表名仅从 chapters/characters 两个固定值选择。401 表示未登录；404 表示记录不存在或不属于当前用户；400 表示输入无效；500 返回通用错误，不泄露内部堆栈。拒绝跨站修改请求并限制 JSON 请求体大小。')
 p(doc,'课堂局限：无登录限流、无 HTTPS、会话不持久化，SQLite 同步操作阻塞事件循环；不将这些基础措施等同于生产级安全设计。')
 page(doc,'09  前端设计与实际界面')
 picture(doc,'02-workspace.png')
 p(doc,'图：真实浏览器访问课程版后端，读取 SQLite 中的《山海来信》。界面为本次简化版，并非原系统截图。','Caption')
 h(doc,'界面布局与交互')
 p(doc,'左侧书架选择小说；中间目录选择章节；右侧纸张区编辑正文。人物设定通过顶部标签切换。小说信息、人物信息使用弹窗表单；危险删除先确认，尤其提示级联删除章节和人物。正文使用明确的“保存章节”按钮，不宣称自动保存。')
 h(doc,'状态与数据来源')
 p(doc,'初始列表由 GET 接口加载。每次保存成功后重新查询，避免只修改界面却不落库。页面刷新后仍从数据库读取数据；书架选中项不跨刷新记忆。标签中显示的字数按去换行后的字符数计算。')
 p(doc,'HTML 注入防护：从后台得到的书名、章节名、人物介绍在拼接 HTML 前做转义；正文以 textarea.value 赋值。此处理避免本演示路径中将输入解释成标签，但不宣称覆盖所有 Web 安全攻击。')
 page(doc,'10  数据库开发与关键实现')
 h(doc,'10.1 参数化新增、修改与查询')
 for line in ['INSERT INTO novel(user_id,title,genre,summary,status) VALUES(?,?,?,?,?);','UPDATE chapter SET title=?,content=?,updated_at=? WHERE id=? AND novel_id=?;','SELECT * FROM novel WHERE id=? AND user_id=?;']:
  p(doc,line,'Caption')
 p(doc,'执行时将当前用户编号、表单字段和记录编号作为独立参数绑定，不将文本直接拼进 SQL。服务器先验证归属，再进行写入。')
 h(doc,'10.2 级联删除')
 p(doc,'在 chapter 与 story_character 中使用 REFERENCES novel(id) ON DELETE CASCADE。调用 DELETE FROM novel WHERE id=? 时，SQLite 在该语句的事务中一并清理子项，避免孤立记录。启用外键约束是必要条件；仅在文档写外键、运行时关闭约束是不够的。')
 h(doc,'10.3 分组统计与连接查询')
 p(doc,'SELECT n.id,n.title,count(c.id) AS chapter_count FROM novel n LEFT JOIN chapter c ON c.novel_id=n.id WHERE n.user_id=? GROUP BY n.id,n.title;','Caption')
 p(doc,'LEFT JOIN 让零章节小说也显示；COUNT(c.id) 不把空连接行误计为 1。章节数与人物数不在一张直接多表连接结果里同时计数，避免一个小说的 2 章 × 3 人物产生 6 行而误计。')
 h(doc,'10.4 事务边界与已知限制')
 p(doc,'初始化示例数据使用显式 BEGIN/COMMIT，异常时 ROLLBACK；级联删除在单条语句内完成。一般保存“章节内容”和“小说更新时间”为两个顺序语句，尚未统一事务；极端失败时统计排序时间可能滞后，但正文已保存。课堂版不宣称解决并发编辑冲突与跨步骤原子性，扩展时应引入事务和版本控制。')
 h(doc,'源码入口')
 p(doc,'完整建表：source/schema.sql。完整后端：source/server.mjs。查询练习：source/queries.sql。现场可以用 node inspect-db.mjs 查看用户、小说、章节、人物的实际记录，不显示密码散列。')
 page(doc,'11  测试设计与用例（一）')
 p(doc,'采用 HTTP + 真实 SQLite 集成检查，并对外键、唯一性及 CHECK 直接构造反例。每次测试新建内存库；持久化用例另外使用临时文件，验证后清理。测试不是连接到用户原系统数据库。')
 rows=[['T01','打开 /','200，页面包含山海书房'],['T02','不带会话 GET /api/novels','401'],['T03','正确邮箱、错误密码登录','401'],['T04','正确教学账号登录','200，返回会话 cookie'],['T05','新邮箱、强度合格密码注册','201，不返回密码散列'],['T06','重复邮箱注册','409'],['T07','密码为 123 注册','400'],['T08','填写书名等新增小说','201，取得编号'],['T09','查询书架列表','包含新增小说'],['T10','修改书名与简介','200，数据库回读为新值'],['T11','书名仅含空格','400，不创建记录'],['T12','小说状态 unknown','400'],['T13','为新小说新增第一章','201，sequence=1'],['T14','修改标题、正文为“山海来信\\n”','200，查询标题及字数 4'],['T15','空标题新增章节','400'],['T16','新增林溪主角记录','201，取得人物编号']]
 table(doc,['编号','输入 / 操作','预期结果（实测均通过）'],rows,[1.3,8.4,7.3])
 p(doc,'本次实测结果由 source/test.mjs 自动生成，原始记录保存在 evidence/api-test-results.json。编号与脚本一致。','Caption')
 page(doc,'12  测试设计与用例（二）')
 rows=[['T17','修改人物介绍和定位','200，数据库回读新值'],['T18','人物定位 bad','400'],['T19','新注册用户查询书架','空列表，不含他人小说'],['T20','乙用户查询甲小说','404'],['T21','乙用户修改甲章节','404'],['T22','乙用户删除甲小说','404'],['T23','删除不存在的章节','404'],['T24','书名含单引号和 SQL 片段','作为普通文本保存，表仍存在'],['T25','直接插入不存在的小说外键','FOREIGN KEY 约束拒绝'],['T26','同一本书插入重复章序','UNIQUE 约束拒绝'],['T27','直接将状态更新为 bad','CHECK 约束拒绝'],['T28','删除人物后回读','无该记录'],['T29','删除章节后回读','无该记录'],['T30','删除有子项的小说','该小说、关联章节和人物均清理'],['T31','落盘后关闭并重新打开数据库','两本初始小说保留'],['T32','退出后用原 cookie 查询','401']]
 table(doc,['编号','输入 / 操作','预期结果（实测均通过）'],rows,[1.3,8.4,7.3])
 h(doc,'测试通过的含义')
 p(doc,'32 个具体检查通过；Node 测试框架将父测试也计入，总计显示 33。测试覆盖本课程范围，不等于证明没有漏洞，也不等于完整验证原系统的全部功能。SQL 片段用例验证参数化路径，不宣称经过完整渗透测试。')
 page(doc,'13  实验结果与验证证据')
 results=json.loads((ROOT/'evidence/api-test-results.json').read_text());browser=json.loads((ROOT/'evidence/browser-results.json').read_text())
 table(doc,['验证项','本次结果'],[['环境','Node.js '+results['node']+'；'+results['database']],['具体后端 / 数据库检查',f"{results['passed']} 通过，{results['failed']} 失败；父测试另计 1 项"],['真实浏览器检查','登录、查表加载、新建/修改/删除小说及子项、刷新回读；通过'],['前端测试数据来源','真实课程版 HTTP 与隔离 SQLite；没有模拟 API'],['测试时间（UTC）',results['executedAt']],['数据隔离','演示 / 测试库不接触原系统；仅虚构教学数据'],['Word / PowerPoint 兼容性','字体与 OOXML 检查、Linux LibreOffice PDF 渲染；未在 Windows Microsoft Word / PowerPoint 实机验证']],[5,12])
 picture(doc,'04-crud-save.png')
 p(doc,'图：现场流程中新建《课堂演示作品》，保存章节后刷新页面，正文仍可回读。不是静态原型或虚构测试截图。','Caption')
 p(doc,'验证证据：evidence/api-test-results.json、evidence/browser-results.json、evidence/schema-metadata.json 与 assets/ 下截图。测试脚本和截图步骤可以复核，避免只写“测试通过”却没有依据。')
 page(doc,'14  部署与课堂演示流程')
 h(doc,'14.1 最短启动步骤（Windows PowerShell）')
 p(doc,'① 提前安装 Node.js 24 LTS。② 解压交付包，在 source 目录打开 PowerShell。③ 执行 node server.mjs --seed。④ 浏览器打开 http://127.0.0.1:4178。⑤ 使用 demo@example.test / Demo2026! 登录。')
 p(doc,'无需 npm install，无需单独安装 SQLite 服务。data/course.db 自动创建。保持启动窗口打开；若端口被占用，设置 $env:PORT = \'4179\' 后重启。source/README.md 提供完整命令。')
 h(doc,'14.2 三分钟增删改查演示')
 table(doc,['时间','页面动作','说明重点'],[['0:00—0:25','登录、选择《山海来信》','现有数据来自文件数据库'],['0:25—0:50','新建《课堂演示作品》','INSERT novel；所属用户由后端确定'],['0:50—1:25','新增章节，输入正文并保存','INSERT / UPDATE chapter'],['1:25—1:45','刷新，重新选择演示小说','回读仍在，区别于仅修改网页'],['1:45—2:10','编辑书名，加“已修改”','UPDATE novel'],['2:10—2:35','人物设定：新增并编辑一人','人物与小说一对多'],['2:35—3:00','删除演示书；终端查看数据库','DELETE + CASCADE；不删示例原稿']],[2.8,7.2,7])
 p(doc,'第二个 PowerShell 窗口执行 node inspect-db.mjs，增删前后各运行一次，显示四张表的真实记录。若教师只要求最短流程，保留“新增小说—修改书名—删除小说”，其余用于解释关联。')
 h(doc,'14.3 意外处理')
 p(doc,'打不开页面先看服务窗口是否运行；登录失败核对教学账号；端口占用改 4179；提示 node:sqlite 不存在则升级 Node。不要临场安装依赖或调用大模型。原始演示图片和 PDF 用于故障说明，但不能把截图冒充现场数据库操作。')
 page(doc,'15  结论、分工与参考资料')
 h(doc,'15.1 实验结论')
 p(doc,'本实验围绕小说创作管理完成了需求分析、中文 E-R 建模、关系转换、表结构与约束设计、Web 前后端开发及测试。四表形成清晰的一对多结构，用户通过浏览器完成小说、章节和人物的增删改查；持久化与级联清理均有实际检查。')
 p(doc,'主要体会：数据库设计应来自业务归属，而不是先堆字段；外键约束解决记录之间的有效联系，后端授权解决“能否操作”的问题，两者不能互相替代。界面显示成功后还要查询或刷新验证，才能证明数据真正保存。')
 h(doc,'15.2 局限与后续改进')
 p(doc,'课程版只服务于本机单人演示。若继续扩展，可接入教师指定的 MySQL/PostgreSQL 并补充方言迁移测试；把多语句保存包装为事务；增加登录限流、HTTPS、持久会话、版本冲突控制。大模型生成可作为扩展，但生成文本仍须走已有校验与保存流程。')
 h(doc,'15.3 建议分工（需按真实情况填写）')
 table(doc,['人数','可采用的分工方式'],[['1 人','独立完成建模、实现、测试和宣讲；封面只填本人'],['2 人','成员甲负责需求/数据库，成员乙负责前后端/测试；共同演示'],['3 人','成员甲讲需求与建模，成员乙讲实现，成员丙演示与测试'],['实际贡献记录','____________________________（按实际完成情况填写）']],[2.5,14.5])
 h(doc,'15.4 参考与成果定位')
 p(doc,'[1] 本次上传《实验13_17-18 数据库Web应用软件系统设计开发.docx》：用于确定实验要求。\n[2] 原项目 packages/backend/prisma/schema.prisma 及前后端代码：用于理解业务背景。\n[3] Node.js 官方文档：https://nodejs.org/api/sqlite.html 。\n[4] SQLite 官方文档：https://www.sqlite.org/foreignkeys.html 、https://www.sqlite.org/lang_createtable.html 。')
 p(doc,'开发过程中使用 AI 辅助梳理、编码和整理材料。提交前应由本人运行并理解源码、核对个人信息、按学校要求披露辅助情况。不得把建议分工当成真实完成记录。')
 finalize(doc,OUT/'01_实验报告.docx')

SLIDES=[
('小说创作管理系统','四张表，讲清一本小说背后的数据管理。',None,
 '大家好，我介绍的项目是小说创作管理系统，演示名称叫山海书房。它以已有小说创作工具为背景，保留用户、小说、章节和人物四个模块。今天主要讲数据库如何组织这些数据，再现场演示新增、修改和删除。'),
('为什么做这个系统','01 / 需求与范围',[('原来的问题','书稿、人物设定散落在多个文件中，归属和顺序不清晰。'),('本次保留','账号登录、小说书架、章节正文、人物设定。'),('主动简化','不演示复杂 AI 工作流，不依赖 API 或外网。')],
 '写小说时，书稿和人物设定常常分散保存。本系统把它们集中到一本小说下面。为了让数据库课程的重点更清楚，我没有在演示中放进模型配置、伏笔和发布等复杂功能；AI 可以辅助开发，但这份简化版没有调用大模型。'),
('一条清晰的数据链','02 / 系统架构', 'architecture.png',
 '页面在浏览器里运行，前端用 JavaScript 发出 HTTP 请求。Node.js 后端负责登录验证、检查字段和数据归属，再执行参数化 SQL，写进 SQLite 文件。SQLite 是实际数据库，不是浏览器 localStorage。为了方便教室运行，我选择免安装数据库服务的方案；本次不是 MySQL 版本。'),
('核心：四个实体，三组一对多','03 / 中文 E-R 图','er-cn.png',
 '看这张图就能理解整个系统。一个用户可以拥有多本小说，一本小说可以包含多个章节，也可以设定多个人物。反过来，每个章节和人物只能属于一本小说。这里没有多对多关系，因此四张表就足够，不需要额外的中间表。'),
('关系如何变成表','04 / 转表与约束',[('用户 → 小说','novel.user_id 外键引用用户主键。'),('小说 → 章节 / 人物','子表 novel_id 引用小说；删除小说级联清理。'),('三类完整性','主键唯一；外键归属；邮箱、章序、状态受约束。')],
 '转表时，每个实体变成一张表，一对多联系把一方的主键放到多方作为外键。例如章节表保存 novel_id。主键保证每条记录可识别，外键防止章节指向不存在的小说。邮箱不能重复，同一本书的章序不能重复，状态也只能使用指定值。'),
('少存重复数据，少出更新问题','05 / 数据字典与依赖',[('4 张表 / 24 个字段','报告给出完整类型、默认值、主外键和长度限制。'),('不重复保存归属名称','章节只存小说编号，不重复存书名。'),('字数在查询时计算','正文变化后无需同步维护第二份字数。')],
 '数据字典里有四张表、二十四个字段。章节表不重复保存书名，否则书名变更就要修改很多章节。字数也不作为字段重复存储，而是在查询时计算。在这次简化的业务依赖假设下，这样能减少冗余，并按第三范式组织数据。'),
('保存按钮背后发生什么','06 / 前后端闭环',[('1  发起请求','浏览器提交标题、正文和章节编号。'),('2  校验并写入','后端验证账号与归属，用 SQL 参数更新记录。'),('3  重新查询','返回页面；刷新后再读取，证明已经落库。')],
 '以章节保存为例。浏览器发送标题和正文，后端先确认登录，再检查这本小说确实属于当前用户，然后执行 UPDATE。成功后前端重新查询。现场我会刷新页面，让大家看到内容不是只留在网页里，而是已经存进数据库。'),
('实际界面：书架与章节','07 / 运行结果','02-workspace.png',
 '这是本次简化版的实际运行截图。左边选择小说，中间选择章节，右边编辑正文。界面采用绿色调和纸张式编辑区。为了便于演示，正文使用明确的保存按钮，不做复杂的自动保存。人物设定在顶部标签中切换。'),
('现场演示：新增、修改、删除','08 / 约 3 分钟',[('新增','创建《课堂演示作品》，再增加一个章节。'),('修改','保存正文并刷新，修改书名和人物介绍。'),('删除','删除演示小说，检查关联章节和人物一起清理。')],
 '下面进入三分钟演示。先新建一本演示小说和章节，输入一段正文并保存。然后刷新页面证明持久化，再修改书名、添加一个人物。最后删除这本专门的演示书，并在第二个终端查看数据库，说明章节和人物由外键级联清理。'),
('测试要能证明结果','09 / 验证证据',[('32 个具体检查通过','CRUD、文件落盘、外键、唯一性及状态约束。'),('登录与数据隔离','错误密码、未登录、跨用户修改均被拒绝。'),('真实浏览器操作','新增、保存、刷新、修改和删除，不使用模拟 API。')],
 '测试分为接口数据库检查和真实浏览器操作。三十二个具体检查全部通过，测试框架还会额外显示一个父测试。我们既测正常保存，也故意输入重复邮箱、无效外键和非法状态；还用第二个用户尝试修改别人的书，后台会拒绝。'),
('为什么这样简化','10 / 边界与改进',[('课堂收益','源码短、无第三方依赖，离线可演示。'),('当前边界','SQLite、本机单人；重启需要重新登录。'),('后续扩展','指定数据库迁移、事务、并发控制，再考虑 AI。')],
 '这份作品重点是数据库应用的完整闭环，而不是功能数量。它的边界也很明确：本机单人使用，进程内存保存会话，所以重启后要重新登录；数据库文件中的书稿仍然保留。如果继续开发，优先补充事务和并发控制，并在需要时迁移到老师指定的数据库。'),
('让页面操作，对应真实的数据变化','谢谢 / 欢迎提问',[('需求','从用户、小说、章节、人物出发。'),('设计','实体、关系、约束共同保证数据正确。'),('实现','每个增删改操作都有数据库结果可核对。')],
 '最后总结一下，这个项目从实际创作需求出发，用四张表组织数据，通过 Web 页面完成增删改查，并用测试和数据库查询验证结果。我最想强调的是，外键保证关系有效，后端授权保证访问合法，页面刷新验证真正落库。我的介绍到这里，谢谢大家。')]

def ppt_text(slide,x,y,w,h,text,size=20,color=INK,bold=False):
 shape=slide.shapes.add_textbox(PI(x),PI(y),PI(w),PI(h));tf=shape.text_frame;tf.word_wrap=True;tf.margin_left=0;tf.margin_top=0;tf.margin_bottom=0
 for i,line in enumerate(text.split('\n')):
  para=tf.paragraphs[0] if i==0 else tf.add_paragraph();para.space_after=PP(8);para.font.size=PP(size);para.font.name='微软雅黑';para.font.color.rgb=PC.from_string(color);para.font.bold=bold
  para.text=line
  for r in para.runs:
   r.font.name='微软雅黑';r.font.size=PP(size);r.font.color.rgb=PC.from_string(color);r.font.bold=bold
   rpr=r._r.get_or_add_rPr();ea=etree.SubElement(rpr,'{http://schemas.openxmlformats.org/drawingml/2006/main}ea');ea.set('typeface','微软雅黑')
 return shape

def rect(slide,x,y,w,h,fill):
 s=slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,PI(x),PI(y),PI(w),PI(h));s.fill.solid();s.fill.fore_color.rgb=PC.from_string(fill);s.line.fill.background();s.adjustments[0]=0.08;style=s._element.find('{http://schemas.openxmlformats.org/presentationml/2006/main}style');s._element.remove(style) if style is not None else None;effect=etree.SubElement(s._element.spPr,'{http://schemas.openxmlformats.org/drawingml/2006/main}effectLst');return s

def deck():
 prs=Presentation();prs.slide_width=PI(13.333);prs.slide_height=PI(7.5)
 for i,(title,kicker,content,notes) in enumerate(SLIDES):
  sl=prs.slides.add_slide(prs.slide_layouts[6]);sl.background.fill.solid();sl.background.fill.fore_color.rgb=PC.from_string(BG)
  rect(sl,.45,.5,.09,.38,GREEN);ppt_text(sl,.7,.5,10,.4,'NOVELAGENT  /  数据库 Web 应用课程设计',11,MUTED)
  ppt_text(sl,.7,7.1,10,.2,'山海书房 · 课程简化版   |   用户 / 小说 / 章节 / 人物',9,MUTED);ppt_text(sl,12.1,7.05,.6,.3,f'{i+1:02}',12,GREEN)
  if i==0:
   ppt_text(sl,.8,1.65,10,1.2,title,40,GREEN,True);ppt_text(sl,.85,3.0,10,.6,kicker,23,INK);ppt_text(sl,.85,4.15,9,1.1,'需求分析  →  数据库设计  →  Web 实现  →  测试与现场演示',19,MUTED);rect(sl,.85,5.65,7.3,.65,SOFT);ppt_text(sl,1.05,5.83,7,.4,'汇报人：________    学号：________    班级：________',14,INK)
  else:
   ppt_text(sl,.8,1.15,11.9,.4,kicker,13,GREEN);ppt_text(sl,.8,1.8,11.9,.9,title,30,INK,True)
   if content=='er-cn.png':
    for x,y,w,ht,tt,sub in [(.85,4.0,2.4,1.65,'用户','编号 · 邮箱 · 昵称'),(4.1,4.0,2.6,1.65,'小说','编号 · 书名 · 用户'),(9.0,3.0,3.25,1.55,'章节','编号 · 小说编号 · 正文'),(9.0,5.1,3.25,1.55,'人物','编号 · 小说编号 · 姓名')]:
     rect(sl,x,y,w,ht,'FFFFFF');ppt_text(sl,x+.2,y+.2,w-.4,.5,tt,23,GREEN,True);ppt_text(sl,x+.2,y+.95,w-.4,.45,sub,13,MUTED)
    ppt_text(sl,3.3,4.6,.8,.9,'1 → N\n拥有',12,GREEN)
    ppt_text(sl,7.05,3.6,1.8,.9,'1 → N\n包含章节',13,GREEN)
    ppt_text(sl,7.05,5.35,1.8,.9,'1 → N\n设定人物',13,GREEN)
   elif content=='architecture.png':
    for j,(tt,sub) in enumerate([('浏览器页面','登录 / 书架 / 章节 / 人物\nHTML + CSS + JavaScript'),('Node.js 后端','会话与归属校验\n校验输入 → 参数化 SQL'),('SQLite 数据库','四张关系表 + 外键约束\n写入本地文件，刷新可回读')]):
     x=.8+j*4.05;rect(sl,x,3.25,3.78,2.7,'FFFFFF');ppt_text(sl,x+.22,3.55,3.3,.7,tt,23,GREEN,True);ppt_text(sl,x+.22,4.55,3.28,1.05,sub,17,MUTED)
    ppt_text(sl,.85,6.3,11.5,.5,'页面提交 → 检查权限 → 写入数据库 → 查询回读 → 更新界面',18,GREEN)
   elif isinstance(content,str):
    if content=='02-workspace.png':
     Image.open(AS/content).crop((0,0,1440,490)).save(AS/'workspace-ppt.png');content='workspace-ppt.png'
    img=Image.open(AS/content);ratio=img.width/img.height;w=11.5;hh=w/ratio
    if hh>3.9:hh=3.9;w=hh*ratio
    sl.shapes.add_picture(str(AS/content),PI((13.333-w)/2),PI(2.85),width=PI(w),height=PI(hh))
   elif content:
    for j,(a,b) in enumerate(content):
     x=.8+j*4.05;rect(sl,x,3.05,3.78,3.25,'FFFFFF');ppt_text(sl,x+.22,3.32,3.3,.4,f'0{j+1}',15,GREEN,True);ppt_text(sl,x+.22,4.0,3.28,.8,a,22,INK,True);ppt_text(sl,x+.22,4.85,3.28,1.22,b,17,MUTED)
  sl.notes_slide.notes_text_frame.text=notes
  for para in sl.notes_slide.notes_text_frame.paragraphs:
   for r in para.runs:
    r.font.name='微软雅黑';ea=etree.SubElement(r._r.get_or_add_rPr(),'{http://schemas.openxmlformats.org/drawingml/2006/main}ea');ea.set('typeface','微软雅黑')
 prs.save(OUT/'02_答辩演示.pptx')

def speech():
 doc=setup_doc('讲稿');p(doc,'答辩讲稿与现场演示手册','Title');p(doc,'NovelAgent 课程简化版 · 建议 8 分钟','Subtitle');p(doc,'建议节奏：PPT 讲解约 5 分钟，现场演示约 3 分钟。第 9 页暂停切到浏览器，演示结束后回到第 10 页。若老师给 5 分钟，只保留第 1、4、5、9、10、12 页，演示缩为小说增改删。')
 table(doc,['上台前','确认事项'],[['个人信息','填写报告封面、PPT 第 1 页和实际分工'],['运行','提前安装 Node.js 24 LTS；在 source 执行 node server.mjs --seed'],['登录','浏览器打开 http://127.0.0.1:4178，教学账号已给出'],['数据','保留《山海来信》；只删自己创建的《课堂演示作品》'],['数据库展示','第二个终端在 source 目录等待执行 node inspect-db.mjs'],['备用','PPT/PDF、真实截图、源码拷入 U 盘，教室电脑预演一次']],[3.3,13.7])
 h(doc,'只要记住这三句话')
 p(doc,'① 一个用户有多本小说，一本小说有多个章节和人物。\n② 外键保证归属有效，后端验证保证不能越权。\n③ 保存后刷新，再看数据库，证明数据确实落盘。')
 for i,(title,kicker,content,notes) in enumerate(SLIDES):
  if i%3==0:page(doc,f'逐页讲稿  /  第 {i+1}—{min(i+3,12)} 页')
  h(doc,f'第 {i+1} 页  {title}');p(doc,notes)
  if i==8:p(doc,'【操作提示】此处切换到浏览器，按下一节步骤演示；不要在台上打开源码逐行读。','Caption')
 page(doc,'现场操作卡  /  可放在讲台旁')
 steps=[('1. 登录与选书','账号 demo@example.test / Demo2026!；选择《山海来信》。','“这里的数据由后端查询数据库得到。”'),('2. 新增小说','点左侧＋；书名“课堂演示作品”；类型“校园”；简介“用于演示数据库操作”；保存。','“这一步对应 INSERT novel，用户编号从登录会话取得。”'),('3. 新增及保存章节','切到章节创作，点目录＋；标题“第一章 初见”；正文“春天的第一场雨落下时，林溪在图书馆门口遇见了周然。”；保存。','“章节表通过 novel_id 关联当前小说。”'),('4. 刷新验证','刷新浏览器，重新选择《课堂演示作品》，展示正文还在。','“如果只是改页面，刷新就会消失；现在能从数据库回读。”'),('5. 修改小说','编辑书籍，将书名改为“课堂演示作品（已修改）”；保存。','“这是 UPDATE，不是重新创建一本书。”'),('6. 新增与修改人物','人物设定 → 添加周然，介绍“开朗的图书管理员”；编辑介绍加“喜欢收集旧书”。','“人物和小说是一对多联系，可以独立维护。”'),('7. 查看数据库','第二个终端运行 node inspect-db.mjs，找到演示小说及其章节、人物。','“前端记录与四张表中的记录一一对应。”'),('8. 删除与复核','回浏览器删除演示小说，确认；第二个终端再次运行查看命令。','“外键级联清理了这本书的章节和人物，不留下孤立数据。”')]
 table(doc,['步骤','怎么点','怎么讲'],steps,[3,7.8,6.6])
 page(doc,'老师常问的问题  /  简短回答')
 qa=[('为什么不直接用文件？','关系数据库能清楚表达小说与章节、人物之间的归属，支持结构化查询、唯一约束和级联清理。正文可以存文本，但不能只靠分散文件管理全部关系。'),('为什么选择 SQLite，不是 MySQL？','任务书推荐 MySQL。我这份实际使用 SQLite，优先保证离线可运行、方便课堂演示。它仍是关系数据库，有 SQL、外键与事务；不能把本实现说成 MySQL。如教师限定 MySQL，需要迁移建表与驱动并重新测试。'),('原系统不是更复杂吗？','是。原系统有大纲、世界观、伏笔和 AI 等模块，本课程版只抽取四类实体并独立实现，不读取原系统数据。'),('是不是只有前端，没有数据库？','不是。页面通过同源 HTTP 调用 Node 后端，SQLite 文件在 source/data/course.db。可以刷新页面、重启服务、查看数据库记录来验证。'),('主键、外键和授权有什么区别？','主键标识一条记录；外键保证引用的数据存在；授权保证当前账号有权操作这条记录。存在的记录也可能属于别人，因此外键不能替代授权。'),('如何防止别人修改我的小说？','后端用小说编号和当前用户编号一起查询；子项还要同时匹配 novel_id。前端隐藏按钮不够，API 中也必须拒绝。'),('为什么删除小说，人物也没了？','子表外键定义了 ON DELETE CASCADE。删除前界面有明确提示；数据库在删除语句内一并处理关联记录。'),('数据库是第三范式吗？','在本课题给定依赖假设下按第三范式组织。每类实体单独存储，不重复保存用户昵称或书名；字数按查询计算。不只是“有主键就是第三范式”。'),('章节的字数怎么算？','去掉换行符后统计 Unicode 字符，包含标点和空格，不做中文分词。因此它是简化字符数，不等于出版规范的字数。'),('AI 功能在哪里？','这个简化版没有模型调用。本题允许自选 Web 系统，AI 结合是鼓励而非硬性要求；我把重点放在实际数据库增删改查。'),('测试真的做了吗？','源码带 test.mjs，32 个具体检查通过，测试框架另计父测试；浏览器也连接真实后端完成了流程，证据 JSON 和截图一并提供。'),('为什么刷新后选中的书变了？','选中项是页面状态，没有跨刷新保存；业务数据已经在数据库里。刷新后重新选中刚才的小说即可。'),('重启为什么又要登录？','会话只在内存，重启失效；书稿在文件数据库，不会随会话丢失。这样设计是课堂简化，不是生产方案。'),('你会继续改什么？','先补事务和并发版本控制，再做登录限流、HTTPS、持久会话；如课堂要求指定数据库则优先迁移并复测。')]
 for q,a in qa:h(doc,q);p(doc,a)
 page(doc,'故障预案与提交检查')
 table(doc,['情况','处理'],[['提示找不到 node','提前安装 Node.js 24 LTS；重新打开 PowerShell'],['提示 node:sqlite 不存在','版本过旧，升级 Node；不要临场换成 Python'],['页面打不开','确认服务窗口未关闭，地址和端口正确'],['4178 被占用',"PowerShell 执行 $env:PORT='4179' 后重启，浏览器访问 4179"],['脚本不允许运行','直接执行 node server.mjs --seed，无需改 PowerShell 策略'],['登录失败','教学账号仅属于本演示；不能用原系统账号'],['删掉了演示示例书','新建一份教学数据；不要重置、覆盖原系统库'],['时间不够','只做小说新增、修改、删除，再用 ER 图解释两个子表'],['服务无法恢复','用 PDF 与真实截图说明已验证结果；不要把截图说成现场运行']],[4,13])
 h(doc,'提交前逐项打勾')
 p(doc,'□ 封面姓名学号班级已填　□ PPT 汇报人已填　□ 实际分工已核实\n□ 本机成功启动并登录　□ 亲自完成一次增改删　□ 理解四表及三个外键\n□ 已确认老师是否限定数据库　□ 报告 PDF 和 PPT 备用 PDF 可打开\n□ 学校要求的 AI 辅助披露已完成　□ 没有提交个人真实密码与原系统数据库')
 p(doc,'排版说明：文档引用宋体、黑体，PPT 引用微软雅黑，图中使用可嵌入的中文图像。已做 OOXML 字体检查及 Linux PDF 渲染；Windows Microsoft Word / PowerPoint 的实机排版仍需提交前核对，不能将 Linux 渲染声称为 Windows 实测。','Caption')
 finalize(doc,OUT/'03_讲稿与演示手册.docx')

diagram();report();deck();speech();print('Generated report, 12-slide deck, speech handbook at',OUT)
