// 大纲（情节点）API
import { apiGet, apiPost, apiPut, apiDelete } from './client';

export interface PlotCard {
  id: string;
  novelId: string;
  type: 'volume' | 'chapter';
  title: string;
  summary: string;
  sequence: number;
  volumeId: string | null;
  chapterId: string | null;
  status: 'pending' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export const plotCardsApi = {
  list: (novelId: string) => apiGet<{ plotCards: PlotCard[] }>(`/novels/${novelId}/plot-cards`),
  create: (novelId: string, data: Partial<PlotCard>) =>
    apiPost<{ plotCard: PlotCard }>(`/novels/${novelId}/plot-cards`, data),
  update: (id: string, data: Partial<PlotCard>) =>
    apiPut<{ plotCard: PlotCard }>(`/plot-cards/${id}`, data),
  remove: (id: string) => apiDelete<{ success: boolean }>(`/plot-cards/${id}`),
};
