import {readFile,writeFile,mkdir} from 'node:fs/promises';
const data=JSON.parse(await readFile(new URL('../packages/frontend/src/data/publishingPlatforms.json',import.meta.url),'utf8'));
const labels={restricted:'有明确限制',disclosure:'需声明 / 标签',conditional:'有条件允许',unverified:'规则待核实',na:'非网文投稿平台'};
const report=[
 '# 小说发布平台调研与第一版实现边界',
 '核查日期：2026-11-03。公开网页调研，未登录作者账号、未测试实际投稿、未联系商务接口。来源日期与核查日期分别记录；未核实不等于允许或禁止，无法读取全文的搜索摘要不作为完整规则。以下政策可能变更，应以提交时的官方规则、活动与合同为准。',
 '## 当前功能\n\n已实现：平台目录和地区 / 政策筛选、官方入口、逐步流程、证据链接、作品选择、复制书名 / 简介 / 单章、TXT / Markdown / Word、含 AI 使用自述的投稿资料、自托管 HTML 阅读页。文件均在本机生成。\n\n尚未实现：平台账号授权、远端上传、自动建书、审核同步、签约、收益、定时发布。目录中没有平台被标成已接入。公开发布 API 未核实不代表不存在私有、合作或未来接口。\n\n通用导出不代表平台支持直接导入；有 AI 创作工具不代表允许 AI 生成稿；普通发布不等于能签约变现；AO3 的非商业同人归档与 KDP 的自出版、GitHub Pages 的托管属于不同渠道。',
 '## 平台总览\n\n| 平台 | AI 政策结论 | 本项目当前进度 |\n| --- | --- | --- |\n'+data.map(p=>`| ${p.name} | ${labels[p.ai.status]} | 本机准备 + 官方入口；无远端提交 |`).join('\n'),
 ...data.map(p=>`## ${p.name}\n\n- 类型：${p.category}\n- 定位：${p.fit}\n- 入口：${p.entryUrl}\n- 核查日期：${p.checkedAt}\n\n### 投稿路径 / 待核实步骤\n\n${p.workflow.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\n文件能力：${p.formats}\n\n接口：${p.api}\n\n### AI 政策\n\n结论标签：${labels[p.ai.status]}\n\n- 生成正文：${p.ai.text}\n- 辅助：${p.ai.assisted}\n- 封面 / 插图：${p.ai.cover}\n- 签约 / 变现：${p.ai.monetization}\n\n### 边界\n\n${p.caveats.map(x=>`- ${x}`).join('\n')}\n\n### 证据\n\n${p.sources.map(s=>`- [${s.title}](${s.url}) · ${s.kind} · ${s.access}${s.publishedAt?` · 来源日期 ${s.publishedAt}`:''}${s.quote?`\n\n  > ${s.quote}`:''}`).join('\n\n')}`),
 '## 后续接入顺序\n\n1. 维护来源与更新日期，优先补齐待核实平台的公开条款与登录后能力。\n2. 在平台提供公开文档或明确合作授权后，才评估账号授权、建书与上传；不把模拟私有请求、接管 Cookie、绕过验证当作可用接口。\n3. 若做浏览器辅助，先验证服务条款、字段与草稿能力，最终预览和发布由作者确认；与真正 API 接入分开标识。\n4. 再考虑章节映射、草稿状态、幂等、防止重复提交与审核状态。避免将“已下载 / 已打开后台”视为“已发布”。\n5. GitHub Pages 现有案例可复用托管经验，但发布任意作品仍需要目标仓库权限与明确的部署流程；本版只生成独立 HTML。',
];
const text=report.join('\n\n')+'\n';
await mkdir(new URL('../docs/research/',import.meta.url),{recursive:true});
await writeFile(new URL('../docs/research/publishing-platforms.md',import.meta.url),text);
await writeFile(new URL('../packages/frontend/public/publishing-research.md',import.meta.url),text);
console.log(`Publishing report: ${data.length} platforms; ${data.filter(x=>x.ai.status==='unverified').length} policies pending verification`);
