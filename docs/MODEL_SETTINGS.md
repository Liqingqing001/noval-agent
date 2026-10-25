# 模型设置升级说明

更新日期：2026-10-25

## 本次变化

模型设置从单一 OpenAI 格式请求，升级为按协议适配的文本模型配置模块。服务商用于提供地址与认证预设，协议决定请求格式和响应解析；两者可以独立调整。

- 12 类预设：DeepSeek、OpenAI、Anthropic / Claude、Google Gemini、阿里云百炼 / 通义千问、智谱 GLM、Moonshot / Kimi、硅基流动、腾讯混元、Ollama、LM Studio、自定义 / 中转 / vLLM。
- 支持 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages、Gemini 原生接口。
- 模型 ID 可自由填写，也可获取接口实际返回的模型列表后选择，不依赖写死的过时模型列表。
- 获取模型列表与连接测试均支持取消；连接测试使用当前草稿、实际协议、认证、参数和流式开关，尚未保存也能测试。
- 所有参数统一保存并启用。不同服务商分别保存配置；切换到尚未保存过的服务商时使用无密钥的预设。
- 支持免认证本地模型、Bearer、x-api-key、api-key；Gemini 使用 x-goog-api-key。
- 支持关闭 temperature、选择 Token 参数、非流式输出、请求超时、附加 JSON 参数与自定义请求头。
- 写作助手使用同一适配层，并增加“停止生成”；切换小说或卸载面板时取消进行中的请求。

## 用户配置步骤

1. 打开左侧“设置”，选择服务商。自建服务、其他供应商和中转网关可选择“自定义”。
2. 确认协议、API 地址和认证方式，填写该地址对应的 API Key。
3. 点击“获取模型列表”，从列表选取文本生成模型；接口没有列表功能时，直接填写服务商提供的模型 ID 或部署名称。
4. 根据模型能力调整参数，点击“测试连接”。测试会发送 `Reply with only OK.`，可能产生 API 费用；测试成功仅代表本次文本请求成功。
5. 点击“保存并启用”。页面顶部会显示当前用于写作的服务商与模型。

切换服务商或修改字段只是编辑草稿，保存前不会改变写作助手的实际配置。未保存的其他服务商草稿会在当前设置页面保留，离开页面后不保证保留；要长期保留，请分别保存。连接测试不自动保存配置。

## 协议与参数

| 协议 | 请求路径 | 系统提示词 | 输出长度参数 |
| --- | --- | --- | --- |
| OpenAI Chat Completions | `/chat/completions` | `messages` 中的 system 消息 | 自动或手选 `max_tokens` / `max_completion_tokens` |
| OpenAI Responses | `/responses` | `instructions` | `max_output_tokens` |
| Anthropic Messages | `/messages` | 顶层 `system` | 必填 `max_tokens` |
| Google Gemini 原生 | `/models/{模型}:generateContent` 或 `:streamGenerateContent?alt=sse` | `systemInstruction` | `generationConfig.maxOutputTokens` |

Chat Completions 自动模式对常见 o1/o3/o4 和 GPT-5～GPT-9 名称使用 `max_completion_tokens`，其他名称使用 `max_tokens`。使用自定义部署名或未来模型时，建议按接口要求手动选择，避免仅凭名称推断。

除 Claude 必填输出长度外，可以选择“不发送”让服务决定默认输出上限。不同模型允许的最大输出长度、推理预算和随机性范围由服务决定，本模块不把某个供应商的上限当作所有模型的上限。OpenAI 新预设默认不发送 temperature；旧配置会保留原有发送行为。

Responses 请求默认带 `store: false`。这只是请求参数，不构成对服务商数据政策的承诺。

## 地址填写

- 支持 Base URL 和已包含 `/chat/completions`、`/responses`、`/messages` 或 Gemini 生成路径的完整 URL。
- 会去掉已知的请求后缀，再按协议拼接；保留中转路径、部署路径、版本和查询参数。
- 不会擅自补 `/v1`。例如百炼的 `/compatible-mode/v1`、智谱的 `/api/paas/v4` 应完整保留。
- Azure 兼容网关可填写含部署路径及 `api-version` 查询参数的 Chat Completions 地址，使用 `api-key` 认证和实际部署名称；具体云平台的模型发现接口可能不同，可手动填写。
- 模型列表从对应根路径的 `/models` 获取。Gemini 自动分页并筛选支持 `generateContent` 的模型；Anthropic 支持 ID 分页。其他兼容接口读取当前响应的 `data[].id`，不保证第三方自定义分页协议。
- 密钥不能放在 URL 查询参数中，避免在地址预览、日志或历史中暴露。

部分服务商的不同地域、通用 API、订阅套餐与专属网关使用不同地址和密钥；预设不是所有套餐的通用入口，应以账号的实际 API 文档为准。

## 高级配置示例

附加参数必须为 JSON 对象，直接合并到请求体顶层。例如服务明确支持时：

```json
{"enable_thinking": false}
```

```json
{"reasoning_effort": "low"}
```

Gemini 的生成配置可以嵌套填写：

```json
{"generationConfig": {"thinkingConfig": {"thinkingBudget": 0}}}
```

