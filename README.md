<img width="2326" height="1403" alt="image" src="https://github.com/user-attachments/assets/a200cf2c-9159-4e54-8194-bae0a8904941" />
## NovelAgent 在线演示

书架导航的「发布中心」和作品页的「发布」提供十四个平台 / 渠道的投稿路径、AI 正文与图片政策、来源及访问限制。可复制章节、导出稿件、下载带 AI 使用自述的投稿资料并打开官方后台；GitHub Pages 渠道还可生成独立阅读页。当前未接入远端上传、审核或签约，不把下载文件视为已发布。[平台调研](docs/research/publishing-platforms.md) · [功能边界](docs/updates/2026-11-03-publishing-hub.md)

[打开《潮汐替人记得》产品案例](https://liqingqing001.github.io/noval-agent/)

五卷四十章、正文 **60,720 汉字**的完整小说已写入项目 SQLite：8 个人物、9 条世界观、45 张大纲卡、8 条伏笔及书封 / 群像。Pages 从数据库导出快照，默认只展示这一本，使用现有产品界面编辑、浏览和导出。[入库与展示说明](docs/updates/2026-11-03-database-backed-case.md)

[打开 GitHub Pages 面试演示](https://liqingqing001.github.io/noval-agent/)

公开示例选用《潮汐替人记得》，包含 40 章完本正文、人物、世界观、五卷细纲和伏笔。无需登录即可编辑、浏览并导出；修改只保存在访问者自己的浏览器。已有文字回放明确标注为非实时生成，也可自行配置模型 API。Pages 不运行后端数据库，具体保存边界见入库说明。

[演示模式与发布说明](docs/updates/2026-11-01-github-pages-demo.md)

「人物」新增关系画布：自由拖动头像、单击人物建立箭头连线、双击维护当前状态（打开详情不移动画布），也可切回原人物列表。布局、头像、关系和状态保存在当前浏览器。[使用与保存边界](docs/prd/character-board-v1.md)

书架的「参考创作」支持粘贴 / TXT / Markdown 完整导入最多 100 万字符的作品，选择章节或范围、分批分析与汇总文风结构，再换主题拟提纲、确认后写新稿并编辑导出。无需先选小说，使用自己配置的模型；参考资料、批次进度与独立新稿保存在当前浏览器，失败后可主动继续。[长文使用步骤与范围](docs/prd/reference-longform-v2.md) · [更新记录](docs/updates/2026-11-02-reference-longform.md)
