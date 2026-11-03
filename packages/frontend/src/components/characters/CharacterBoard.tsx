import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Plus, Minus, Maximize, Network, X, Pencil, Trash2, ImagePlus, Download, Expand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CharacterEditor } from './CharacterEditor';
import { CharacterPortrait } from './CharacterPortrait';
import { useNovelStore } from '@/stores/novelStore';
import { useAuthStore } from '@/stores/authStore';
import { characterBoardStore } from '@/stores/characterBoardStore';
import { canvasPosition, characterAvatar, defaultPosition, edgeGeometry, characterEdgePaths, emptySnapshot } from '@/lib/characterBoard';
import type { BoardPoint, CharacterEdge, CharacterSnapshot } from '@/lib/characterBoard';
import type { Character } from '@/types';
import { IS_DEMO } from '@/lib/runtime';
import { FLUSH_EDITOR_EVENT } from '@/lib/editorEvents';
import '@/styles/character-board.css';

const input = 'w-full rounded-lg border bg-background px-3 py-2 text-sm';
const lifeNames = { unknown: '未标记', alive: '存活', dead: '死亡', missing: '失踪' };
const roleNames = { protagonist: '主角', supporting: '配角', minor: '龙套' };
const edgeColors = { family: '#9d7847', ally: '#35795d', rival: '#b14f62', other: '#6c7c98' };
const newEdge = (): CharacterEdge => ({ id: crypto.randomUUID(), source: '', target: '', label: '', kind: 'other', directed: true, notes: '' });

