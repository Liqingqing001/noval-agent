export type ModelProtocol = 'openai' | 'responses' | 'anthropic' | 'gemini';
export type AuthMode = 'bearer' | 'x-api-key' | 'api-key' | 'none';
export type TokenParameter = 'auto' | 'max_tokens' | 'max_completion_tokens' | 'omit';
export type APIProvider = 'deepseek' | 'openai' | 'anthropic' | 'gemini' | 'qwen' | 'zhipu' | 'moonshot' | 'siliconflow' | 'tencent' | 'ollama' | 'lmstudio' | 'custom';

export interface ModelConfig {
  apiProvider: APIProvider;
  protocol: ModelProtocol;
  apiKey: string;
  authMode: AuthMode;
  baseUrl: string;
  model: string;
  temperature: number;
  sendTemperature: boolean;
  maxTokens: number;
  tokenParameter: TokenParameter;
  stream: boolean;
  timeoutSeconds: number;
  extraBody: string;
  extraHeaders: string;
}

interface ProviderPreset {
  name: string;
  baseUrl: string;
  protocol: ModelProtocol;
  defaultModel: string;
  helpUrl: string;
  authMode?: AuthMode;
  hint?: string;
}

export const PROTOCOL_NAMES: Record<ModelProtocol, string> = {
  openai: 'OpenAI Chat Completions（兼容接口）', responses: 'OpenAI Responses',
  anthropic: 'Anthropic Messages（Claude）', gemini: 'Google Gemini 原生接口',
};

