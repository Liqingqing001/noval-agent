import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { ArrowLeft, Focus, History, ImagePlus, MoreHorizontal, Network, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Character, Chapter } from '@/types';
import type { CharacterEdge, CharacterNode, CharacterSnapshot } from '@/lib/characterBoard';
import { CharacterPortrait } from './CharacterPortrait';

const input = 'w-full rounded-lg border bg-background px-3 py-2 text-sm';
const lifeNames = { unknown: '未标记', alive: '存活', dead: '死亡', missing: '失踪' };
const roleNames = { protagonist: '主角', supporting: '配角', minor: '龙套' };

export interface CharacterInspectorProps {
  character: Character;
  characters: Character[];
  nodes: Record<string, CharacterNode>;
  edges: CharacterEdge[];
  chapters: Pick<Chapter, 'id' | 'title'>[];
  state: CharacterSnapshot;
  dirty: boolean;
  ready: boolean;
  saving: boolean;
  onStateChange: (state: CharacterSnapshot) => void;
  onClose: () => void;
  onFocus: () => void;
  onMore: (event: MouseEvent<HTMLButtonElement>) => void;
  onUploadAvatar: (file: File) => void | Promise<void>;
  onEditProfile: () => void;
  onTimeline: () => void;
  onSaveState: () => void | Promise<void>;
  onDelete: () => void;
  onNavigate: (id: string) => void;
  onPair: (id: string) => void;
  backLabel?: string;
  onBack?: () => void;
}

/** The open person is the anchor. Selecting a related person only changes the
 * pair summary; navigating to another profile is a separate, explicit action. */
