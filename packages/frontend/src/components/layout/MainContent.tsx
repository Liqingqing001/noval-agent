import { useState, useMemo, useCallback, useEffect } from 'react';
import { BookOpen, Pencil, Download, GripVertical, Star, Users, User } from 'lucide-react';
import { useNovelStore } from '@/stores/novelStore';
import { ChapterList } from '@/components/chapter/ChapterList';
import { ChapterEditor } from '@/components/editor/ChapterEditor';
import { SettingsView } from '@/components/settings/SettingsView';
import { OutlineView } from '@/components/outline/OutlineView';
import { CharacterEditor } from '@/components/characters/CharacterEditor';
import { WorldSettingEditor } from '@/components/world/WorldSettingEditor';
import type { ViewType, Character, WorldSetting } from '@/types';

const STORAGE_KEY_CHAPTER_LIST = 'novel-agent-chapter-list-width';

const getDefaultChapterListWidth = () => {
  const saved = localStorage.getItem(STORAGE_KEY_CHAPTER_LIST);
  if (saved) return parseInt(saved, 10);
  return 240;
};

interface MainContentProps {
  currentView: ViewType;
}

// 导出小说为 txt 文件
function exportNovelAsTxt(novelId: string) {
  const store = useNovelStore.getState();
  const novel = store.novels.find(n => n.id === novelId);
  const chapters = store.chapters
    .filter(c => c.novelId === novelId)
    .sort((a, b) => a.sequence - b.sequence);

  if (!novel || chapters.length === 0) {
    alert('没有可导出的章节');
    return;
  }

  // 构建 txt 内容
  let content = '';

  // 书名
  content += `${novel.title}\n`;
  content += `\n`;

  // 简介（如果有）
  if (novel.summary) {
    content += `简介：${novel.summary}\n`;
    content += `\n`;
  }

  content += `\n`;

  // 章节内容
  chapters.forEach((chapter, index) => {
    // 章节标题格式：适合阅读器识别
    content += `第${index + 1}章 ${chapter.title}\n`;
    content += `\n`;

    // 章节内容（去除 HTML 标签）
    const chapterText = chapter.content
      .replace(/<[^>]*>/g, '') // 去除 HTML 标签
      .replace(/&nbsp;/g, ' ') // 替换空格
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();

    content += chapterText;
    content += `\n`;
    content += `\n`; // 章节间空行分隔
  });

  // 创建并下载文件
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${novel.title}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function MainContent({ currentView }: MainContentProps) {
  const [chapterListWidth, setChapterListWidth] = useState(getDefaultChapterListWidth);
  const [isDraggingChapterList, setIsDraggingChapterList] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartWidth, setDragStartWidth] = useState(0);

  const currentNovelId = useNovelStore((state) => state.currentNovelId);
  const currentChapter = useNovelStore((state) => state.chapters.find((c) => c.id === state.currentChapterId));
  const setCurrentChapter = useNovelStore((state) => state.setCurrentChapter);
  const getCurrentNovel = useNovelStore((state) => state.getCurrentNovel);

  const novel = getCurrentNovel();

  const handleMouseDownChapterList = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragStartX(e.clientX);
    setDragStartWidth(chapterListWidth);
    setIsDraggingChapterList(true);
  }, [chapterListWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingChapterList) return;
      const deltaX = e.clientX - dragStartX;
      const newWidth = Math.max(180, Math.min(360, dragStartWidth + deltaX));
      setChapterListWidth(newWidth);
      localStorage.setItem(STORAGE_KEY_CHAPTER_LIST, newWidth.toString());
    };

    const handleMouseUp = () => {
      setIsDraggingChapterList(false);
    };

    if (isDraggingChapterList) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDraggingChapterList, dragStartX, dragStartWidth]);

  if (!currentNovelId && currentView !== 'settings') {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-muted/20">
        <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-4">
          <BookOpen className="h-12 w-12 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">欢迎使用 NovelAgent</h2>
        <p className="text-muted-foreground text-center max-w-md">
          一款 AI 靱动的小说创作助手。从左侧书架选择一本小说，或创建新书开始创作。
        </p>
      </div>
    );
  }

  // Render different views based on currentView
  const renderContent = () => {
    switch (currentView) {
      case 'outline':
        return <OutlineView />;
      case 'chapters':
        return (
          <div className="flex h-full relative">
            <ChapterList
              onSelectChapter={setCurrentChapter}
              selectedChapterId={currentChapter?.id || null}
              width={chapterListWidth}
            />
            <div
              onMouseDown={handleMouseDownChapterList}
              className={`absolute top-0 bottom-0 w-3 cursor-col-resize transition-colors z-10 ${
                isDraggingChapterList ? 'bg-foreground/30' : 'bg-transparent hover:bg-muted/50'
              }`}
              style={{ left: chapterListWidth }}
              title="拖拽调整章节目录宽度"
            >
              <div className="h-full w-1 mx-auto bg-border rounded-full" />
            </div>
            <div className="flex-1 min-w-0">
              {currentChapter ? (
                <ChapterEditor chapterId={currentChapter.id} />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  请选择一个章节开始编辑
                </div>
              )}
            </div>
          </div>
        );
      case 'characters':
        return <CharactersView />;
      case 'world':
        return <WorldView />;
      case 'settings':
        return <SettingsView />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      {currentNovelId && currentView !== 'settings' && (
        <div className="border-b border-border/50 bg-card/80 backdrop-blur-sm">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {novel?.title}
              </h1>
              <span className={`tag-creative ${
                novel?.status === 'draft' ? 'bg-amber-100 text-amber-700' :
                novel?.status === 'writing' ? 'bg-green-100 text-green-700' :
                'bg-sky-100 text-sky-700'
              }`}>
                {novel?.status === 'draft' ? '草稿' : novel?.status === 'writing' ? '创作中' : '已完成'}
              </span>
              {novel?.genre && (
                <span className="tag-creative bg-primary/10 text-primary border border-primary/20">
                  {novel.genre}
                </span>
              )}
            </div>
            <button
              onClick={() => exportNovelAsTxt(currentNovelId)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium transition-colors"
              title="导出为TXT文件"
            >
              <Download className="h-4 w-4" />
              导出
            </button>
          </div>
          {/* 简介：只在 outline 视图不显示（因为 OutlineView 自己会显示） */}
          {novel?.summary && currentView !== 'outline' && (
            <div className="px-6 pb-3">
              <p className="text-sm text-muted-foreground line-clamp-2 italic">
                "{novel.summary}"
              </p>
            </div>
          )}
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">{renderContent()}</div>
    </div>
  );
}

// 角色定位配置
const ROLE_CONFIG: Record<string, { label: string; color: string; icon: typeof Star }> = {
  protagonist: { label: '主角', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Star },
  supporting: { label: '配角', color: 'bg-sky-100 text-sky-700 border-sky-200', icon: Users },
  minor: { label: '龙套', color: 'bg-muted text-muted-foreground border-border', icon: User },
};

// 人物管理视图
function CharactersView() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const currentNovelId = useNovelStore((state) => state.currentNovelId);
  const allCharacters = useNovelStore((state) => state.characters);
  const addCharacter = useNovelStore((state) => state.addCharacter);
  const updateCharacter = useNovelStore((state) => state.updateCharacter);
  const deleteCharacter = useNovelStore((state) => state.deleteCharacter);

  // 按角色定位排序：主角 -> 配角 -> 龙套，然后按 sequence 排序
  const characters = useMemo(() => {
    if (!currentNovelId) return [];
    const filtered = allCharacters.filter((c) => c.novelId === currentNovelId);
    const roleOrder = { protagonist: 0, supporting: 1, minor: 2 };
    return filtered.sort((a, b) => {
      const aRole = a.role || 'supporting';
      const bRole = b.role || 'supporting';
      if (roleOrder[aRole] !== roleOrder[bRole]) {
        return roleOrder[aRole] - roleOrder[bRole];
      }
      return (a.sequence || 0) - (b.sequence || 0);
    });
  }, [allCharacters, currentNovelId]);

  if (!currentNovelId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        请先选择一本小说
      </div>
    );
  }

  // 打开添加弹窗
  const handleAdd = () => {
    setEditingCharacter(null);
    setEditorOpen(true);
  };

  // 打开编辑弹窗
  const handleEdit = (char: Character) => {
    setEditingCharacter(char);
    setEditorOpen(true);
  };

  // 保存角色
  const handleSave = (data: Omit<Character, 'id' | 'novelId'>) => {
    if (editingCharacter?.id) {
      updateCharacter(editingCharacter.id, data);
    } else {
      addCharacter({
        novelId: currentNovelId,
        ...data,
        sequence: characters.length,
      });
    }
  };

  // 拖拽处理
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(id);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const draggedIndex = characters.findIndex(c => c.id === draggedId);
    const targetIndex = characters.findIndex(c => c.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    // 更新 sequence
    const newCharacters = [...characters];
    const [dragged] = newCharacters.splice(draggedIndex, 1);
    newCharacters.splice(targetIndex, 0, dragged);

    // 更新所有角色的 sequence
    newCharacters.forEach((char, idx) => {
      updateCharacter(char.id, { sequence: idx });
    });

    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">人物管理</h2>
            <p className="text-sm text-muted-foreground">管理小说中的角色设定，可拖拽排序</p>
          </div>
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
          >
            添加角色
          </button>
        </div>

        {characters.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-muted/20">
            <div className="w-16 h-16 mx-auto rounded-2xl border border-border bg-background flex items-center justify-center mb-4">
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">暂无角色</p>
            <p className="text-xs text-muted-foreground mt-1">点击上方按钮添加，或在右侧 AI 面板让 AI 生成</p>
          </div>
        ) : (
          <div className="space-y-3">
            {characters.map((char) => {
              const roleInfo = ROLE_CONFIG[char.role || 'supporting'];
              return (
                <div
                  key={char.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, char.id)}
                  onDragOver={(e) => handleDragOver(e, char.id)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, char.id)}
                  onClick={() => handleEdit(char)}
                  className={`p-4 border rounded-lg transition-all bg-card cursor-pointer group ${
                    draggedId === char.id ? 'opacity-50 scale-95' : ''
                  } ${
                    dragOverId === char.id && draggedId !== char.id ? 'border-primary/50 bg-primary/5' : ''
                  } ${
                    char.role === 'protagonist' ? 'ring-2 ring-amber-200/50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* 拖拽手柄 */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing pt-1">
                      <GripVertical className="h-5 w-5 text-muted-foreground" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-medium text-lg">{char.name}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded-md border ${roleInfo.color}`}>
                          {roleInfo.label}
                        </span>
                      </div>

                      {/* 详细信息 */}
                      <div className="space-y-2">
                        {char.personality && (
                          <div>
                            <span className="text-xs text-muted-foreground font-medium">性格</span>
                            <p className="text-sm mt-1">{char.personality}</p>
                          </div>
                        )}
                        {char.background && (
                          <div>
                            <span className="text-xs text-muted-foreground font-medium">背景</span>
                            <p className="text-sm mt-1">{char.background}</p>
                          </div>
                        )}
                        {char.appearance && (
                          <div>
                            <span className="text-xs text-muted-foreground font-medium">外貌</span>
                            <p className="text-sm mt-1">{char.appearance}</p>
                          </div>
                        )}
                        {char.description && (
                          <div>
                            <span className="text-xs text-muted-foreground font-medium">描述</span>
                            <p className="text-sm mt-1">{char.description}</p>
                          </div>
                        )}
                        {char.aliases && char.aliases.length > 0 && (
                          <div>
                            <span className="text-xs text-muted-foreground font-medium">别名/称号</span>
                            <p className="text-sm mt-1">{char.aliases.join('、')}</p>
                          </div>
                        )}

                        {/* 如果没有详细信息，显示提示 */}
                        {!char.personality && !char.background && !char.appearance && !char.description && (
                          <p className="text-xs text-muted-foreground italic">点击编辑添加详细信息</p>
                        )}
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(char);
                        }}
                        className="p-2 rounded hover:bg-muted"
                        title="编辑"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('确定要删除这个角色吗？')) {
                            deleteCharacter(char.id);
                          }
                        }}
                        className="p-2 rounded hover:bg-destructive/10"
                        title="删除"
                      >
                        <button className="text-muted-foreground hover:text-destructive text-xs">删除</button>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 编辑弹窗 */}
      <CharacterEditor
        character={editingCharacter}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={handleSave}
      />
    </div>
  );
}

