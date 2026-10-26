import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { extractContentBlocks } from '@/lib/structuredContent';
import { useNovelStore } from '@/stores/novelStore';
import type { Message, ViewType } from '@/types';

const destinations: Array<{ types: string[]; label: string; view: ViewType }> = [
  { types: ['章节'], label: '查看章节', view: 'chapters' },
  { types: ['卷', '大纲', '章节大纲'], label: '查看大纲', view: 'outline' },
  { types: ['角色'], label: '查看人物', view: 'characters' },
  { types: ['世界观'], label: '查看世界观', view: 'world' },
];

interface AssistantReplyProps {
  content: string;
  syncStatus?: Message['syncStatus'];
  streaming?: boolean;
  children: ReactNode;
}

/** Display stays compact; the original message is retained for sync, context and export. */
export function AssistantReply({ content, syncStatus, streaming = false, children }: AssistantReplyProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const setCurrentView = useNovelStore(state => state.setCurrentView);
  const sections = useMemo(() => streaming ? [] : extractContentBlocks(content), [content, streaming]);
  const synced = syncStatus?.state === 'success' && sections.length > 0;
  const legacy = !syncStatus && !streaming && sections.some(section => section.body.trim());
  const long = content.length > 600 || content.split('\n').length > 12;
  if (!synced && !long && !legacy) return <>{children}</>;

  const links = synced ? destinations.filter(destination => sections.some(section => destination.types.includes(section.type))) : [];
  const preview = content.slice(0, 240).split('\n').slice(0, 6).join('\n');
  return (
    <div className="space-y-2">
      {synced && <p className="text-sm font-medium">内容已同步，完整内容请到对应面板查看。</p>}
      {legacy && <p className="text-sm font-medium">历史回复已折叠，可展开查看或重新同步到面板。</p>}
      <div id={contentId}>
        {expanded ? <div className="max-h-96 overflow-y-auto pr-1">{children}</div> : synced || legacy ? null : (
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{preview}…</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {links.map(link => <Button key={link.view} variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCurrentView(link.view)}>{link.label}</Button>)}
        <Button variant="ghost" size="sm" className="h-7 text-xs" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(value => !value)}>
          {expanded ? '收起全文' : streaming ? '展开实时内容' : '展开全文'}
        </Button>
        <span className="text-xs text-muted-foreground">{content.length.toLocaleString()} 字符{streaming ? ' · 生成中' : ''}</span>
      </div>
    </div>
  );
}