export function CharacterInspector({ character, characters, nodes, edges, chapters, state, dirty, ready, saving,
  onStateChange, onClose, onFocus, onMore, onUploadAvatar, onEditProfile, onTimeline, onSaveState, onDelete,
  onNavigate, onPair, backLabel, onBack }: CharacterInspectorProps) {
  const aside = useRef<HTMLElement>(null);
  const [relatedId, setRelatedId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(characters.filter(person => person.novelId === character.novelId).map(person => [person.id, person])), [characters, character.novelId]);
  const relations = useMemo(() => {
    const groups = new Map<string, CharacterEdge[]>();
    for (const edge of edges) {
      if (edge.source !== character.id && edge.target !== character.id) continue;
      const otherId = edge.source === character.id ? edge.target : edge.source;
      if (otherId === character.id || !byId.has(otherId)) continue;
      const group = groups.get(otherId) || [];
      group.push(edge); groups.set(otherId, group);
    }
    // Keep related buttons in the existing character order, independent of the
    // selected row or the order in which individual relationships were edited.
    return characters.filter(person => person.novelId === character.novelId && groups.has(person.id))
      .map(person => ({ character: person, edges: groups.get(person.id)! }));
  }, [edges, character.id, character.novelId, characters, byId]);
  const selectedPair = relations.find(group => group.character.id === relatedId);

  useLayoutEffect(() => {
    setRelatedId(null);
    if (aside.current) aside.current.scrollTop = 0;
  }, [character.id]);

  return <aside ref={aside} aria-label="人物详情" data-inspector-person={character.id}
    className="character-board-inspector absolute inset-y-0 right-0 overflow-y-auto border-l bg-card p-4 shadow-xl">
    <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 border-b bg-card/95 px-4 py-3 backdrop-blur-sm">
      {backLabel && onBack && <Button variant="ghost" size="sm" className="mb-2 max-w-full justify-start px-0 text-xs" aria-label={`返回${backLabel}档案`} onClick={onBack}><ArrowLeft className="h-3 w-3 shrink-0" /><span className="truncate">返回{backLabel}</span></Button>}
      <div className="flex items-center gap-2"><h3 className="min-w-0 flex-1 truncate text-lg font-semibold" title={character.name}>{character.name}</h3><Button variant="ghost" size="icon" aria-label="关闭人物详情" onClick={onClose}><X /></Button></div>
    </div>
    <div className="mb-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={onFocus}><Focus />聚焦此人</Button><Button size="sm" variant="ghost" aria-label="人物更多操作" onClick={onMore}><MoreHorizontal />更多操作</Button></div>
    <div className="flex items-center gap-3"><CharacterPortrait avatar={nodes[character.id]?.avatar || character.avatar} name={character.name} className="shrink-0" previewable /><div className="min-w-0"><p className="text-xs text-muted-foreground">{roleNames[character.role || 'supporting']}</p><label className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs text-primary"><ImagePlus size={14} />更换头像<input aria-label="上传人物头像" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void onUploadAvatar(file); }} /></label></div></div>
    <div className="mt-3 space-y-2 rounded-lg border p-3 text-sm"><p className="whitespace-pre-wrap break-words">{character.description || '还没有人物简介。'}</p>{character.personality && <p className="break-words">性格：{character.personality}</p>}{character.appearance && <p className="break-words">外貌：{character.appearance}</p>}{character.background && <details><summary className="cursor-pointer">背景经历</summary><p className="mt-2 whitespace-pre-wrap break-words">{character.background}</p></details>}<Button size="sm" variant="outline" onClick={onEditProfile}><Pencil />编辑人物档案</Button></div>

    <section className="mt-5" aria-label={`${character.name}的关联人物`}>
      <h4 className="font-medium">关联人物 <span className="text-xs font-normal text-muted-foreground">{relations.length} 人</span></h4>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">点选人物查看双方关系，当前档案保持不变。</p>
      <div className="mt-2 max-h-56 space-y-2 overflow-y-auto overscroll-contain rounded-lg" data-related-person-list>
        {relations.map(group => <button type="button" key={group.character.id} data-related-person={group.character.id} data-related-character={group.character.id}
          aria-label={`查看与${group.character.name}的关系`} aria-pressed={relatedId === group.character.id}
          className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm ${relatedId === group.character.id ? 'border-primary bg-primary/10 text-primary' : 'bg-background hover:bg-muted/50'}`}
          onClick={() => setRelatedId(group.character.id)}><span className="min-w-0 break-words font-medium">{group.character.name}</span><span className="shrink-0 text-xs text-muted-foreground">{group.edges.length} 条关系</span></button>)}
      </div>
      {!relations.length && <p className="mt-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">还没有已记录的关联人物。</p>}
      {selectedPair && <div data-inspector-pair={selectedPair.character.id} className="mt-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
        <h5 className="break-words text-sm font-semibold">{character.name}与{selectedPair.character.name}</h5>
        <div className="mt-3 space-y-3">{selectedPair.edges.map(relation => <div key={relation.id} data-inspector-relation={relation.id} className="rounded-lg bg-card p-3 text-sm"><p className="break-words font-medium">{relation.label}</p><p className="mt-1 break-words text-xs text-primary">{byId.get(relation.source)?.name} {relation.directed ? '→' : '↔'} {byId.get(relation.target)?.name}</p>{relation.notes && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">{relation.notes}</p>}</div>)}</div>
        <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onPair(selectedPair.character.id)}><Network className="h-3 w-3 shrink-0" />只看这两人</Button><Button size="sm" variant="ghost" className="h-auto max-w-full whitespace-normal break-words text-left" onClick={() => onNavigate(selectedPair.character.id)}>查看{selectedPair.character.name}档案</Button></div>
      </div>}
    </section>

    <h4 className="mt-5 font-medium">当前状态 {dirty && <span className="text-xs text-amber-700">未保存</span>}</h4><p className="mt-1 text-xs leading-relaxed text-muted-foreground">手动维护的状态快照；可点击保存，切换应用功能时也会保存。不会改写正文或注入 AI 历史上下文。</p>
    <Button className="mt-3" size="sm" variant="outline" onClick={onTimeline}><History className="h-4 w-4" />查看人物时间线</Button>
    <div className="mt-3 space-y-3"><label className="block text-sm">截至章节<select aria-label="人物状态截至章节" className={`${input} mt-1`} value={state.asOfChapterId} onChange={event => onStateChange({ ...state, asOfChapterId: event.target.value })}><option value="">未指定章节（作者当前记录）</option>{state.asOfChapterId && !chapters.some(chapter => chapter.id === state.asOfChapterId) && <option value={state.asOfChapterId}>原关联章节已不存在，待复核</option>}{chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label><label className="block text-sm">生死状态<select aria-label="人物生死状态" className={`${input} mt-1`} value={state.life} onChange={event => onStateChange({ ...state, life: event.target.value as CharacterSnapshot['life'] })}>{Object.entries(lifeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{([['location', '当前位置'], ['condition', '伤势与身体状况'], ['goal', '当前目标'], ['inventory', '持有物品'], ['notes', '状态备注']] as const).map(([field, label]) => <label key={field} className="block text-sm">{label}<textarea aria-label={label} rows={field === 'notes' ? 3 : 2} maxLength={2000} className={`${input} mt-1 resize-y`} value={state[field]} onChange={event => onStateChange({ ...state, [field]: event.target.value })} /></label>)}<Button disabled={!ready || saving} onClick={() => void onSaveState()}>保存人物状态</Button></div>
    <Button className="mt-3" size="sm" variant="outline" onClick={onDelete}><Trash2 />删除人物</Button>
  </aside>;
}
