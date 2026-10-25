import { apiRoot, endpoint, isModelConfigured, normalizeConfig, parseJsonObject, validateConfig } from '../lib/modelConfig';
import type { ModelConfig } from '../lib/modelConfig';

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export type GenerationPhase = 'connecting' | 'waiting' | 'reasoning' | 'streaming' | 'non-streaming';
export interface GenerateOptions {
  messages: ChatMessage[];
  signal?: AbortSignal;
  onStream?: (content: string) => void;
  onProgress?: (phase: GenerationPhase) => void;
}
type Json = Record<string, unknown>;
const object = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown): string => typeof value === 'string' ? value : '';
const textParts = (value: unknown): string => typeof value === 'string' ? value : array(value)
  .filter(part => !object(part).thought && !['thinking', 'reasoning', 'redacted_thinking'].includes(string(object(part).type)))
  .map(part => string(object(part).text)).join('');

export function requestHeaders(config: ModelConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.protocol === 'gemini') headers['x-goog-api-key'] = config.apiKey;
  else if (config.authMode === 'bearer') headers.Authorization = `Bearer ${config.apiKey}`;
  else if (config.authMode !== 'none') headers[config.authMode] = config.apiKey;
  if (config.protocol === 'anthropic') {
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }
  return { ...headers, ...parseJsonObject(config.extraHeaders, '自定义请求头') as Record<string, string> };
}

export function buildRequestBody(config: ModelConfig, messages: ChatMessage[], stream: boolean): Json {
  const extra = parseJsonObject(config.extraBody, '附加参数');
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const conversation = messages.filter(m => m.role !== 'system');
  const temperature = config.sendTemperature ? { temperature: config.temperature } : {};
  const limit = config.tokenParameter !== 'omit';
  if (config.protocol === 'gemini') {
    const generationConfig = { ...object(extra.generationConfig), ...temperature,
      ...(limit ? { maxOutputTokens: config.maxTokens } : {}) };
    // An unchecked UI parameter must be absent even if the user supplied a nested extra config.
    if (!config.sendTemperature) delete generationConfig.temperature;
    if (!limit) delete generationConfig.maxOutputTokens;
    return { ...extra, contents: conversation.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), generationConfig };
  }
  if (config.protocol === 'anthropic') {
    const merged: ChatMessage[] = [];
    for (const message of conversation) {
      const previous = merged.at(-1);
      if (previous?.role === message.role) previous.content += `\n\n${message.content}`;
      else merged.push({ ...message });
    }
    return { ...extra, model: config.model, messages: merged, ...(system ? { system } : {}),
      ...temperature, max_tokens: config.maxTokens, stream };
  }
  if (config.protocol === 'responses') return {
    ...extra, model: config.model, input: conversation, ...(system ? { instructions: system } : {}),
    ...temperature, ...(limit ? { max_output_tokens: config.maxTokens } : {}), stream, store: false,
  };
  const tokenKey = config.tokenParameter === 'auto'
    ? (/^(o[134](?:-|$)|gpt-[5-9](?:[.-]|$))/i.test(config.model) ? 'max_completion_tokens' : 'max_tokens')
    : config.tokenParameter;
  return { ...extra, model: config.model, messages, ...temperature,
    ...(limit ? { [tokenKey]: config.maxTokens } : {}), stream };
}

