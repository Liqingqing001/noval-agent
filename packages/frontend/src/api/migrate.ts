// 数据迁移 API：把 localStorage 数据导入到后端
import { apiPost } from './client';

export interface ImportPayload {
  novels: any[];
  chapters: any[];
  characters: any[];
  worldSettings: any[];
  plotCards: any[];
  foreshadowings: any[];
}

export interface ImportResult {
  success: boolean;
  imported: {
    novels: number;
    chapters: number;
    characters: number;
    worldSettings: number;
    plotCards: number;
    foreshadowings: number;
  };
}

export const migrateApi = {
  importLocalData: (payload: ImportPayload) =>
    apiPost<ImportResult>('/migrate/import', payload),
};
