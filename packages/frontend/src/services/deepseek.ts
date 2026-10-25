// Compatibility adapter for the existing writing panel. Protocol logic lives in ModelService.
import { useSettingsStore } from '@/stores/settingsStore';
import { ModelService } from './modelService';
import type { ChatMessage, GenerateOptions } from './modelService';
import type { AgentType } from '@/types/agents';

export type { ChatMessage } from './modelService';
export interface ChatOptions extends GenerateOptions {
  messages: ChatMessage[];
  agentType: AgentType;
  onError?: (error: string) => void;
  onComplete?: (content: string) => void | Promise<void>;
}

export class DeepSeekService extends ModelService {
  constructor() { super(useSettingsStore.getState()); }
  async chat(options: ChatOptions): Promise<string> {
    return new ModelService({ ...this.config, stream: false }).generate(options);
  }
  async chatStream(options: ChatOptions): Promise<void> {
    try {
      const content = await this.generate(options);
      await options.onComplete?.(content);
    } catch (error) {
      if (!options.onError) throw error;
      options.onError(error instanceof Error ? error.message : '模型请求失败');
    }
  }
}

export function useDeepSeek() { return new DeepSeekService(); }