export const API_PRESETS: Record<APIProvider, ProviderPreset> = {
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', protocol: 'openai', defaultModel: 'deepseek-chat', helpUrl: 'https://api-docs.deepseek.com/' },
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', protocol: 'responses', defaultModel: '', helpUrl: 'https://developers.openai.com/api/docs/', hint: '获取模型列表后选择文本模型；部分推理模型不支持随机性参数。' },
  anthropic: { name: 'Anthropic / Claude', baseUrl: 'https://api.anthropic.com/v1', protocol: 'anthropic', defaultModel: '', authMode: 'x-api-key', helpUrl: 'https://platform.claude.com/docs/' },
  gemini: { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', protocol: 'gemini', defaultModel: '', helpUrl: 'https://ai.google.dev/gemini-api/docs' },
  qwen: { name: '阿里云百炼 / 通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', protocol: 'openai', defaultModel: 'qwen-plus', helpUrl: 'https://help.aliyun.com/zh/model-studio/', hint: '预设为北京地域通用接口；其他地域或专属网关请修改地址，并使用匹配的密钥。' },
  zhipu: { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', protocol: 'openai', defaultModel: '', helpUrl: 'https://docs.bigmodel.cn/' },
  moonshot: { name: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn/v1', protocol: 'openai', defaultModel: '', helpUrl: 'https://platform.moonshot.cn/docs' },
  siliconflow: { name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', protocol: 'openai', defaultModel: '', helpUrl: 'https://docs.siliconflow.cn/' },
  tencent: { name: '腾讯混元', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', protocol: 'openai', defaultModel: '', helpUrl: 'https://cloud.tencent.com/document/product/1729/111007' },
  ollama: { name: 'Ollama（本地）', baseUrl: 'http://localhost:11434/v1', protocol: 'openai', defaultModel: '', authMode: 'none', helpUrl: 'https://docs.ollama.com/api/openai-compatibility', hint: '先启动 Ollama 并下载模型，使用实际安装的模型名称及标签。' },
  lmstudio: { name: 'LM Studio（本地）', baseUrl: 'http://localhost:1234/v1', protocol: 'openai', defaultModel: '', authMode: 'none', helpUrl: 'https://lmstudio.ai/docs/developer/openai-compat', hint: '先加载模型并启动本地服务，允许当前网页来源访问。' },
  custom: { name: '自定义 / 中转 / vLLM', baseUrl: '', protocol: 'openai', defaultModel: '', helpUrl: '', hint: '填写实际 API 地址并选择对应协议。Azure 等网关可使用 api-key 认证和自定义请求头。' },
};

export function createDefaultConfig(apiProvider: APIProvider): ModelConfig {
  const preset = API_PRESETS[apiProvider];
  return {
    apiProvider, protocol: preset.protocol, baseUrl: preset.baseUrl, model: preset.defaultModel,
    apiKey: '', authMode: preset.authMode ?? 'bearer', temperature: 0.7,
    sendTemperature: apiProvider !== 'openai', maxTokens: 8192, tokenParameter: 'auto',
    stream: true, timeoutSeconds: 180, extraBody: '', extraHeaders: '',
  };
}

export function parseJsonObject(value: string, label: string): Record<string, unknown> {
  if (!value.trim()) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error(`${label}必须是有效的 JSON 对象`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label}必须是 JSON 对象`);
  return parsed as Record<string, unknown>;
}

// Preserve gateway/deployment prefixes and query strings; never force a /v1 prefix.
export function apiRoot(baseUrl: string): URL {
  const url = new URL(baseUrl.trim());
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/(chat\/completions|responses|messages|models\/[^/]+:(?:streamGenerateContent|generateContent))$/, '');
  url.searchParams.delete('alt');
  return url;
}

export function endpoint(config: ModelConfig, operation: 'chat' | 'models', stream = config.stream): string {
  const url = apiRoot(config.baseUrl);
  const suffix = operation === 'models' ? 'models' : config.protocol === 'openai' ? 'chat/completions'
    : config.protocol === 'responses' ? 'responses' : config.protocol === 'anthropic' ? 'messages'
    : `models/${encodeURIComponent(config.model.replace(/^models\//, ''))}:${stream ? 'streamGenerateContent' : 'generateContent'}`;
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${suffix}`;
  if (config.protocol === 'gemini' && operation === 'chat' && stream) url.searchParams.set('alt', 'sse');
  return url.toString();
}

export function validateConfig(config: ModelConfig, requireModel = true): string[] {
  const errors: string[] = [];
  if (!Object.hasOwn(API_PRESETS, config.apiProvider)) errors.push('请选择有效的服务商');
  if (!Object.hasOwn(PROTOCOL_NAMES, config.protocol)) errors.push('请选择有效的接口协议');
  if (!['bearer', 'x-api-key', 'api-key', 'none'].includes(config.authMode)) errors.push('请选择有效的认证方式');
  if (!['auto', 'max_tokens', 'max_completion_tokens', 'omit'].includes(config.tokenParameter)) errors.push('请选择有效的 Token 参数');
  try {
    const url = new URL(config.baseUrl.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error();
    if ([...url.searchParams.keys()].some(k => /^(key|api[-_]?key|token|access_token)$/i.test(k))) errors.push('请将密钥填入 API Key，不要放在地址查询参数中');
  } catch { errors.push('请输入有效的 HTTP(S) API 地址，不要包含账号密码或片段'); }
  if (requireModel && !config.model.trim()) errors.push('请输入模型 ID，或先获取模型列表');
  if ((config.protocol === 'gemini' || config.authMode !== 'none') && !config.apiKey.trim()) errors.push('请输入 API Key；免认证本地服务请选择“无需认证”');
  if (!Number.isFinite(config.temperature) || config.temperature < 0 || config.temperature > 2) errors.push('随机性应为 0 到 2 之间的数值');
  if (!Number.isSafeInteger(config.maxTokens) || config.maxTokens < 1) errors.push('最大输出 Tokens 应为正整数');
  if (!Number.isFinite(config.timeoutSeconds) || config.timeoutSeconds < 5 || config.timeoutSeconds > 1800) errors.push('超时时间应为 5 到 1800 秒');
  if (config.protocol === 'anthropic' && config.tokenParameter === 'omit') errors.push('Anthropic Messages 必须提供最大输出 Tokens');
  try {
    const extra = parseJsonObject(config.extraBody, '附加参数');
    const reserved = ['model', 'messages', 'input', 'instructions', 'system', 'contents', 'systemInstruction', 'stream', 'temperature', 'max_tokens', 'max_completion_tokens', 'max_output_tokens'];
    if (Object.keys(extra).some(k => reserved.includes(k))) errors.push('附加参数不能覆盖模型、消息、流式开关或已有生成参数，请使用对应设置');
    if (extra.generationConfig !== undefined && (!extra.generationConfig || typeof extra.generationConfig !== 'object' || Array.isArray(extra.generationConfig))) errors.push('generationConfig 必须是 JSON 对象');
    for (const [key, value] of Object.entries(parseJsonObject(config.extraHeaders, '自定义请求头'))) {
      if (typeof value !== 'string' || /[\r\n]/.test(value) || !/^[!#$%&'*+.^_`|~\w-]+$/.test(key)) errors.push('请求头名称必须有效，值必须是无换行的字符串');
      if (/^(authorization|x-api-key|api-key|x-goog-api-key|content-type|host|cookie|origin|content-length)$/i.test(key)) errors.push(`请求头 ${key} 请通过认证及协议设置配置`);
    }
  } catch (error) { errors.push(error instanceof Error ? error.message : '附加配置无效'); }
  return errors;
}

export const isModelConfigured = (config: ModelConfig) => validateConfig(config).length === 0;
export function normalizeConfig(config: ModelConfig): ModelConfig {
  const flat = Object.fromEntries(Object.keys(createDefaultConfig('deepseek')).map(key => [key, config[key as keyof ModelConfig]])) as unknown as ModelConfig;
  return { ...flat, apiKey: flat.apiKey.trim(), model: flat.model.trim(), baseUrl: flat.baseUrl.trim().replace(/\/+$/, '') };
}

// Keep the exact legacy endpoint/key/model instead of overwriting it with a provider preset.
export function migrateSettings(value: unknown): ModelConfig & { profiles: Partial<Record<APIProvider, ModelConfig>> } {
  const old = value && typeof value === 'object' ? value as Partial<ModelConfig> & { profiles?: Partial<Record<APIProvider, ModelConfig>> } : {};
  const provider = old.apiProvider && Object.hasOwn(API_PRESETS, old.apiProvider) ? old.apiProvider : 'custom';
  const config: ModelConfig = { ...createDefaultConfig(provider), ...old, apiProvider: provider, protocol: old.protocol ?? 'openai', sendTemperature: old.sendTemperature ?? true };
  // Avoid recursively embedding profiles inside a profile.
  const { profiles: previousProfiles, ...flat } = config as ModelConfig & { profiles?: Partial<Record<APIProvider, ModelConfig>> };
  return { ...flat, profiles: { ...previousProfiles, [provider]: flat } };
}
