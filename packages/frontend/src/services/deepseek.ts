import { useSettingsStore } from '@/stores/settingsStore';
import type { AgentType } from '@/types/agents';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  agentType: AgentType;
  onStream?: (content: string) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

export class DeepSeekService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor() {
    const settings = useSettingsStore.getState();
    this.apiKey = settings.apiKey;
    this.baseUrl = settings.baseUrl;
    this.model = settings.model;
    this.temperature = settings.temperature;
    this.maxTokens = settings.maxTokens;
  }

  // 检查是否已配置
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  // 非流式调用
  async chat(options: ChatOptions): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('请先在设置中配置 DeepSeek API Key');
    }

    // 直接使用传入的 messages（已包含增强的 system prompt）
    const messages: ChatMessage[] = options.messages;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: this.temperature,
          max_tokens: this.maxTokens,
          stream: false,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || '请求失败');
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('DeepSeek API Error:', error);
      throw error;
    }
  }

  // 流式调用（打字机效果）
  async chatStream(options: ChatOptions): Promise<void> {
    if (!this.isConfigured()) {
      options.onError?.('请先在设置中配置 DeepSeek API Key');
      return;
    }

    // 直接使用传入的 messages（已包含增强的 system prompt）
    const messages: ChatMessage[] = options.messages;

    console.log('🚀 DeepSeek 发送消息:', {
      messageCount: messages.length,
      systemPromptLength: messages[0]?.content?.length || 0,
      hasUserPrompt: messages[0]?.content?.includes('【用户自定义要求】'),
      baseUrl: this.baseUrl,
      model: this.model,
    });

    // 检查配置
    if (!this.baseUrl) {
      options.onError?.('API 地址未配置，请在设置中配置 Base URL');
      return;
    }
    if (!this.model) {
      options.onError?.('模型未配置，请在设置中配置模型名称');
      return;
    }

    const requestUrl = `${this.baseUrl}/chat/completions`;
    const requestBody = {
      model: this.model,
      messages,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: true,
    };

    console.log('📤 请求详情:', {
      url: requestUrl,
      model: this.model,
      apiKeyLength: this.apiKey?.length || 0,
      apiKeyPrefix: this.apiKey?.slice(0, 8) + '...',
    });

    // 如果 URL 已经包含完整路径（如 /anthropic/chat/completions），直接使用
    const finalUrl = this.baseUrl.includes('/chat/completions')
      ? this.baseUrl
      : requestUrl;

    console.log('📤 最终请求 URL:', finalUrl);

    const startTime = Date.now();
    console.log('⏱️ 开始发送请求...');

    try {
      const response = await fetch(finalUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

    console.log('⏱️ 收到响应，耗时:', Date.now() - startTime, 'ms');

      console.log('📥 响应状态:', response.status, response.statusText);

      if (!response.ok) {
        // 尝试解析错误信息
        let errorMessage = `请求失败 (${response.status} ${response.statusText})`;
        try {
          const errorText = await response.text();
          console.log('📥 错误响应内容:', errorText);
          const error = JSON.parse(errorText);
          errorMessage = error.error?.message || error.message || errorMessage;
        } catch {
          // 无法解析 JSON，使用状态文本
          errorMessage = `${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let buffer = '';  // 处理跨 chunk 的数据

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // 流结束，确保处理完 buffer
          if (buffer.trim()) {
            this.processStreamLines(buffer, options, accumulatedContent);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // 保留最后一个可能不完整的行
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              options.onComplete?.();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                accumulatedContent += content;
                options.onStream?.(accumulatedContent);
              }
            } catch (e) {
              // 忽略解析错误，继续处理
              console.warn('Stream parse error:', e);
            }
          }
        }
      }

      // 流正常结束
      options.onComplete?.();
    } catch (error) {
      console.error('DeepSeek Stream Error:', error);
      options.onError?.(error instanceof Error ? error.message : '请求失败');
    }
  }

  // 处理流数据行
  private processStreamLines(
    lines: string,
    options: ChatOptions,
    accumulatedContent: string
  ): void {
    const lineList = lines.split('\n');
    for (const line of lineList) {
      if (line.startsWith('data: ') && line.slice(6) !== '[DONE]') {
        try {
          const parsed = JSON.parse(line.slice(6));
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            options.onStream?.(accumulatedContent);
          }
        } catch {
          // 忽略
        }
      }
    }
  }
}

// 便捷 hook
export function useDeepSeek() {
  return new DeepSeekService();
}
