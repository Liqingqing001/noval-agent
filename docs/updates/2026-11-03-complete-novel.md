# 《潮汐替人记得》完整小说案例

按用户要求为项目创作、配图并发布完整长篇，保留现有《灵石起源》演示及全部创作组件。

## 交付

- 原创中文海洋幻想 / 社会悬疑小说，五卷四十章，已完本。
- 正文 **60,720 个 Unicode Han 汉字**；去掉每章标题，不计标点、空白、数字、大纲、设定与配图文字。正文非空白字符 68,780。
- 40 个逐章 Markdown 源文件，完整 UTF-8 Markdown 与带 BOM、CRLF 的 TXT；后二者由脚本汇编。
- 人物八名、四位主角群像、六组世界规则、时间线、五卷总纲、四十章细纲与伏笔回收；设定不计入正文字数。
- AI 生成的书封与四位主角群像。原图保留在会话生成目录；仓库包含高质量 WebP 副本，总计约 865 KiB。未使用第三方肖像。
- 独立静态阅读入口 `/noval-agent/book/`，沿用现有 GitHub Pages 发布。创作演示横幅与 README 提供入口。

## 文件

- `packages/frontend/public/book/chapters/`：手写正文源文件。
- `packages/frontend/public/book/setting.json`：设定、角色、分卷与逐章细纲源数据。
- `packages/frontend/public/book/index.html`、`style.css`、`app.js`：无需外部 CDN、账号或在线模型的阅读站。
- `scripts/build-book.mjs`：统计字数、检查四十章及完本标志、检查重复长段落，生成 SHA-256 清单、下载正文与创作档案。
- `manifest.json`：逐章字数、摘要、内容校验值及明确的计数规则。

## 阅读

从页面翻开第一章，或点目录跳章。支持章节选择、上下章及左右方向键；夜读与 16—28 px 字号、章节与滚动位置只在本机 localStorage 保存。禁用存储仍可阅读。加载错误提供重试；无 JavaScript 可直接打开完整 TXT。深链接使用 `book/#read/01`，兼容 GitHub Pages 子路径，无服务器路由依赖。

人物主卡只展示欲望与形象，完整弧线与细纲折叠并标剧透。时间线及世界规则涉及背景真相，建议先读正文。页面明确披露 AI 创作与虚构性质。

## 验证

- `npm run book:build`：40 章、60,720 汉字、无重复长段落、结尾完本标志。
- `CHROME_PATH=/usr/bin/chromium npm run test:book`：逐章 SHA-256、正文计数、完整 TXT 下载、40 章导航、读到结尾、阅读位置恢复、主题字号、断网重试、禁用存储、320 / 390 / 768 px 无横向溢出。
- `VITE_DEMO_MODE=true VITE_BASE_PATH=/noval-agent/ npm run build:frontend`：通过，书籍静态文件随构建复制。
- `npm run test:demo`：原创作示例保持原有数据与行为检查。
- 人工查看桌面全页与手机夜读截图，书封、人物图与中文正文显示正常。
- Pages CI 增加正文构建校验和基于正式产物的阅读器浏览器测试，保留既有完整应用及演示功能回归。

原有 Vite 配置未来兼容提示和 chunk 体积提示仍存在，不影响构建。本次仅新增静态阅读体验，没有替换现有创作解析或编辑器。
