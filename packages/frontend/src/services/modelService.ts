import { apiRoot, endpoint, isModelConfigured, normalizeConfig, parseJsonObject, validateConfig } from '../lib/modelConfig';
import type { ModelConfig } from '../lib/modelConfig';
import { countOutputCharacters, estimateTextTokens } from '../lib/modelUsage';
import type { UsageContext, UsageErrorCode, UsageSource, UsageTokens } from '../lib/modelUsage';
import { useUsageStore } from '../stores/usageStore';

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export type GenerationPhase = 'connecting' | 'waiting' | 'reasoning' | 'streaming' | 'non-streaming';
export interface GenerateOptions {
  messages: ChatMessage[];
  signal?: AbortSignal;
  onStream?: (content: string) => void;
  onProgress?: (phase: GenerationPhase) => void;
  usageContext?: UsageContext & { operation?: string };
  onCallId?: (id: string) => void;
  onBudgetWarning?: (warning: string) => void;
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
export async function consumeSSE(response: Response, onEvent: (data: string, event: string) => boolean | void, options?: { complete?: () => boolean; graceMs?: number; signal?: AbortSignal }): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('服务没有返回可读取的响应流');
  const decoder = new TextDecoder();
  let buffer = '', event = '', data: string[] = [];
  let stopped = false;
  let completionDeadline: number | undefined;
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
      // Accounting trailers are optional after confirmed completion. A connection
      // timeout during this short grace period must not discard finished writing.
      if (options?.signal?.aborted && options.complete?.()) break;
      options?.signal?.throwIfAborted();
      if (options?.complete?.() && completionDeadline === undefined) completionDeadline = Date.now() + (options.graceMs ?? 150);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const remaining = completionDeadline === undefined ? undefined : completionDeadline - Date.now();
      if (remaining !== undefined && remaining <= 0) break;
      const read = reader.read();
      let chunk: ReadableStreamReadResult<Uint8Array> | null;
      try {
        chunk = remaining === undefined ? await read : await Promise.race([
          read,
          new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), remaining); }),
        ]).finally(() => { if (timer) clearTimeout(timer); });
      } catch (error) {
        if (options?.complete?.()) break;
        throw error;
      }
      if (chunk === null) break;
      const { done, value } = chunk;
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

class ModelRequestError extends Error {
  constructor(message: string, readonly usageCode: UsageErrorCode) { super(message); this.name = 'ModelRequestError'; }
}

