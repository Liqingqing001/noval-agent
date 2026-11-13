# 最新课堂材料：现有 NovelAgent + GitHub Pages

**本目录是按最新要求重做的版本。不是 `docs/course-final` 的独立四表程序，也不是 `docs/database-design` 的十五表规划。系统不替换，讲解只抓重点。**

## 下载与使用

- [下载新版PPT（30页）](https://github.com/Liqingqing001/noval-agent/raw/refs/heads/work/docs/course-final-pages/deliverables/NovelAgent-Pages-Defense.pptx)
- [下载配套报告Word](https://github.com/Liqingqing001/noval-agent/raw/refs/heads/work/docs/course-final-pages/deliverables/NovelAgent-Report.docx)
- [下载十分钟讲稿Word](https://github.com/Liqingqing001/noval-agent/raw/refs/heads/work/docs/course-final-pages/deliverables/NovelAgent-Talk-Guide.docx)
- [下载本次全套材料ZIP](https://github.com/Liqingqing001/noval-agent/raw/refs/heads/work/docs/course-final-pages/deliverables/NovelAgent-Pages-Course-Final.zip)

## 先打开 PPT

`deliverables/NovelAgent-Pages-Defense.pptx`：30 页，20 页正文 + 10 页补充分析，含备注讲稿、原系统实图、可编辑 E-R / 流程图、可点击导航。

十分钟精讲路线：**1 → 2 → 3 → 5 → 7 → 8 → 10 → 11 → 14 → 15 → 18 → 19 → 20**。放映时点右下角“下一讲”，会跳过补充页面；第19页暂停PPT，打开现有Pages演示约3分钟。用普通方向键会经过所有页。放映模式可直接点击按钮，编辑模式可用 Ctrl+单击。

- 每页顶部“在线系统”打开 https://liqingqing001.github.io/noval-agent/ 。
- “目录”跳第4页，“演示台”跳第19页，目录卡片可跳各主题。
- 图和表均在PPT中：七实体概念图、重点/完整中文ER、转表、字典、约束、范式取舍、前后端、两种存储路径、保存流程、AI、测试。
- 补充页包含关键字段、接口/SQL、测试用例、源码链接与更多功能实图。
- 现有应用未提供可靠的模块深链接，因此网页按钮到真实首页，不虚构进入具体模块的URL；进入网页后点击原有导航。

## 配套文件

- `NovelAgent-Report.docx`：18页，报告正文与完整7表67标量字段附录。
- `NovelAgent-Talk-Guide.docx`：6页，逐页主讲话术、计时、操作与问答。
- 同名PDF：用于预览与放映备用；PPTX仍是主要演讲文件。
- `assets/`：原系统Pages模式十张界面/操作截图及中文ER图。
- `evidence/`：真实schema字段、迁移后SQLite结构、原项目测试日志、页面操作结果与文档校验。

## 实际系统与课堂边界

原项目是 React + Express + Prisma + SQLite，schema现有7个业务模型、67个标量字段、6个物理归属外键。历史迁移仍保留PlotCard.actNumber一列，因此按迁移新建库有68个物理列；报告附录明确区分当前模型与遗留字段。本材料没有重新造表或删除实体，只讲其中主干。`chapterId`等业务字符串引用不画成已实现外键；人物关系实际保存在JSON字符串中，不虚构独立关系表。

Pages使用同一套创作界面、数据库导出的案例快照和浏览器保存，不运行后端SQLite服务。**Pages的刷新保留只证明本机持久化，不证明远端数据库写入。** 原项目数据库/接口能力由Prisma模型、真实临时SQLite测试及代码说明。课堂若另有必须连接数据库的硬性要求，应准备原项目完整版，不得用Pages截图冒充落库。

59项原项目专项测试通过：数据库案例3、人物资料/接口3、演示初始化8、同步33、编辑导出12。不是旧简化程序的32项测试，也不是全量回归。浏览器真实验证原系统Pages模式创建、自动保存、重命名、刷新和删除，不模拟API。

截图来自当前代码的本地Pages模式（`VITE_DEMO_MODE=true`），并非声称线上截图。当前环境访问线上Pages返回403，线上可用性需要课前在本人电脑检查；不修改网络政策或发布站点。

## 课前准备

填写封面/PPT首页姓名学号班级与实际分工；先用自己的浏览器打开Pages，创建专用演示作品；不改动两部示例原稿，不展示个人API Key。练一次第19页的查、增、改、删。

字体：Word正文宋体、标题黑体，PPT微软雅黑。已用Linux LibreOffice与Noto CJK替代字体生成PDF并检查，不声称做过Windows Microsoft Word/PowerPoint实机验证。本人电脑打开核对后再上台。

## 生成工具（非课堂依赖）

`tools/build_pages_materials.py` 依赖python-docx、python-pptx、Pillow、lxml；绘图字体为当前Linux的Noto CJK。原系统的运行方式见仓库根README，本目录不附另一个简化应用。

`tools/capture-pages.cjs` 使用Playwright；可通过`PLAYWRIGHT_MODULE`、`CHROME_PATH`、`PAGES_MODE_URL`指定环境。它仅应运行在本地测试Pages模式，使用隔离浏览器，不修改用户已有站点数据。
