import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// API 提供商类型
export type APIProvider = 'deepseek' | 'openai' | 'tencent' | 'custom';

// 预设配置
export const API_PRESETS: Record<APIProvider, {
  name: string;
  baseUrl: string;
  models: string[];
  defaultModel: string;
  helpUrl: string;
}> = {
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder'],
    defaultModel: 'deepseek-chat',
    helpUrl: 'https://platform.deepseek.com/',
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o',
    helpUrl: 'https://platform.openai.com/',
  },
  tencent: {
    name: '腾讯云混元',
    baseUrl: 'https://api.hunyuan.tencent.com/v1',
    models: [], // 不预设模型，让用户自己输入
    defaultModel: '',
    helpUrl: 'https://cloud.tencent.com/document/product/1729',
  },
  custom: {
    name: '自定义',
    baseUrl: '',
    models: [],
    defaultModel: '',
    helpUrl: '',
  },
};

interface SettingsState {
  // API 配置
  apiProvider: APIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;

  // 模型参数
  temperature: number;
  maxTokens: number;

  // 设置方法
  setApiProvider: (provider: APIProvider) => void;
  setApiKey: (key: string) => void;
  setBaseUrl: (url: string) => void;
  setModel: (model: string) => void;
  setTemperature: (temp: number) => void;
  setMaxTokens: (tokens: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // 默认值
      apiProvider: 'deepseek',
      apiKey: '',
      baseUrl: API_PRESETS.deepseek.baseUrl,
      model: API_PRESETS.deepseek.defaultModel,
      temperature: 0.7,
      maxTokens: 8192,

      // 设置方法
  setApiProvider: (provider) => set({ apiProvider: provider }),
  setApiKey: (key) => set({ apiKey: key }),
  setBaseUrl: (url) => set({ baseUrl: url }),
  setModel: (model) => set({ model: model }),
  setTemperature: (temp) => set({ temperature: temp }),
  setMaxTokens: (tokens) => set({ maxTokens: tokens }),
}),
{
  name: 'novel-agent-settings',
}
  )
);
