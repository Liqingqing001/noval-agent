import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createDefaultConfig, migrateSettings, normalizeConfig, validateConfig } from '@/lib/modelConfig';
import type { APIProvider, ModelConfig } from '@/lib/modelConfig';

export { API_PRESETS } from '@/lib/modelConfig';
export type { APIProvider } from '@/lib/modelConfig';

interface SettingsState extends ModelConfig {
  profiles: Partial<Record<APIProvider, ModelConfig>>;
  saveConfig: (config: ModelConfig) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...createDefaultConfig('deepseek'), profiles: {},
      saveConfig: (draft) => {
        const config = normalizeConfig(draft);
        const errors = validateConfig(config);
        if (errors.length) throw new Error(errors[0]);
        set(state => ({ ...config, profiles: { ...state.profiles, [config.apiProvider]: config } }));
      },
    }),
    {
      name: 'novel-agent-settings', version: 1,
      migrate: (state) => migrateSettings(state),
    }
  )
);