// Incremental SSE framing: UTF-8, CR/LF, comments, multiline data and an unterminated final event.
export async function consumeSSE(response: Response, onEvent: (data: string, event: string) => boolean | void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('服务没有返回可读取的响应流');
  const decoder = new TextDecoder();
  let buffer = '', event = '', data: string[] = [];
  let stopped = false;
  const dispatch = () => {
    if (data.length) stopped = onEvent(data.join('\n'), event) === false;
    data = []; event = '';
  };
  const line = (value: string) => {
    if (!value) { dispatch(); return; }
    if (value.startsWith(':')) return;
    const colon = value.indexOf(':');
    const field = colon < 0 ? value : value.slice(0, colon);
    const content = colon < 0 ? '' : value.slice(colon + 1).replace(/^ /, '');
    if (field === 'data') data.push(content);
    if (field === 'event') event = content;
  };
  const drain = (final: boolean) => {
    while (!stopped) {
      const index = buffer.search(/[\r\n]/);
      if (index < 0 || (!final && index === buffer.length - 1 && buffer[index] === '\r')) break;
      const width = buffer[index] === '\r' && buffer[index + 1] === '\n' ? 2 : 1;
      line(buffer.slice(0, index)); buffer = buffer.slice(index + width);
    }
    if (final && !stopped) { if (buffer) line(buffer); buffer = ''; dispatch(); }
  };
  try {
    while (!stopped) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      drain(done);
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function providerError(value: Json): string {
  const error = object(value.error);
  return string(error.message) || string(value.message) || string(value.error);
}

function checkResult(value: Json, protocol: ModelConfig['protocol']): void {
  if (value.error || value.type === 'error' || ['response.failed', 'response.incomplete'].includes(string(value.type))) {
    const response = object(value.response);
    throw new Error(providerError(value) || providerError(response) || '模型生成未完成，请调整输出上限或附加参数后重试');
  }
  const choice = object(array(value.choices)[0]);
  const candidate = object(array(value.candidates)[0]);
  const reason = string(choice.finish_reason) || string(candidate.finishReason) || string(value.stop_reason);
  if (['length', 'MAX_TOKENS', 'max_tokens'].includes(reason) || value.status === 'incomplete') throw new Error('已达到输出 Tokens 上限，内容未完成；请提高上限或缩短请求');
  if (['content_filter', 'SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(reason) || object(value.promptFeedback).blockReason) throw new Error('模型服务拦截了本次内容，请修改请求后重试');
  if (protocol === 'responses' && value.status === 'failed') throw new Error(providerError(value) || '模型生成失败');
}

function responseText(value: Json, protocol: ModelConfig['protocol']): string {
  checkResult(value, protocol);
  if (protocol === 'anthropic') return textParts(value.content);
  if (protocol === 'gemini') return textParts(object(object(array(value.candidates)[0]).content).parts);
  if (protocol === 'responses') return string(value.output_text) || array(value.output)
    .filter(item => object(item).type === 'message').map(item => textParts(object(item).content)).join('');
  const message = object(object(array(value.choices)[0]).message);
  return textParts(message.content) || string(message.refusal);
}

export class ModelService {
  readonly config: ModelConfig;
  constructor(config: ModelConfig) { this.config = normalizeConfig(config); }
  isConfigured(): boolean { return isModelConfigured(this.config); }

  private async connection<T>(requireModel: boolean, signal: AbortSignal | undefined, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const errors = validateConfig(this.config, requireModel);
    if (errors.length) throw new Error(errors[0]);
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, this.config.timeoutSeconds * 1000);
    try { return await action(controller.signal); }
    catch (error) {
      let message = timedOut ? `请求超时（${this.config.timeoutSeconds} 秒），请检查服务或延长超时时间`
        : controller.signal.aborted ? '请求已取消'
        : error instanceof TypeError ? '无法连接模型服务，请检查地址、网络和服务端 CORS；HTTPS 页面访问本地 HTTP 服务也可能被浏览器阻止'
        : error instanceof Error ? error.message : '模型请求失败';
      if (this.config.apiKey) message = message.split(this.config.apiKey).join('[密钥已隐藏]');
      // Do not retain raw upstream errors as causes: they can echo credentials or private URLs.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(message);
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
  }

  private async fetchResponse(url: string, init: RequestInit): Promise<Response> {
    const response = await fetch(url, { ...init, headers: requestHeaders(this.config), redirect: 'error' });
    if (!response.ok) {
      const raw = await response.text();
      let detail = '';
      try { detail = providerError(object(JSON.parse(raw))); } catch { /* Never display HTML error pages. */ }
      const hints: Record<number, string> = {
        400: '参数或协议不兼容，可关闭随机性、调整 Token 参数或检查附加参数',
        401: '密钥无效，或密钥与接口地域、套餐不匹配', 403: '没有模型访问权限，或服务限制了来源/地域',
        404: '地址、模型 ID 或协议不匹配；模型列表接口也可能未实现',
        429: '请求过于频繁或账户额度不足',
      };
      throw new Error(`HTTP ${response.status}：${hints[response.status] || '模型服务暂时不可用'}${detail ? `（${detail.slice(0, 500)}）` : ''}`);
    }
    return response;
  }

  async generate(options: GenerateOptions): Promise<string> {
    return this.connection(true, options.signal, async signal => {
      const { config } = this;
      let phase: GenerationPhase | undefined;
      const progress = (next: GenerationPhase) => {
        if (phase !== next) { phase = next; options.onProgress?.(next); }
      };
      progress('connecting');
      const response = await this.fetchResponse(endpoint(config, 'chat'), { method: 'POST', signal,
        body: JSON.stringify(buildRequestBody(config, options.messages, config.stream)) });
      let content = '';
      const mime = response.headers.get('content-type') || '';
      if (!config.stream || mime.includes('application/json')) {
        progress('non-streaming');
        content = responseText(object(await response.json()), config.protocol);
        if (content) options.onStream?.(content);
      } else {
        progress('waiting');
        if (mime.includes('text/html')) throw new Error('该地址返回了网页，请填写模型 API 地址');
        let terminal = false;
        await consumeSSE(response, (data, event) => {
          if (data.trim() === '[DONE]') { terminal = true; return false; }
          let value: Json;
          try { value = object(JSON.parse(data)); } catch { throw new Error('模型服务返回了无效的 SSE JSON 数据，请检查协议'); }
          // Some compatible servers only set the SSE event field, not the JSON type.
          if (!value.type && event) value.type = event;
          checkResult(value, config.protocol);
          const choiceDelta = object(object(array(value.choices)[0]).delta);
          const reasoning = choiceDelta.reasoning_content || choiceDelta.reasoning ||
            ['thinking_delta', 'reasoning_delta'].includes(string(object(value.delta).type)) ||
            string(value.type).startsWith('response.reasoning') ||
            array(object(object(array(value.candidates)[0]).content).parts).some(part => object(part).thought);
          if (!content && reasoning) progress('reasoning');
          let delta = '';
          if (config.protocol === 'openai') {
            const choice = object(array(value.choices)[0]);
            delta = textParts(object(choice.delta).content);
            if (choice.finish_reason) terminal = true;
          } else if (config.protocol === 'responses') {
            if (value.type === 'response.output_text.delta') delta = string(value.delta);
            if (value.type === 'response.completed') {
              checkResult(object(value.response), config.protocol);
              if (!content) delta = responseText(object(value.response), config.protocol);
              terminal = true;
            }
          } else if (config.protocol === 'anthropic') {
            if (value.type === 'content_block_delta' && object(value.delta).type === 'text_delta') delta = string(object(value.delta).text);
            if (value.type === 'message_delta') checkResult(object(value.delta), config.protocol);
            if (value.type === 'message_stop') terminal = true;
          } else {
            delta = textParts(object(object(array(value.candidates)[0]).content).parts);
            if (object(array(value.candidates)[0]).finishReason) terminal = true;
          }
          if (delta) { content += delta; progress('streaming'); options.onStream?.(content); }
          // A provider can keep its HTTP connection open after the semantic finish event.
          if (terminal) return false;
        });
        if (!terminal) throw new Error('响应流意外结束，生成未确认完成，请重试');
      }
      if (!content.trim()) throw new Error('模型未返回正文；请确认选择的是文本生成模型，并检查推理预算或输出上限');
      return content;
    });
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    return this.connection(false, signal, async requestSignal => {
      const ids: string[] = [];
      let cursor = '';
      const seen = new Set<string>();
      // Bounded pagination for Gemini and Anthropic. Never follow arbitrary upstream next URLs.
      for (let page = 0; page < 100; page++) {
        const url = new URL(endpoint(this.config, 'models'));
        if (cursor) url.searchParams.set(this.config.protocol === 'gemini' ? 'pageToken' : 'after_id', cursor);
        const response = await this.fetchResponse(url.toString(), { method: 'GET', signal: requestSignal });
        const value = object(await response.json());
        if (value.error) throw new Error(providerError(value) || '获取模型列表失败');
        const items = this.config.protocol === 'gemini' ? array(value.models) : array(value.data);
        for (const item of items) {
          const model = object(item);
          if (this.config.protocol === 'gemini') {
            if (array(model.supportedGenerationMethods).includes('generateContent')) ids.push(string(model.name).replace(/^models\//, ''));
          } else ids.push(string(model.id));
        }
        const next = this.config.protocol === 'gemini' ? string(value.nextPageToken)
          : this.config.protocol === 'anthropic' && value.has_more ? string(value.last_id) : '';
        if (!next) break;
        if (seen.has(next) || page === 99) throw new Error('模型列表分页异常，请手动填写模型 ID');
        seen.add(next); cursor = next;
      }
      const models = [...new Set(ids.filter(Boolean))].sort();
      if (!models.length) throw new Error('未获取到可用模型；该服务可能不提供列表接口，可手动填写模型 ID 后测试');
      return models;
    });
  }

  async testConnection(signal?: AbortSignal): Promise<{ text: string; milliseconds: number }> {
    const started = Date.now();
    // Use the actual writing configuration; lowering the budget can break reasoning-only models.
    const text = await this.generate({ messages: [{ role: 'user', content: 'Reply with only OK.' }], signal });
    return { text, milliseconds: Date.now() - started };
  }
}

export { apiRoot };
