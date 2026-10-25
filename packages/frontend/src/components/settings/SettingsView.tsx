import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { API_PRESETS, PROTOCOL_NAMES, createDefaultConfig, endpoint, normalizeConfig, validateConfig } from '@/lib/modelConfig';
import type { APIProvider, ModelConfig, ModelProtocol } from '@/lib/modelConfig';
import { ModelService } from '@/services/modelService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, ExternalLink, Eye, EyeOff, Loader2, Plug, Save, Server } from 'lucide-react';

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
