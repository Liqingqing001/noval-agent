<img width="2326" height="1403" alt="image" src="https://github.com/user-attachments/assets/a200cf2c-9159-4e54-8194-bae0a8904941" />
## NovelAgent 在线演示

书架导航的「发布中心」和作品页的「发布」提供十四个平台 / 渠道的投稿路径、AI 正文与图片政策、来源及访问限制。可复制章节、导出稿件、下载带 AI 使用自述的投稿资料并打开官方后台；GitHub Pages 渠道还可生成独立阅读页。当前未接入远端上传、审核或签约，不把下载文件视为已发布。[平台调研](docs/research/publishing-platforms.md) · [功能边界](docs/updates/2026-11-03-publishing-hub.md)

[打开双书产品案例](https://liqingqing001.github.io/noval-agent/)

默认打开新书 **《晚自习后，别回头》**：校园规则怪谈、七名高中生群像、五个连续夜晚、四十章完本，正文 **65,013 汉字**。原书 **《潮汐替人记得》**（60,720 汉字、四十章）保留在书架。两书均写入项目 SQLite，再查询业务表导出 Pages 快照，使用同一套创作界面编辑、浏览与导出。[双书与人物更新](docs/updates/2026-11-03-school-ensemble.md) · [初版入库说明](docs/updates/2026-11-03-database-backed-case.md)

[打开 GitHub Pages 面试演示](https://liqingqing001.github.io/noval-agent/)

两部示例包含完整正文、人物、世界观、五卷细纲和伏笔。新书十二人、原书八人均有 AI 生成头像、性格、背景及明确的人际关系，关系图从数据库人物关系初始化，支持继续编辑。章节字段保存纯标题，章节序号由界面统一生成。无需登录，访问者修改只保存在自己的浏览器；自动更新保留已有改稿和自建作品。已有文字回放标注为非实时生成，也可自行配置模型 API。Pages 本身不运行后端数据库。

[演示模式与发布说明](docs/updates/2026-11-01-github-pages-demo.md)

「人物」提供关系画布与人物列表：数据库头像、关系名称和说明可直接查看，自由拖动、建立箭头连线、双击维护状态。画布布局、手动增删关系和上传头像保存在当前浏览器，人物编辑器维护的资料在普通应用中通过 API 入库。[使用与保存边界](docs/prd/character-board-v1.md)

关系图上方可按人物聚焦，只看此人的直接关系，再返回全部。书封与人物头像支持点击放大；书籍操作收进右上角“更多”。书籍、画布人物、章节支持右键和 Shift+F10，正文与输入框保留选字、复制及原生右键。[操作说明](docs/updates/2026-11-03-focus-preview-context-menu.md)

书架的「参考创作」支持粘贴 / TXT / Markdown 完整导入最多 100 万字符的作品，选择章节或范围、分批分析与汇总文风结构，再换主题拟提纲、确认后写新稿并编辑导出。无需先选小说，使用自己配置的模型；参考资料、批次进度与独立新稿保存在当前浏览器，失败后可主动继续。[长文使用步骤与范围](docs/prd/reference-longform-v2.md) · [更新记录](docs/updates/2026-11-02-reference-longform.md)
