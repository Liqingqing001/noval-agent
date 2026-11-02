import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { API_PRESETS, PROTOCOL_NAMES, createDefaultConfig, endpoint, normalizeConfig, validateConfig } from '@/lib/modelConfig';
import type { APIProvider, ModelConfig, ModelProtocol } from '@/lib/modelConfig';
import { ModelService } from '@/services/modelService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, ExternalLink, Eye, EyeOff, Loader2, Plug, Save, Server } from 'lucide-react';
import { IS_DEMO } from '@/lib/runtime';

const controlClass = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm';
const textAreaClass = 'w-full min-h-24 rounded-md border border-input bg-background p-3 font-mono text-sm';

export function SettingsView() {
  const settings = useSettingsStore();
  const [provider, setProvider] = useState<APIProvider>(settings.apiProvider);
  const [drafts, setDrafts] = useState<Partial<Record<APIProvider, ModelConfig>>>(() => ({
    ...settings.profiles, [settings.apiProvider]: normalizeConfig(settings),
  }));
  const draft = drafts[provider] ?? createDefaultConfig(provider);
  const preset = API_PRESETS[provider];
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<'models' | 'test' | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const validation = validateConfig(draft);
  const active = settings.apiProvider === provider && JSON.stringify(normalizeConfig(settings)) === JSON.stringify(normalizeConfig(draft));
  let requestUrl = '';
  try { requestUrl = endpoint(draft, 'chat'); } catch { /* Display validation below. */ }

  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null; }, []);

  const update = <K extends keyof ModelConfig>(key: K, value: ModelConfig[K]) => {
    setDrafts(previous => ({ ...previous, [provider]: { ...draft, [key]: value } }));
    setNotice(null);
    if (['baseUrl', 'apiKey', 'protocol', 'authMode', 'extraHeaders'].includes(key)) setModels([]);
  };

  const changeProvider = (next: APIProvider) => {
    setProvider(next); setModels([]); setNotice(null); setShowKey(false);
  };

  const changeProtocol = (protocol: ModelProtocol) => {
    setDrafts(previous => ({ ...previous, [provider]: { ...draft, protocol,
      authMode: protocol === 'anthropic' ? 'x-api-key' : protocol === 'gemini' ? 'bearer' : draft.authMode,
      tokenParameter: protocol === 'anthropic' && draft.tokenParameter === 'omit' ? 'auto' : draft.tokenParameter,
    } }));
    setModels([]); setNotice(null);
  };

  const save = () => {
    try {
      settings.saveConfig(draft);
      setNotice({ kind: 'success', text: '配置已保存并启用，写作助手将使用这份配置。' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : '保存失败' }); }
  };

  const run = async (operation: 'models' | 'test') => {
    if (requestRef.current) return;
    const errors = validateConfig(draft, operation === 'test');
    if (errors.length) { setNotice({ kind: 'error', text: errors[0] }); return; }
    const controller = new AbortController();
    requestRef.current = controller; setBusy(operation); setNotice(null);
    try {
      const service = new ModelService(draft);
      if (operation === 'models') {
        const available = await service.listModels(controller.signal);
        if (requestRef.current !== controller) return;
        setModels(available);
        setNotice({ kind: 'info', text: `已获取 ${available.length} 个模型。请选择文本生成模型；列表中出现不代表已通过调用测试，也可手动输入模型 ID。` });
      } else {
        const result = await service.testConnection(controller.signal);
        if (requestRef.current !== controller) return;
        setNotice({ kind: 'success', text: `连接测试成功 · ${result.milliseconds} ms · 回复：${result.text.slice(0, 160)}${active ? '' : '。测试使用当前草稿，请保存并启用后用于写作。'}` });
      }
    } catch (error) {
      if (requestRef.current === controller) setNotice({ kind: 'error', text: error instanceof Error ? error.message : '请求失败' });
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setBusy(null); }
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6 pb-10">
        <div>
          <h2 className="text-2xl font-semibold">模型设置</h2>
          <p className="mt-2 text-sm text-muted-foreground">选择服务商 → 配置地址与密钥 → 选择模型 → 测试连接 → 保存并启用</p>
          <p className="mt-2 text-xs text-muted-foreground">当前启用：{API_PRESETS[settings.apiProvider]?.name ?? '自定义'} / {settings.model || '尚未选择模型'}</p>
        </div>
        <details className="rounded-lg border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">使用教程：离线 / 在线，从零创作一本小说</summary>
          <p className="mt-3 break-words text-sm leading-7 text-muted-foreground">
            <strong className="text-foreground">① 选择创作方式。</strong>离线手动创作指不调用模型：你自己编写设定、大纲和正文，不需要 API Key，也不产生模型费用；当前网页首次打开或刷新仍需网络，并非可断网启动的离线应用。在线 AI 创作是在设置中配置自己的模型后，让 Agent 协助构思、写作和修改；两种方式可随时配合使用。未配置模型时，公开演示的「演示正文生成效果」只是已有文字回放，不会生成新内容。
            <strong className="text-foreground">② 从零建书。</strong>电脑在左侧、手机在底部「书架」进入书架，点击右上角「＋」，输入书名并按 Enter 创建，再选中这本书；想独立创作就新建作品，无需改写《灵石起源》示例。先在「大纲」的小说信息处点击编辑按钮填写题材和简介，明确故事核心冲突、风格和结局；在「人物」添加角色，写清姓名、主角或配角定位、性格、背景与动机；在「世界观」按地点、时代、规则或力量体系建立设定；再回到「大纲」创建卷和章节大纲，为每章补上具体情节概要。大纲状态默认按已保存正文识别，旧章节可点击「重新识别正文状态」，重名时手动关联；编辑大纲可手动指定状态，或恢复「按正文自动识别」。「已完成」不代表达到目标字数或校稿完成。也可在「伏笔管理」记录铺垫并维护已埋下、已暗示、已回收状态。手动写作时，到「章节」点击「＋」新建章节、输入标题和正文；手机点击「章节目录」选章，选中后返回正文。
            <strong className="text-foreground">③ 配置在线模型。</strong>在本页选择服务商，按服务要求填写接口协议、API 地址、认证方式、API Key 和模型 ID；可获取模型列表，也可手动填写实际模型 ID。点击「测试连接」，成功后还要点击「保存并启用」，测试草稿本身不会启用配置。费用由你自己的模型账户承担，网页聊天订阅通常不等于 API 额度，接口需要允许网页的跨域访问；若使用本机模型，须先运行兼容的模型服务，再配置其地址，并满足浏览器访问限制。默认参数可先保留，长篇可按模型支持范围调大最大输出 Tokens 和超时时间；Tokens 不等于中文字数。
            <strong className="text-foreground">④ 使用 Agent 完成创作。</strong>电脑在右侧、手机点击底部「AI 助手」进入对话。Agent 就是「创作助手」，会结合当前作品的设定、大纲、相关章节和对话协助创作。新书可先发送「我想写一本校园悬疑小说，请先问我题材、主角、核心冲突、风格和结局，再帮我建立设定，先不要写正文」，按提问补全想法；确认人物和世界观后，再说「请规划两卷、每卷十章，每章包含具体情节概要」，检查大纲后发送「按第一章大纲写正文，标题为……，要求三千到四千字，使用第三人称，结尾留下悬念」。建议一次写一章，阅读并修改满意后再写下一章；篇幅不足时说明保留哪些内容、补充哪些情节，模型不保证每次精确达到字数。快捷操作同时提供「生成大纲」「优化大纲」「续写章节」「续写一章」「续写三章」「检查章节」；续写当前章节前先选中目标章节，按大纲续写前先补全情节概要，三章连续生成需要足够输出预算，检查章节默认只发送最近五章正文。助手右上角的提示词设置按钮可保存本书的长期要求，例如叙述视角、文风和禁用情节。
            <strong className="text-foreground">⑤ 检查同步与修改。</strong>完整回复中的结构化内容会尝试自动写入章节、大纲、人物或世界观，以消息下方实际同步结果为准。长回复可能折叠，可点击「展开全文」或前往对应面板阅读；同步失败先检查目标面板，再使用「重新同步到面板」，缺少格式时让助手重新输出带完整闭合标签的内容。修改时说清目标类型、准确标题、现有连续原文和替换后的文字，例如「修改章节《初见》，把『他推开木门』替换为『他轻轻推开木门』，其余不变」；多处或跨章修改逐条说明，核对执行结果，删除内容前先备份。等待时可查看生成状态，必要时点击「停止生成」；中断回复可能只保留收到的文字，不会自动写入正文。输入 /help 查看命令，/status 查看状态，/export 导出当前对话，/clear 清空当前对话，/compact 裁剪过长历史；对话裁剪后，重要要求应重新说明。
            <strong className="text-foreground">⑥ 整理与导出。</strong>正文会自动保存，也可按 Ctrl+S 立即保存；工具栏支持加粗、斜体、列表、撤销和重做，「整理空行」清理多余空段，「排版」调整字号、行距、段距和首行缩进。作品顶部「导出」可选择整本小说或当前章节，下载 TXT、Markdown 或 Word；Word 导出使用中文字体，适合 Windows 阅读。这里导出的是章节稿件，对话备份使用 /export。
            <strong className="text-foreground">⑦ 保存与备份。</strong>{IS_DEMO ? '当前公开演示无需登录，作品、对话和模型配置保存在你自己的浏览器，不会修改作者原作，也不在设备间同步；清理浏览器数据或换浏览器可能找不到作品。顶部「恢复示例」会清除本浏览器的演示作品与对话，请先导出需要的内容。' : '当前浏览器会保留本地编辑，云端同步是否成功请以实际状态为准；清理浏览器数据、迁移设备或进行重要修改前，先导出需要的稿件。'}API Key 保存在本机浏览器且未加密，请只填写可信接口，不在公共设备留存密钥；建议每完成一章就导出一次备份。
            <strong className="text-foreground">⑧ 参考作品辅助创作。</strong>书架导航中的「参考创作」支持粘贴、TXT、Markdown，单份最多 100 万个非空白字符、文件不超过 10 MiB，不再限制 80 行。检查编码与分段后完整保存，再选择识别到的章节、起止段落或完整作品；原文分页展示，可单独导出全文备份。工作台会显示分析范围、批次数和调用上限，多批次需要勾选费用确认。每批最多发送 6000 字符或 40 段，再按最多八个报告一组分层汇总文风与结构；每批核验引文，完成即保存，失败不自动重试，取消或刷新后可再次主动点击继续，复用参数匹配的已完成批次。报告标明实际分析范围，不把片段结论冒充整书结论。之后编辑文风和方法卡、填写新主题和素材，先生成并确认提纲，再写新稿；新稿仍按 500–5000 字符目标写作，不等于一次生成整本书。可编辑导出 Word、TXT、Markdown，或预览确认后新增小说章节。参考资料现存于本浏览器的 IndexedDB，旧版资料自动迁移；未保存时会提示并保留页面文字。关闭页面不会在后台继续调用，不支持 DOCX/PDF 输入或跨设备同步，重要资料请导出备份。
            <strong className="text-foreground">⑨ 人物关系画布。</strong>进入「人物」默认显示关系画布，可切换「人物列表」继续使用原档案列表。拖动头像调整位置，拖动空白平移，滚轮或加减按钮缩放；「适应画布」找回全图，展开按钮进入专注模式，Esc 退出。单击头像选择箭头起点，再单击另一人物填写关系；点击空白、再次单击起点或按 Esc 取消。原「添加关系」按钮也可选择两位人物，填写关系名称、分类、方向和备注，点击线上标签可修改或删除。双击头像（手机连续点按两下）打开详情侧栏，画布位置和缩放保持不变；人物可向上下左右自由移动，不再受零点边界限制。侧栏中可上传本地头像、修改人物档案，并维护生死、位置、伤势、目标、物品、备注及截至章节；可点击保存状态，通过应用导航切换功能时也会提交。此处是手动状态快照，不会按章自动推算、不改写正文、不自动注入 AI 历史上下文。头像、关系、状态和位置只保存在当前浏览器，不跨设备同步；下载图标可导出人物关系与状态 JSON，重要记录请及时备份。
          </p>
        </details>
        <fieldset disabled={busy !== null} className="space-y-6 disabled:opacity-70">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" />服务商</CardTitle>
              <CardDescription>预设帮助填写地址；各服务商分别保存配置，模型 ID 可自由填写。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="group" aria-label="模型服务商">
                {(Object.keys(API_PRESETS) as APIProvider[]).map(id => (
                  <button key={id} type="button" aria-pressed={provider === id} onClick={() => changeProvider(id)}
                    className={`rounded-lg border p-3 text-left text-sm transition-colors ${provider === id ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
                    {API_PRESETS[id].name}
                  </button>
                ))}
              </div>
              {preset.hint && <p className="text-xs text-muted-foreground">{preset.hint}</p>}
              {preset.helpUrl && <a href={preset.helpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">服务商官方文档<ExternalLink className="h-3 w-3" /></a>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>连接配置</CardTitle><CardDescription>地址可修改为自己的地域、部署或中转接口。切换服务商后，保存才会启用。</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="model-protocol" className="text-sm font-medium">接口协议</label>
                <select id="model-protocol" value={draft.protocol} onChange={e => changeProtocol(e.target.value as ModelProtocol)} className={controlClass}>
                  {(Object.keys(PROTOCOL_NAMES) as ModelProtocol[]).map(id => <option key={id} value={id}>{PROTOCOL_NAMES[id]}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="model-base-url" className="text-sm font-medium">API 地址（Base URL 或完整请求地址）</label>
                <Input id="model-base-url" value={draft.baseUrl} onChange={e => update('baseUrl', e.target.value)} placeholder="https://api.example.com/v1" autoComplete="off" />
                <p className="text-xs text-muted-foreground">保留服务要求的版本和路径前缀；不会自动补 /v1。支持完整的 /chat/completions、/responses、/messages 地址。</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="model-auth" className="text-sm font-medium">认证方式</label>
                <select id="model-auth" className={controlClass} value={draft.protocol === 'gemini' ? 'google' : draft.authMode} disabled={draft.protocol === 'gemini'} onChange={e => update('authMode', e.target.value as ModelConfig['authMode'])}>
                  {draft.protocol === 'gemini' && <option value="google">Google API Key（x-goog-api-key）</option>}
                  <option value="bearer">Bearer Token（OpenAI 兼容服务）</option>
                  <option value="x-api-key">x-api-key（Anthropic）</option>
                  <option value="api-key">api-key（Azure 等网关）</option>
                  <option value="none">无需认证（本地服务）</option>
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="model-api-key" className="text-sm font-medium">API Key {draft.authMode === 'none' && draft.protocol !== 'gemini' ? '（可留空，不发送）' : ''}</label>
                <div className="flex gap-2">
                  <Input id="model-api-key" type={showKey ? 'text' : 'password'} value={draft.apiKey} onChange={e => update('apiKey', e.target.value)} autoComplete="off" spellCheck={false} placeholder="填写当前服务商的 API Key" />
                  <Button type="button" variant="outline" size="icon" aria-label={showKey ? '隐藏 API Key' : '显示 API Key'} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="model-id" className="text-sm font-medium">模型 ID</label>
                <div className="flex gap-2">
                  <Input id="model-id" list="available-models" value={draft.model} onChange={e => update('model', e.target.value)} placeholder="填写实际模型 ID / 部署名称" autoComplete="off" />
                  <Button type="button" variant="outline" onClick={() => void run('models')}>获取模型列表</Button>
                </div>
                <datalist id="available-models">{models.map(model => <option key={model} value={model} />)}</datalist>
                {models.length > 0 && <select aria-label="已获取的模型" className={controlClass} value={models.includes(draft.model) ? draft.model : ''} onChange={e => { if (e.target.value) update('model', e.target.value); }}>
                  <option value="">从 {models.length} 个模型中选择，也可在上方搜索或输入</option>
                  {models.map(model => <option key={model} value={model}>{model}</option>)}
                </select>}
                <p className="text-xs text-muted-foreground">模型列表由服务返回；不支持列表接口时可手动填写。使用 API 模型 ID，不是网页聊天产品名称。</p>
              </div>
              {requestUrl && <p className="break-all text-xs text-muted-foreground">实际请求地址：{requestUrl}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>生成参数</CardTitle><CardDescription>不同模型支持的参数和长度不同，可关闭不支持的可选参数。</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.stream} onChange={e => update('stream', e.target.checked)} />流式输出（关闭后等待完整回复）</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.sendTemperature} onChange={e => update('sendTemperature', e.target.checked)} />发送随机性参数（Temperature）</label>
                <Input aria-label="随机性" type="number" min="0" max="2" step="0.1" value={Number.isNaN(draft.temperature) ? '' : draft.temperature} disabled={!draft.sendTemperature} onChange={e => update('temperature', e.target.valueAsNumber)} />
                <p className="text-xs text-muted-foreground">部分推理模型仅接受默认随机性，遇到不支持 temperature 的错误时关闭此选项。</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2"><label htmlFor="model-max-tokens" className="text-sm font-medium">最大输出 Tokens</label><Input id="model-max-tokens" type="number" min="1" step="1" value={Number.isNaN(draft.maxTokens) ? '' : draft.maxTokens} onChange={e => update('maxTokens', e.target.valueAsNumber)} /></div>
                <div className="space-y-2"><label htmlFor="model-timeout" className="text-sm font-medium">请求超时（秒）</label><Input id="model-timeout" type="number" min="5" max="1800" value={Number.isNaN(draft.timeoutSeconds) ? '' : draft.timeoutSeconds} onChange={e => update('timeoutSeconds', e.target.valueAsNumber)} /></div>
              </div>
              <div className="space-y-2">
                <label htmlFor="model-token-param" className="text-sm font-medium">输出长度参数兼容方式</label>
                <select id="model-token-param" className={controlClass} value={draft.tokenParameter} onChange={e => update('tokenParameter', e.target.value as ModelConfig['tokenParameter'])}>
                  <option value="auto">自动（按协议与常见模型名称选择）</option>
                  <option value="max_tokens" disabled={draft.protocol !== 'openai'}>max_tokens（Chat Completions）</option>
                  <option value="max_completion_tokens" disabled={draft.protocol !== 'openai'}>max_completion_tokens（Chat Completions 推理模型）</option>
                  <option value="omit" disabled={draft.protocol === 'anthropic'}>不发送（使用服务默认值）</option>
                </select>
                <p className="text-xs text-muted-foreground">Responses 使用 max_output_tokens，Gemini 使用 maxOutputTokens，Claude 使用 max_tokens。Token 包含的推理预算及最大允许值以服务商为准。</p>
              </div>
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">高级配置：附加参数与请求头</summary>
                <div className="mt-4 space-y-3">
                  <label htmlFor="model-extra-body" className="block text-sm">附加请求参数（JSON 对象）</label>
                  <textarea id="model-extra-body" className={textAreaClass} value={draft.extraBody} spellCheck={false} onChange={e => update('extraBody', e.target.value)} placeholder={'例如：{"enable_thinking": false}'} />
                  <p className="text-xs text-muted-foreground">用于服务特有参数，例如 enable_thinking、reasoning_effort。Gemini 可在 generationConfig 中填写 thinkingConfig；不要覆盖消息或已有设置。</p>
                  <label htmlFor="model-extra-headers" className="block text-sm">自定义请求头（JSON 对象，值为字符串）</label>
                  <textarea id="model-extra-headers" className={textAreaClass} value={draft.extraHeaders} spellCheck={false} onChange={e => update('extraHeaders', e.target.value)} placeholder={'例如：{"OpenAI-Organization": "org-..."}'} />
                </div>
              </details>
            </CardContent>
          </Card>
          {validation.length > 0 && <div className="rounded-lg border p-4 text-sm" aria-label="配置检查"><p className="font-medium">还需完善</p><ul className="mt-2 list-disc pl-5 space-y-1">{validation.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul></div>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={() => void run('test')}><Plug className="h-4 w-4 mr-2" />测试连接</Button>
            <Button type="button" onClick={save} disabled={validation.length > 0 || active}>{active ? <Check className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}{active ? '已保存并启用' : '保存并启用'}</Button>
          </div>
        </fieldset>
        {busy && <div className="flex items-center gap-3 text-sm" role="status"><Loader2 className="h-4 w-4 animate-spin" />{busy === 'test' ? '正在测试当前模型（将发送少量文本，可能产生 API 费用）…' : '正在获取模型列表…'}<Button variant="outline" size="sm" onClick={() => requestRef.current?.abort()}>取消请求</Button></div>}
        {notice && <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border p-4 text-sm whitespace-pre-wrap break-words ${notice.kind === 'error' ? 'border-red-400 text-red-600' : notice.kind === 'success' ? 'border-green-500 text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>{notice.text}</div>}
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>配置和密钥保存在当前浏览器的 localStorage，未加密；请求从浏览器直接发往所填地址。请使用可信服务，不要在公共设备保存密钥。</p>
          <p>测试会发送少量文本并可能产生 API 费用。网页订阅通常不等于 API 额度。第三方服务需允许当前网页来源的 CORS；本地模型需开启服务。无法连接时请检查网络、浏览器限制和服务日志。</p>
          <p>支持以上四种协议的文本模型；云平台签名认证、工具调用、图片和语音接口不在本模块范围。模型可用性以账号权限和连接测试为准。</p>
        </div>
      </div>
    </div>
  );
}