export function CharacterBoard({ novelId }: { novelId: string }) {
  const userId = useAuthStore(state => state.user?.id);
  const store = useMemo(() => characterBoardStore(IS_DEMO ? 'browser' : userId || 'local', novelId), [userId, novelId]);
  const { data, ready, saving, error, remaps } = useStore(store);
  const allCharacters = useNovelStore(state => state.characters);
  const allChapters = useNovelStore(state => state.chapters);
  const characters = useMemo(() => allCharacters.filter(item => item.novelId === novelId).sort((a, b) => (a.sequence || 0) - (b.sequence || 0)), [allCharacters, novelId]);
  const chapters = useMemo(() => allChapters.filter(item => item.novelId === novelId).sort((a, b) => a.sequence - b.sequence), [allChapters, novelId]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<CharacterSnapshot>(emptySnapshot);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { if (ready) { try { store.getState().seedRelationships(characters); } catch (error) { setNotice(error instanceof Error ? error.message : '预设人物关系未能加载。'); } } }, [store, ready, characters]);
  const [profile, setProfile] = useState<Character | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [edge, setEdge] = useState<CharacterEdge>(newEdge);
  const [edgeOpen, setEdgeOpen] = useState(false);
  const [edgeError, setEdgeError] = useState('');
  useEffect(() => { setEdgeError(''); }, [edgeOpen]);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [moving, setMoving] = useState<Record<string, BoardPoint>>({});
  const viewport = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view); viewRef.current = view;
  const positionsRef = useRef<Record<string, BoardPoint>>({});
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [linkPoint, setLinkPoint] = useState<BoardPoint | null>(null);
  const linkSourceRef = useRef<string | null>(null);
  const pendingTap = useRef<{ id: string; at: number; x: number; y: number; timer: number } | null>(null);
  const singleTapRef = useRef<(id: string) => void>(() => {});
  const clearTap = () => { if (pendingTap.current) window.clearTimeout(pendingTap.current.timer); pendingTap.current = null; };
  const cancelLink = () => { clearTap(); linkSourceRef.current = null; setLinkSource(null); setLinkPoint(null); };
  useEffect(() => () => clearTap(), []);
  const pointer = useRef<{ pointerId: number; id?: string; x: number; y: number; origin: BoardPoint; moved: boolean; position?: BoardPoint } | null>(null);
  const touched = useRef(false);
  const current = characters.find(character => character.id === (selected && remaps[selected] || selected));
  const byId = new Map(characters.map(character => [character.id, character]));
  const visible = useMemo(() => characters.filter(character => `${character.name} ${(Array.isArray(character.aliases) ? character.aliases : []).join(' ')}`.toLowerCase().includes(query.toLowerCase())).slice(0, 500), [characters, query]);
  const visibleIds = new Set(visible.map(character => character.id));
  const positions = Object.fromEntries(characters.map((character, index) => [character.id, moving[character.id] || data.nodes[character.id]?.position || defaultPosition(index, characters.length)]));
  positionsRef.current = positions;
  const edges = data.edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  const edgeViews = characterEdgePaths(edges, positions);
  const safe = (action: () => void) => { try { action(); } catch (error) { setNotice(error instanceof Error ? error.message : '操作未完成'); } };

  const fit = () => {
    const element = viewport.current;
    const points = visible.map(character => positionsRef.current[character.id]);
    if (!element || !points.length) return;
    const minX = Math.min(...points.map(p => p.x)), minY = Math.min(...points.map(p => p.y));
    const width = Math.max(...points.map(p => p.x)) - minX + 120, height = Math.max(...points.map(p => p.y)) - minY + 140;
    const scale = Math.max(.05, Math.min(1.15, (element.clientWidth - 70) / width, (element.clientHeight - 70) / height));
    setView({ scale, x: (element.clientWidth - width * scale) / 2 - minX * scale, y: (element.clientHeight - height * scale) / 2 - minY * scale });
  };
  const zoom = (factor: number, x?: number, y?: number) => {
    const element = viewport.current; if (!element) return;
    touched.current = true;
    const cx = x ?? element.clientWidth / 2, cy = y ?? element.clientHeight / 2;
    setView(old => { const scale = Math.min(2.2, Math.max(.05, old.scale * factor)); return { scale, x: cx - (cx - old.x) * scale / old.scale, y: cy - (cy - old.y) * scale / old.scale }; });
  };
  useEffect(() => {
    const element = viewport.current; if (!element) return;
    const wheel = (event: WheelEvent) => { event.preventDefault(); const rect = element.getBoundingClientRect(); zoom(Math.exp(-event.deltaY * .0015), event.clientX - rect.left, event.clientY - rect.top); };
    element.addEventListener('wheel', wheel, { passive: false });
    const observer = new ResizeObserver(() => { if (!touched.current) fit(); }); observer.observe(element);
    return () => { element.removeEventListener('wheel', wheel); observer.disconnect(); };
  }, [ready, characters.length, query]);
  useEffect(() => { if (ready && !touched.current) fit(); }, [ready, characters.length, query]);
  useEffect(() => { if (selected && remaps[selected]) setSelected(remaps[selected]); else if (selected && !current) { setSelected(null); setDirty(false); } }, [selected, current, remaps]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || edgeOpen || profileOpen) return;
      if (pendingTap.current || linkSourceRef.current) { event.preventDefault(); cancelLink(); }
      else if (expanded) { touched.current = false; setExpanded(false); }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [expanded, edgeOpen, profileOpen]);

  const openCharacter = (id: string | null) => {
    if (dirty && !confirm('当前人物状态还没有保存，放弃本次编辑？')) return;
    setSelected(id); setState(id ? data.nodes[id]?.state || emptySnapshot() : emptySnapshot()); setDirty(false);
    touched.current = true;
    cancelLink();
  };
  const resolveId = (id: string) => store.getState().remaps[id] || id;
  singleTapRef.current = id => {
    id = resolveId(id);
    if (!byId.has(id)) return;
    const source = linkSourceRef.current && resolveId(linkSourceRef.current);
    if (source && source !== id && byId.has(source)) {
      cancelLink(); setEdge({ ...newEdge(), source, target: id }); setEdgeOpen(true);
    } else if (source === id) cancelLink();
    else {
      linkSourceRef.current = id; setLinkSource(id);
      setLinkPoint({ x: positions[id].x + 240, y: positions[id].y + 40 });
    }
  };
  const tapCharacter = (id: string, x: number, y: number) => {
    const previous = pendingTap.current;
    if (previous && resolveId(previous.id) === resolveId(id) && performance.now() - previous.at < 340 && Math.hypot(x - previous.x, y - previous.y) < 24) {
      clearTap(); openCharacter(resolveId(id)); return;
    }
    if (previous) { clearTap(); singleTapRef.current(previous.id); }
    pendingTap.current = { id, x, y, at: performance.now(), timer: window.setTimeout(() => {
      const tap = pendingTap.current; pendingTap.current = null;
      if (tap) singleTapRef.current(tap.id);
    }, 340) };
  };
  const sourceId = linkSource && resolveId(linkSource);
  const preview = sourceId && positions[sourceId] && linkPoint ? edgeGeometry(positions[sourceId], { x: linkPoint.x - 60, y: linkPoint.y - 40 }) : null;
  useEffect(() => { if (linkSourceRef.current && !byId.has(resolveId(linkSourceRef.current))) cancelLink(); }, [characters, remaps]);
  const saveState = async () => {
    if (!current) return;
    try { store.getState().editNode(current.id, { state }); await store.getState().flush(); setDirty(false); setNotice('人物状态已保存在当前浏览器，没有改写正文。'); }
    catch (error) { setNotice(error instanceof Error ? error.message : '状态尚未保存'); }
  };
  useEffect(() => {
    const id = current?.id;
    const flush = () => {
      if (!id || !dirty || !store.getState().ready) return;
      try { store.getState().editNode(id, { state }); setDirty(false); }
      catch (error) { setNotice(error instanceof Error ? error.message : '状态未保存，请先备份。'); }
    };
    window.addEventListener(FLUSH_EDITOR_EVENT, flush);
    return () => window.removeEventListener(FLUSH_EDITOR_EVENT, flush);
  }, [current?.id, state, dirty, store]);
  const saveProfile = (fields: Omit<Character, 'id' | 'novelId'>) => {
    if (profile) useNovelStore.getState().updateCharacter(profile.id, fields);
    else useNovelStore.getState().addCharacter({ ...fields, novelId, sequence: characters.length });
  };
  const saveEdge = async () => {
    setEdgeError('');
    try {
      if (!characters.some(character => character.id === edge.source) || !characters.some(character => character.id === edge.target)) throw new Error('请选择当前作品中的两位人物。');
      if (edge.source === edge.target) throw new Error('请选择不同人物，自身不建立关系线。');
      store.getState().saveEdge({ ...edge, label: edge.label.trim(), notes: edge.notes.trim() });
      await store.getState().flush(); setEdgeOpen(false); setNotice('人物关系已保存。');
    } catch (error) { setEdgeError(error instanceof Error ? error.message : '关系未保存'); }
  };
  const finishPointer = (cancel = false) => {
    const active = pointer.current; pointer.current = null;
    if (active?.id && active.moved && !cancel) safe(() => store.getState().editNode(store.getState().remaps[active.id!] || active.id!, { position: active.position || positionsRef.current[active.id!] }));
    setMoving({});
  };

  return <div className={`character-board flex h-full min-h-0 flex-col ${expanded ? 'character-board-expanded' : ''}`}>
    <header className="shrink-0 border-b bg-card/80 px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2"><h2 className="mr-auto font-semibold">人物关系画布</h2><Button size="sm" onClick={() => { cancelLink(); setProfile(null); setProfileOpen(true); }}><Plus />添加人物</Button><Button size="sm" variant="outline" disabled={!ready || characters.length < 2} onClick={() => { cancelLink(); const source = current?.id || characters[0]?.id || ''; setEdge({ ...newEdge(), source, target: characters.find(character => character.id !== source)?.id || '' }); setEdgeOpen(true); }}><Network />添加关系</Button></div>
      <div className="flex flex-wrap items-center gap-2"><input aria-label="搜索画布人物" placeholder="搜索姓名或别名…" className={`${input} min-w-0 flex-1 basis-40`} value={query} onChange={event => { touched.current = false; setQuery(event.target.value); }} /><Button size="icon" variant="outline" aria-label="缩小画布" onClick={() => zoom(.8)}><Minus /></Button><span aria-label="画布缩放比例" className="w-12 text-center text-xs">{Math.round(view.scale * 100)}%</span><Button size="icon" variant="outline" aria-label="放大画布" onClick={() => zoom(1.25)}><Plus /></Button><Button size="icon" variant="outline" aria-label="适应画布" onClick={fit}><Maximize /></Button><Button size="icon" variant="outline" aria-label={expanded ? "收起人物画布" : "展开人物画布"} title={expanded ? "退出专注（Esc）" : "展开为专注画布"} onClick={() => { touched.current = false; setExpanded(value => !value); }}><Expand /></Button><Button size="sm" variant="outline" disabled={!ready} onClick={() => safe(() => { const nodes = Object.fromEntries(characters.map((character, index) => [character.id, { ...data.nodes[character.id], position: defaultPosition(index, characters.length) }])); store.getState().layout(nodes); touched.current = false; setTimeout(fit, 0); })}>自动排布</Button><Button size="icon" variant="outline" aria-label="导出人物关系与状态" title="导出人物关系与状态（JSON）" disabled={!ready} onClick={() => { const url = URL.createObjectURL(new Blob(['\uFEFF', JSON.stringify({ novelId, characters: characters.map(({ id, name }) => ({ id, name })), ...data, nodes: Object.fromEntries(Object.entries(data.nodes).filter(([id]) => byId.has(id))), edges: data.edges.filter(edge => byId.has(edge.source) && byId.has(edge.target)) }, null, 2)], { type: 'application/json;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = '人物关系与状态.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}><Download /></Button></div>
      <p className="text-xs leading-relaxed text-muted-foreground">拖动头像移动人物，拖动空白平移，滚轮或 ± 缩放；单击头像连线，再点另一人物填写关系；双击查看档案，点击空白或 Esc 取消连线。头像和预设关系来自人物档案；画布中的头像覆盖、布局、关系调整与状态保存在当前浏览器。</p>
      <div className="character-link-hint text-xs text-primary" aria-live="polite">{sourceId && byId.has(sourceId) ? <>已选起点「{byId.get(sourceId)?.name}」，单击另一人物添加箭头。<button className="ml-2 underline" onClick={cancelLink}>取消连线</button></> : '双击 / 连续点按两下查看人物；键盘 Enter 查看，空格选择连线。'}</div>
      {characters.length > 500 && <p className="text-xs text-muted-foreground">画布最多同时展示 500 位人物，可用搜索定位其他人物，或切换人物列表。</p>}<p role="status" className="text-xs text-muted-foreground">{!ready ? error || '正在加载画布…' : saving ? '正在保存画布…' : error ? '存在未保存改动' : `画布已就绪 · ${characters.length} 位人物 · ${data.edges.filter(edge => byId.has(edge.source) && byId.has(edge.target)).length} 条关系`}</p>
      {(notice || error) && <div role={error ? 'alert' : 'status'} className="text-sm leading-relaxed">{error || notice}{error && ready && <Button size="sm" variant="outline" onClick={() => safe(() => store.getState().retry())}>重试保存画布</Button>}</div>}
    </header>
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div ref={viewport} className="character-board-viewport absolute inset-0 overflow-hidden" aria-label="人物关系画布" onPointerDown={event => {
        if (!ready || pointer.current || event.button !== 0 || (event.target as HTMLElement).closest('[data-board-control]')) return;
        const id = (event.target as HTMLElement).closest<HTMLElement>('[data-character-node]')?.dataset.characterNode;
        pointer.current = { pointerId: event.pointerId, id, x: event.clientX, y: event.clientY, origin: id ? positions[id] : { x: view.x, y: view.y }, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={event => {
        if (linkSourceRef.current && viewport.current) {
          const rect = viewport.current.getBoundingClientRect(), transform = viewRef.current;
          setLinkPoint({ x: (event.clientX - rect.left - transform.x) / transform.scale, y: (event.clientY - rect.top - transform.y) / transform.scale });
        }
        const active = pointer.current; if (!active || event.pointerId !== active.pointerId) return;
        const dx = event.clientX - active.x, dy = event.clientY - active.y;
        if (Math.hypot(dx, dy) < 4 && !active.moved) return;
        active.moved = true; clearTap(); touched.current = true;
        if (active.id) { active.position = canvasPosition({ x: active.origin.x + dx / viewRef.current.scale, y: active.origin.y + dy / viewRef.current.scale }); setMoving({ [store.getState().remaps[active.id] || active.id]: active.position }); }
        else setView(old => ({ ...old, x: active.origin.x + dx, y: active.origin.y + dy }));
      }} onPointerUp={event => { const active = pointer.current; if (!active || event.pointerId !== active.pointerId) return; if (!active.moved) { if (active.id) tapCharacter(active.id, event.clientX, event.clientY); else cancelLink(); } finishPointer(); }} onPointerCancel={event => { if (pointer.current?.pointerId === event.pointerId) finishPointer(true); }} onLostPointerCapture={event => { if (pointer.current?.pointerId === event.pointerId) finishPointer(); }}>
        <div className="character-board-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          <svg width="1" height="1" className="pointer-events-none absolute left-0 top-0 overflow-visible" aria-hidden="true"><defs>{Object.entries(edgeColors).map(([kind, color]) => <marker key={kind} id={`character-arrow-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={color} /></marker>)}</defs>{preview && <path data-link-preview d={preview.path} fill="none" stroke={edgeColors.other} strokeWidth="2.5" strokeDasharray="6 4" markerEnd="url(#character-arrow-other)" />}{edgeViews.map(({ edge: item, ...geometry }) => { return <path key={item.id} d={geometry.path} fill="none" stroke={edgeColors[item.kind]} strokeWidth={selected && item.source !== selected && item.target !== selected ? 1.3 : 2.5} opacity={selected && item.source !== selected && item.target !== selected ? .25 : .8} markerEnd={item.directed ? `url(#character-arrow-${item.kind})` : undefined} />; })}</svg>
          {edgeViews.map(({ edge: item, ...geometry }) => { return <button key={item.id} data-board-control className="character-edge-label" style={{ left: geometry.label.x, top: geometry.label.y, borderColor: edgeColors[item.kind], color: edgeColors[item.kind] }} aria-label={`编辑关系：${byId.get(item.source)?.name} ${item.label} ${byId.get(item.target)?.name}`} onClick={() => { cancelLink(); setEdge(item); setEdgeOpen(true); }}>{item.label}</button>; })}
          {visible.map(character => { const node = data.nodes[character.id]; return <button type="button" key={character.id} data-character-node={character.id} disabled={!ready} className={`character-graph-node ${selected === character.id ? 'is-selected' : ''} ${sourceId === character.id ? 'is-link-source' : ''}`} style={{ left: positions[character.id].x, top: positions[character.id].y }} aria-label={`查看人物：${character.name}`} title="单击连线，双击详情；Enter 查看，空格连线" aria-pressed={sourceId === character.id} onClick={event => { if (event.detail === 0) openCharacter(character.id); }} onKeyDown={event => { if (event.key === ' ') { event.preventDefault(); clearTap(); singleTapRef.current(character.id); return; } const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]; if (direction) { event.preventDefault(); const step = event.shiftKey ? 40 : 10; safe(() => store.getState().editNode(character.id, { position: canvasPosition({ x: positions[character.id].x + direction[0] * step, y: positions[character.id].y + direction[1] * step }) })); } }}><CharacterPortrait avatar={node?.avatar || character.avatar} name={character.name} /><strong>{character.name}</strong><span className="text-[11px] text-muted-foreground">{roleNames[character.role || 'supporting']} · {lifeNames[node?.state?.life || 'unknown']}</span>{node?.state?.location && <span className="character-node-location">{node.state.location}</span>}</button>; })}
        </div>
        {ready && !visible.length && <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">{characters.length ? '没有匹配的人物，清空搜索即可返回。' : '先添加人物，再为他们建立关系。'}</p>}
      </div>
      {current && <aside aria-label="人物详情" className="character-board-inspector absolute inset-y-0 right-0 overflow-y-auto border-l bg-card p-4 shadow-xl">
        <div className="mb-3 flex items-center gap-2"><h3 className="min-w-0 flex-1 truncate text-lg font-semibold">{current.name}</h3><Button variant="ghost" size="icon" aria-label="关闭人物详情" onClick={() => openCharacter(null)}><X /></Button></div>
        <div className="flex items-center gap-3"><CharacterPortrait avatar={data.nodes[current.id]?.avatar || current.avatar} name={current.name} className="shrink-0" /><div className="min-w-0"><p className="text-xs text-muted-foreground">{roleNames[current.role || 'supporting']}</p><label className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs text-primary"><ImagePlus size={14} />更换头像<input aria-label="上传人物头像" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={async event => { const file = event.target.files?.[0], id = current.id; event.target.value = ''; if (!file) return; try { const avatar = await characterAvatar(file); store.getState().editNode(store.getState().remaps[id] || id, { avatar }); await store.getState().flush(); setNotice('头像已保存在当前浏览器。'); } catch (error) { setNotice(error instanceof Error ? error.message : '头像读取失败'); } }} /></label></div></div>
        <div className="mt-3 space-y-2 rounded-lg border p-3 text-sm"><p className="whitespace-pre-wrap break-words">{current.description || '还没有人物简介。'}</p>{current.personality && <p className="break-words">性格：{current.personality}</p>}{current.appearance && <p className="break-words">外貌：{current.appearance}</p>}{current.background && <details><summary className="cursor-pointer">背景经历</summary><p className="mt-2 whitespace-pre-wrap break-words">{current.background}</p></details>}<Button size="sm" variant="outline" onClick={() => { setProfile(current); setProfileOpen(true); }}><Pencil />编辑人物档案</Button></div>
        <h4 className="mt-5 font-medium">当前状态 {dirty && <span className="text-xs text-amber-700">未保存</span>}</h4><p className="mt-1 text-xs leading-relaxed text-muted-foreground">手动维护的状态快照；可点击保存，切换应用功能时也会保存。不会改写正文或注入 AI 历史上下文。</p>
        <div className="mt-3 space-y-3"><label className="block text-sm">截至章节<select aria-label="人物状态截至章节" className={`${input} mt-1`} value={state.asOfChapterId} onChange={event => { setState({ ...state, asOfChapterId: event.target.value }); setDirty(true); }}><option value="">未指定章节（作者当前记录）</option>{state.asOfChapterId && !chapters.some(chapter => chapter.id === state.asOfChapterId) && <option value={state.asOfChapterId}>原关联章节已不存在，待复核</option>}{chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label><label className="block text-sm">生死状态<select aria-label="人物生死状态" className={`${input} mt-1`} value={state.life} onChange={event => { setState({ ...state, life: event.target.value as CharacterSnapshot['life'] }); setDirty(true); }}>{Object.entries(lifeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{([['location', '当前位置'], ['condition', '伤势与身体状况'], ['goal', '当前目标'], ['inventory', '持有物品'], ['notes', '状态备注']] as const).map(([field, label]) => <label key={field} className="block text-sm">{label}<textarea aria-label={label} rows={field === 'notes' ? 3 : 2} maxLength={2000} className={`${input} mt-1 resize-y`} value={state[field]} onChange={event => { setState({ ...state, [field]: event.target.value }); setDirty(true); }} /></label>)}<Button disabled={!ready || saving} onClick={() => void saveState()}>保存人物状态</Button></div>
        <h4 className="mt-5 mb-2 font-medium">关联人物</h4>{data.edges.filter(item => item.source === current.id || item.target === current.id).filter(item => byId.has(item.source) && byId.has(item.target)).map(item => <button key={item.id} className="mb-2 block w-full rounded-lg border p-2 text-left text-sm" onClick={() => openCharacter(item.source === current.id ? item.target : item.source)}>{byId.get(item.source)?.name} {item.directed ? '→' : '↔'} {byId.get(item.target)?.name}<span className="block text-xs text-muted-foreground">{item.label}</span>{item.notes && <span className="mt-1 block whitespace-pre-wrap text-xs text-muted-foreground">{item.notes}</span>}</button>)}<Button className="mt-3" size="sm" variant="outline" onClick={() => { if (confirm(`删除人物「${current.name}」及其画布关系？`)) safe(() => { useNovelStore.getState().deleteCharacter(current.id); setSelected(null); setDirty(false); }); }}><Trash2 />删除人物</Button>
      </aside>}
    </div>
    <CharacterEditor character={profile} open={profileOpen} onOpenChange={setProfileOpen} onSave={saveProfile} />
    <Dialog open={edgeOpen} onOpenChange={setEdgeOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{data.edges.some(item => item.id === edge.id) ? '编辑人物关系' : '添加人物关系'}</DialogTitle><DialogDescription>初始关系来自已保存的人物档案；在此确认的增删改保存在当前浏览器。</DialogDescription></DialogHeader>{(['source', 'target'] as const).map(field => <label key={field} className="text-sm">{field === 'source' ? '起点人物' : '终点人物'}<select aria-label={field === 'source' ? '关系起点人物' : '关系终点人物'} className={`${input} mt-1`} value={edge[field]} onChange={event => setEdge({ ...edge, [field]: event.target.value })}><option value="">请选择人物</option>{characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>)}<label className="text-sm">关系名称<input aria-label="关系名称" maxLength={40} className={`${input} mt-1`} placeholder="例如：师徒、同盟、怀疑、亲属" value={edge.label} onChange={event => setEdge({ ...edge, label: event.target.value })} /></label><label className="text-sm">关系分类<select aria-label="关系分类" className={`${input} mt-1`} value={edge.kind} onChange={event => setEdge({ ...edge, kind: event.target.value as CharacterEdge['kind'] })}><option value="family">亲属 / 师承</option><option value="ally">同盟 / 友善</option><option value="rival">敌对 / 怀疑</option><option value="other">其他</option></select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edge.directed} onChange={event => setEdge({ ...edge, directed: event.target.checked })} />显示方向箭头（不勾选表示双向）</label><label className="text-sm">关系备注<textarea aria-label="关系备注" maxLength={500} className={`${input} mt-1`} value={edge.notes} onChange={event => setEdge({ ...edge, notes: event.target.value })} /></label>{edgeError && <p role="alert" className="text-sm text-destructive">{edgeError}</p>}<DialogFooter>{data.edges.some(item => item.id === edge.id) && <Button variant="outline" onClick={() => safe(() => { store.getState().removeEdge(edge.id); setEdgeOpen(false); })}>删除关系</Button>}<Button disabled={!edge.source || !edge.target || !edge.label.trim() || !ready} onClick={() => void saveEdge()}>保存关系</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