这些参数不是所有模型都支持，不能盲目通用。标准模型、消息、流式和长度参数不能用附加参数覆盖；请使用页面对应字段。Gemini 的 temperature / maxOutputTokens 也以页面开关为准。

自定义请求头值必须为字符串，例如：

```json
{"OpenAI-Organization": "org-example"}
```

认证头和 Content-Type 由认证、协议设置统一管理，不允许在附加请求头重复覆盖。Anthropic 默认提供版本头和浏览器直连头；版本头可按兼容网关要求调整。

## 请求行为和错误提示

- 同时支持标准 SSE 和非流式 JSON；服务忽略流式参数而返回 JSON 时可读取完整回复。
- SSE 解析支持跨字节 UTF-8、CR/LF、注释心跳、多行 data 和无换行的最后事件，修复旧实现丢失末尾文本的问题。
- 只将正文交给写作助手，不把 Claude thinking、Gemini thought 或 OpenAI reasoning_content 当作正文。
- 流内错误、无正文、已知截断、内容拦截和没有完成标记的异常断流会提示失败，避免把未完成的响应当作成功同步。
- 超时覆盖连接和读取响应的整个过程，默认 180 秒，可设为 5～1800 秒；可手动停止请求。
- 401 / 403 / 404 / 429 提供对应的密钥、权限、地址或额度排查提示。
- 不自动重试生成，避免在不了解服务计费和请求完成状态时重复请求。
- 不打印密钥及密钥前缀；展示错误时替换与当前密钥相同的文本。

## 存储和兼容边界

继续使用 `novel-agent-settings`，持久化版本从 0 升为 1。旧的平铺配置迁移时保留原地址、密钥、模型和生成参数，默认按原来的 Chat Completions 协议解释，并建立当前服务商的配置档案。旧腾讯地址也会原样保留，避免升级时悄悄改变用户的中转地址；需要官方新地址时可手动修改。

配置和密钥保存在当前浏览器 localStorage，未加密，也没有上传到应用后端保存。不要把本地存储描述为保险箱。请求从浏览器直连用户指定的模型服务，本次未引入服务器代理；服务必须允许当前页面来源的 CORS，HTTPS 页面访问 HTTP 服务还可能受浏览器限制。本地 Ollama / LM Studio 需启动服务并配置允许来源。

兼容目标是四种协议的文本生成模型。工具调用、图像、音频、视频、向量模型和 AWS Bedrock 等云平台签名认证不在此次范围。网页产品订阅不代表拥有对应 API 权限或额度。未使用真实服务商凭据逐家验证，不承诺所有模型、账户和中转接口都可调用；以实际连接测试与写作请求结果为准。

## 开发结构

| 文件 | 责任 |
| --- | --- |
| `src/lib/modelConfig.ts` | 服务商预设、配置类型、地址规范化、校验和迁移 |
| `src/stores/settingsStore.ts` | 当前启用配置、服务商配置档案、统一保存 |
| `src/services/modelService.ts` | 四种协议的请求、正文提取、SSE、模型发现、超时与测试 |
| `src/services/deepseek.ts` | 保留旧写作面板接口的兼容适配器，委托 ModelService |
| `src/components/settings/SettingsView.tsx` | 配置草稿、模型列表、测试及保存 UI |
| `src/components/layout/AgentPanel.tsx` | 完整配置检测、本地免密钥模型和停止生成 |
| `tests/modelService.test.mjs` | 模拟网络的协议和迁移回归测试 |

## 验证

仓库根目录执行：

```powershell
npm run test:models
npm run build
```

定向 Lint（进入 `packages/frontend` 后）：

```powershell
node ../../node_modules/eslint/bin/eslint.js src/lib/modelConfig.ts src/stores/settingsStore.ts src/services/modelService.ts src/services/deepseek.ts src/components/settings/SettingsView.tsx
```

本次 20 项协议回归测试全部通过，前后端构建通过，以上五个核心配置与服务文件的定向 Lint 通过。浏览器冒烟使用隔离上下文和模拟接口，验证旧配置迁移、获取并选择模型、流式连接测试、保存后刷新恢复、服务商密钥隔离，以及免密钥模型通过写作面板发送请求并持久化回复；页面未出现未捕获异常。

测试不消耗 API 额度。全项目仍有既存 Lint 问题（如其他模块的 any、Hook 依赖及 AgentPanel 原有 switch 声明），未在此次模型设置升级中扩大修复范围。真实账户的权限、额度、CORS 和地域网络仍需在用户环境中测试。

## 官方协议参考

- [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [OpenAI Responses 流式输出](https://developers.openai.com/api/docs/guides/streaming-responses)
- [Claude 流式 Messages](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Gemini 生成接口](https://ai.google.dev/api/generate-content)、[模型列表](https://ai.google.dev/api/models)
- [阿里云百炼地址说明](https://help.aliyun.com/en/model-studio/base-url)
- [腾讯混元 OpenAI 兼容接口](https://cloud.tencent.cn/document/product/1729/111007)
- [硅基流动快速开始](https://docs.siliconflow.cn/docs/userguide/quickstart)
- [Ollama OpenAI 兼容接口](https://docs.ollama.com/api/openai-compatibility)