function checkResult(value: Json, protocol: ModelConfig['protocol']): void {
  if (value.error || value.type === 'error' || ['response.failed', 'response.incomplete'].includes(string(value.type))) {
    const response = object(value.response);
    throw new ModelRequestError(providerError(value) || providerError(response) || '模型生成未完成，请调整输出上限或附加参数后重试', 'request_failed');
  }
  const choice = object(array(value.choices)[0]);
  const candidate = object(array(value.candidates)[0]);
  const reason = string(choice.finish_reason) || string(candidate.finishReason) || string(value.stop_reason);
  if (['length', 'MAX_TOKENS', 'max_tokens'].includes(reason) || value.status === 'incomplete') throw new ModelRequestError('已达到输出 Tokens 上限，内容未完成；请提高上限或缩短请求', 'output_limit');
  if (['content_filter', 'SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(reason) || object(value.promptFeedback).blockReason) throw new ModelRequestError('模型服务拦截了本次内容，请修改请求后重试', 'provider_rejected');
  if (protocol === 'responses' && value.status === 'failed') throw new ModelRequestError(providerError(value) || '模型生成失败', 'request_failed');
}

function responseText(value: Json, protocol: ModelConfig['protocol']): string {
  if (protocol === 'anthropic') return textParts(value.content);
  if (protocol === 'gemini') return textParts(object(object(array(value.candidates)[0]).content).parts);
  if (protocol === 'responses') return string(value.output_text) || array(value.output)
    .filter(item => object(item).type === 'message').map(item => textParts(object(item).content)).join('');
  const message = object(object(array(value.choices)[0]).message);
  return textParts(message.content) || string(message.refusal);
}

const tokenCount = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;

/** Provider counters are cumulative. Cached/reasoning subsets are not added twice. */
function reportedUsage(value: Json, protocol: ModelConfig['protocol']): Partial<UsageTokens> {
  const usage = protocol === 'gemini' ? object(value.usageMetadata)
    : protocol === 'responses' ? object(value.usage || object(value.response).usage)
    : protocol === 'anthropic' ? object(value.usage || object(value.message).usage) : object(value.usage);
  let inputTokens: number | undefined, outputTokens: number | undefined, totalTokens: number | undefined;
  if (protocol === 'gemini') {
    inputTokens = tokenCount(usage.promptTokenCount);
    const visible = tokenCount(usage.candidatesTokenCount), thoughts = tokenCount(usage.thoughtsTokenCount);
    if (visible !== undefined || thoughts !== undefined) outputTokens = (visible || 0) + (thoughts || 0);
    totalTokens = tokenCount(usage.totalTokenCount);
  } else if (protocol === 'anthropic') {
    const ordinary = tokenCount(usage.input_tokens), created = tokenCount(usage.cache_creation_input_tokens), cached = tokenCount(usage.cache_read_input_tokens);
    if (ordinary !== undefined || created !== undefined || cached !== undefined) inputTokens = (ordinary || 0) + (created || 0) + (cached || 0);
    outputTokens = tokenCount(usage.output_tokens);
    totalTokens = tokenCount(usage.total_tokens);
  } else {
    inputTokens = tokenCount(protocol === 'responses' ? usage.input_tokens : usage.prompt_tokens);
    outputTokens = tokenCount(protocol === 'responses' ? usage.output_tokens : usage.completion_tokens);
    totalTokens = tokenCount(usage.total_tokens);
  }
  if (inputTokens !== undefined && outputTokens === undefined && totalTokens !== undefined && totalTokens >= inputTokens) outputTokens = totalTokens - inputTokens;
  if (outputTokens !== undefined && inputTokens === undefined && totalTokens !== undefined && totalTokens >= outputTokens) inputTokens = totalTokens - outputTokens;
  return { ...(inputTokens === undefined ? {} : { inputTokens }), ...(outputTokens === undefined ? {} : { outputTokens }), ...(totalTokens === undefined ? {} : { totalTokens }) };
}

function mergeUsage(previous: Partial<UsageTokens>, next: Partial<UsageTokens>): Partial<UsageTokens> {
  const merged = { ...previous };
  for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) if (next[key] !== undefined) merged[key] = Math.max(previous[key] || 0, next[key]);
  return merged;
}

function settledUsage(reported: Partial<UsageTokens>, estimatedInputTokens: number, content: string, dispatched: boolean): { usage: UsageTokens; usageSource: UsageSource } {
  if (!dispatched) return { usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, usageSource: 'estimated' };
  const inputTokens = reported.inputTokens ?? estimatedInputTokens;
  const outputTokens = reported.outputTokens ?? estimateTextTokens(content);
  return {
    usage: { inputTokens, outputTokens, totalTokens: Math.max(inputTokens + outputTokens, reported.totalTokens || 0) },
    usageSource: reported.inputTokens !== undefined && reported.outputTokens !== undefined ? 'reported' : Object.keys(reported).length ? 'mixed' : 'estimated',
  };
}

function outputLimit(config: ModelConfig, body: Json): number | undefined {
  const value = config.protocol === 'gemini' ? object(body.generationConfig).maxOutputTokens
    : config.protocol === 'responses' ? body.max_output_tokens
    : config.protocol === 'anthropic' ? body.max_tokens : body.max_completion_tokens ?? body.max_tokens;
  const limit = tokenCount(value);
  const requestedChoices = config.protocol === 'gemini' ? object(body.generationConfig).candidateCount : config.protocol === 'openai' ? body.n : undefined;
  if (requestedChoices !== undefined && (tokenCount(requestedChoices) === undefined || !Number.isInteger(requestedChoices) || Number(requestedChoices) < 1)) return undefined;
  return limit === undefined ? undefined : Math.min(Number.MAX_SAFE_INTEGER, limit * (tokenCount(requestedChoices) || 1));
}

export class ModelService {
  readonly config: ModelConfig;
  constructor(config: ModelConfig, private readonly usageLedger: Pick<typeof useUsageStore, 'getState'> = useUsageStore) { this.config = normalizeConfig(config); }
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
      throw new ModelRequestError(message, timedOut ? 'timeout' : controller.signal.aborted ? 'cancelled' : error instanceof ModelRequestError ? error.usageCode : error instanceof TypeError ? 'network_error' : 'request_failed');
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
      throw new ModelRequestError(`HTTP ${response.status}：${hints[response.status] || '模型服务暂时不可用'}${detail ? `（${detail.slice(0, 500)}）` : ''}`, 'request_failed');
    }
    return response;
  }

  async generate(options: GenerateOptions): Promise<string> {
    const { config } = this;
    const errors = validateConfig(config, true);
    if (errors.length) throw new Error(errors[0]);
    const body = buildRequestBody(config, options.messages, config.stream);
    // Native OpenAI/DeepSeek document this option. Leave arbitrary compatible
    // gateways unchanged because unsupported stream_options can reject a request.
    if (config.stream && config.protocol === 'openai' &&
      ((config.apiProvider === 'openai' && new URL(config.baseUrl).hostname === 'api.openai.com') ||
      (config.apiProvider === 'deepseek' && new URL(config.baseUrl).hostname === 'api.deepseek.com'))) {
      body.stream_options = { include_usage: true, ...object(body.stream_options) };
    }
    // Only counts leave this scope. The ledger never receives request text, URLs or credentials.
    const estimatedInputTokens = estimateTextTokens(JSON.stringify(body)) + 16;
    const safe = (value: string | undefined) => config.apiKey && value ? value.split(config.apiKey).join('[密钥已隐藏]') : value;
    const context = options.usageContext;
    const call = await this.usageLedger.getState().beginCall({
      provider: config.apiProvider, protocol: config.protocol, model: safe(config.model) || '', operation: context?.operation,
      context: { novelId: safe(context?.novelId), sessionId: safe(context?.sessionId), sourceId: safe(context?.sourceId), retryOf: safe(context?.retryOf) },
      estimatedInputTokens, outputTokenLimit: outputLimit(config, body),
    });
    const notify = (warning: string) => { try { options.onBudgetWarning?.(warning); } catch { /* A status notification must not discard writing. */ } };
    try { options.onCallId?.(call.id); } catch { /* A metadata notification must not issue a second request. */ }
    if (call.warning) notify(call.warning);
    if (call.blockedReason) throw new ModelRequestError(call.blockedReason, 'budget_blocked');

    let content = '', dispatched = false, reported: Partial<UsageTokens> = {}, lastPublished = 0;
    const snapshot = () => ({ outputCharacters: countOutputCharacters(content), ...settledUsage(reported, estimatedInputTokens, content, dispatched), dispatched });
    const publish = (force = false) => {
      if (!force && Date.now() - lastPublished < 120) return;
      lastPublished = Date.now();
      void this.usageLedger.getState().updateCall(call.id, snapshot()).catch(() => { /* Store exposes persistence errors; final text remains available. */ });
    };
    const collect = (value: Json) => {
      const next = reportedUsage(value, config.protocol);
      if (Object.keys(next).length) { reported = mergeUsage(reported, next); publish(true); }
    };
    const finish = async (status: 'succeeded' | 'failed' | 'cancelled', errorCode?: UsageErrorCode) => {
      try { await this.usageLedger.getState().finishCall(call.id, { status, errorCode, ...snapshot() }); }
      catch { notify('本次文字仍已保留，但调用记录未能保存；请到“调用与预算”检查并备份记录。'); }
    };
    try {
      const result = await this.connection(true, options.signal, async signal => {
        let phase: GenerationPhase | undefined;
        const progress = (next: GenerationPhase) => {
          if (phase !== next) { phase = next; options.onProgress?.(next); }
        };
        const emit = (text: string) => { content = text; publish(); options.onStream?.(content); };
        progress('connecting');
        signal.throwIfAborted();
        await this.usageLedger.getState().updateCall(call.id, { dispatched: true });
        signal.throwIfAborted();
        dispatched = true;
        const response = await this.fetchResponse(endpoint(config, 'chat'), { method: 'POST', signal, body: JSON.stringify(body) });
        const mime = response.headers.get('content-type') || '';
        if (!config.stream || mime.includes('application/json')) {
          progress('non-streaming');
          const value = object(await response.json());
          collect(value);
          const text = responseText(value, config.protocol);
          if (text) emit(text);
          checkResult(value, config.protocol);
        } else {
          progress('waiting');
          if (mime.includes('text/html')) throw new ModelRequestError('该地址返回了网页，请填写模型 API 地址', 'invalid_response');
          let terminal = false, completionError: unknown;
          await consumeSSE(response, (data, event) => {
            if (data.trim() === '[DONE]') { terminal = true; return false; }
            let value: Json;
            try { value = object(JSON.parse(data)); } catch {
              if (terminal) return; // A malformed accounting trailer cannot invalidate completed text.
              throw new ModelRequestError('模型服务返回了无效的 SSE JSON 数据，请检查协议', 'invalid_response');
            }
            if (!value.type && event) value.type = event;
            collect(value);
            // OpenAI-compatible usage may arrive in a choices:[] trailer after finish_reason.
            // Accept accounting only after completion; never append a second choice or retry.
            if (terminal) return;
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
              if (value.type === 'response.completed') { if (!content) delta = responseText(object(value.response), config.protocol); terminal = true; }
            } else if (config.protocol === 'anthropic') {
              if (value.type === 'content_block_delta' && object(value.delta).type === 'text_delta') delta = string(object(value.delta).text);
              if (value.type === 'message_stop') terminal = true;
            } else {
              delta = textParts(object(object(array(value.candidates)[0]).content).parts);
              if (object(array(value.candidates)[0]).finishReason) terminal = true;
            }
            if (delta) { progress('streaming'); emit(content + delta); }
            // Save the final partial text/usage before reporting truncation or provider rejection.
            try { checkResult(value, config.protocol); }
            catch (error) {
              // A truncated OpenAI completion can still have a usage-only trailer.
              // Retain the rejection while collecting its bounded accounting tail.
              if (terminal && config.protocol === 'openai') completionError = error;
              else throw error;
            }
            if (config.protocol === 'responses' && value.type === 'response.completed') checkResult(object(value.response), config.protocol);
            if (config.protocol === 'anthropic' && value.type === 'message_delta') checkResult(object(value.delta), config.protocol);
            if (terminal && config.protocol !== 'openai') return false;
          }, config.protocol === 'openai' ? { complete: () => terminal, graceMs: 150, signal } : { signal });
          if (completionError) throw completionError;
          if (!terminal) throw new ModelRequestError('响应流意外结束，生成未确认完成，请重试', 'invalid_response');
        }
        if (!content.trim()) throw new ModelRequestError('模型未返回正文；请确认选择的是文本生成模型，并检查推理预算或输出上限', 'invalid_response');
        return content;
      });
      await finish('succeeded');
      return result;
    } catch (error) {
      const code = error instanceof ModelRequestError ? error.usageCode : options.signal?.aborted ? 'cancelled' : 'request_failed';
      await finish(code === 'cancelled' ? 'cancelled' : 'failed', code);
      throw error;
    }
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
    const text = await this.generate({ messages: [{ role: 'user', content: 'Reply with only OK.' }], signal, usageContext: { operation: '连接测试' } });
    return { text, milliseconds: Date.now() - started };
  }
}

export { apiRoot };