// 世界观管理视图
function WorldView() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSetting, setEditingSetting] = useState<WorldSetting | null>(null);

  const currentNovelId = useNovelStore((state) => state.currentNovelId);
  const allWorldSettings = useNovelStore((state) => state.worldSettings);
  const addWorldSetting = useNovelStore((state) => state.addWorldSetting);
  const updateWorldSetting = useNovelStore((state) => state.updateWorldSetting);
  const deleteWorldSetting = useNovelStore((state) => state.deleteWorldSetting);

  const worldSettings = useMemo(() => {
    if (!currentNovelId) return [];
    return allWorldSettings.filter((w) => w.novelId === currentNovelId);
  }, [allWorldSettings, currentNovelId]);

  // 按分类分组
  const groupedSettings = useMemo(() => {
    const groups: Record<string, typeof worldSettings> = {};
    worldSettings.forEach((setting) => {
      const category = setting.category || '其他';
      if (!groups[category]) groups[category] = [];
      groups[category].push(setting);
    });
    return groups;
  }, [worldSettings]);

  if (!currentNovelId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        请先选择一本小说
      </div>
    );
  }

  // 打开添加弹窗
  const handleAdd = () => {
    setEditingSetting(null);
    setEditorOpen(true);
  };

  // 打开编辑弹窗
  const handleEdit = (setting: WorldSetting) => {
    setEditingSetting(setting);
    setEditorOpen(true);
  };

  // 保存设定
  const handleSave = (data: Omit<WorldSetting, 'id' | 'novelId'>) => {
    if (editingSetting?.id) {
      updateWorldSetting(editingSetting.id, data);
    } else {
      addWorldSetting({
        novelId: currentNovelId,
        ...data,
      });
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">世界观设定</h2>
            <p className="text-sm text-muted-foreground">定义故事世界的背景规则</p>
          </div>
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
          >
            添加设定
          </button>
        </div>

        {worldSettings.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-muted/20">
            <div className="text-4xl mb-4">🌍</div>
            <p className="text-muted-foreground">暂无世界观设定</p>
            <p className="text-xs text-muted-foreground mt-1">点击上方按钮添加，或在右侧 AI 面板让 AI 生成</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedSettings).map(([category, settings]) => (
              <div key={category}>
                <h3 className="font-medium text-sm text-muted-foreground mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  {category}
                </h3>
                <div className="space-y-3">
                  {settings.map((setting) => (
                    <div
                      key={setting.id}
                      className="p-4 border rounded-lg bg-card cursor-pointer group"
                      onClick={() => handleEdit(setting)}
                    >
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium">{setting.title}</h4>
                        <div className="flex items-center gap-2">
                          <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('确定要删除这个设定吗？')) {
                                deleteWorldSetting(setting.id);
                              }
                            }}
                            className="text-xs text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                      {setting.content && (
                        <p className="text-sm text-muted-foreground mt-2">{setting.content}</p>
                      )}
                      {!setting.content && (
                        <p className="text-xs text-muted-foreground italic mt-2">点击编辑添加详细内容</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 编辑弹窗 */}
      <WorldSettingEditor
        setting={editingSetting}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={handleSave}
      />
    </div>
  );
}