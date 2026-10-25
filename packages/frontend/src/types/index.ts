export interface Novel {
  id: string;
  title: string;
  cover?: string;
  wordCount: number;
  status: 'draft' | 'writing' | 'completed';
  genre?: string;        // 题材
  summary?: string;      // 简介
  agentPrompt?: string;  // 自定义Agent提示词（每本书独立）
  createdAt: number;
  updatedAt: number;
  lastOpenedChapterId?: string;
}

export interface Chapter {
  id: string;
  novelId: string;
  title: string;
  content: string;
  wordCount: number;
  sequence: number;
  createdAt: number;
  updatedAt: number;
}

export interface Character {
  id: string;
  novelId: string;
  name: string;
  aliases: string[];
  description: string;
  appearance?: string;
  personality?: string;
  background?: string;
  firstAppearanceChapterId?: string;
  role?: 'protagonist' | 'supporting' | 'minor';
  sequence?: number;
}

export interface WorldSetting {
  id: string;
  novelId: string;
  category: string;
  title: string;
  content: string;
}

export interface Session {
  id: string;
  novelId: string;
  agentType: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  agentType?: string;
  syncStatus?: {
    state: 'pending' | 'success' | 'warning' | 'error' | 'partial';
    message: string;
  };
}

// 情节卡片 - 大纲视图核心数据
export interface PlotCard {
  id: string;
  novelId: string;
  type: 'volume' | 'chapter';  // 卷大纲 或 章节大纲
  title: string;               // 卷标题 或 章节标题
  summary: string;             // 卷情节概要 或 章节情节详情
  sequence: number;            // 排序（卷之间排序，或卷内章节排序）
  volumeId?: string;           // 章节大纲所属的卷ID（type='chapter'时）
  chapterId?: string;          // 关联的已写章节（type='chapter'时）
  status: 'pending' | 'completed';  // pending=大纲已写但章节未写, completed=章节已完成
  createdAt: number;
  updatedAt: number;
}

// 伏笔 - 用于追踪伏笔的埋下和回收
export interface Foreshadowing {
  id: string;
  novelId: string;
  title: string;
  description: string;
  plantedChapterId?: string;    // 埋下伏笔的章节
  resolvedChapterId?: string;   // 回收伏笔的章节
  plantedPlotCardId?: string;   // 埋下伏笔的情节点
  resolvedPlotCardId?: string;  // 回收伏笔的情节点
  status: 'planted' | 'hinted' | 'resolved';
  createdAt: number;
  updatedAt: number;
}

export type ViewType = 'outline' | 'chapters' | 'characters' | 'world' | 'settings';
