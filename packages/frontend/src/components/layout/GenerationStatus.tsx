import { useEffect, useState } from 'react';
import type { GenerationPhase } from '@/services/modelService';

const labels: Record<GenerationPhase, string> = {
  connecting: '正在连接模型服务', waiting: '服务已连接，等待正文',
  reasoning: '模型正在推理，等待正文', streaming: '正在接收回复',
  'non-streaming': '服务使用非流式响应，完整生成后显示',
};

export function GenerationStatus({ phase, startedAt }: { phase: GenerationPhase; startedAt: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return <p role="status" className="mt-2 text-xs text-muted-foreground">{labels[phase]} · 已等待 {seconds} 秒{seconds >= 20 && phase !== 'streaming' ? '；可继续等待或停止生成' : ''}</p>;
}
