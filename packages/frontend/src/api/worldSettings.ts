// 世界观 API
import { apiGet, apiPost, apiPut, apiDelete } from './client';

export interface WorldSetting {
  id: string;
  novelId: string;
  category: string;
  title: string;
  content: string;
}

export const worldSettingsApi = {
  list: (novelId: string) => apiGet<{ worldSettings: WorldSetting[] }>(`/novels/${novelId}/world-settings`),
  create: (novelId: string, data: Partial<WorldSetting>) =>
    apiPost<{ worldSetting: WorldSetting }>(`/novels/${novelId}/world-settings`, data),
  update: (id: string, data: Partial<WorldSetting>) =>
    apiPut<{ worldSetting: WorldSetting }>(`/world-settings/${id}`, data),
  remove: (id: string) => apiDelete<{ success: boolean }>(`/world-settings/${id}`),
};
