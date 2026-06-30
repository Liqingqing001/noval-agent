import { useState, useRef, useEffect } from 'react';
import { Plus, BookOpen, FileText, Users, Globe, Settings, Trash2, Pencil, Sparkles, LogOut, Cloud, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNovelStore } from '@/stores/novelStore';
import { useAuthStore } from '@/stores/authStore';
import type { ViewType } from '@/types';

interface SidebarProps {
  currentView: ViewType;
  onLogout?: () => void;
}

export function Sidebar({ currentView, onLogout }: SidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newNovelTitle, setNewNovelTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const novels = useNovelStore((state) => state.novels);
  const currentNovelId = useNovelStore((state) => state.currentNovelId);
  const setCurrentNovel = useNovelStore((state) => state.setCurrentNovel);
  const setCurrentView = useNovelStore((state) => state.setCurrentView);
  const addNovel = useNovelStore((state) => state.addNovel);
  const updateNovel = useNovelStore((state) => state.updateNovel);
  const deleteNovel = useNovelStore((state) => state.deleteNovel);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (isCreating && inputRef.current) inputRef.current.focus();
  }, [isCreating]);

  const handleCreateNovel = () => {
    if (newNovelTitle.trim()) {
      const novel = addNovel({ title: newNovelTitle.trim(), wordCount: 0, status: 'draft' });
      setCurrentNovel(novel.id);
      setNewNovelTitle('');
      setIsCreating(false);
    } else {
      setIsCreating(false);
      setNewNovelTitle('');
    }
  };

  const handleUpdateTitle = (id: string) => {
    if (editTitle.trim()) updateNovel(id, { title: editTitle.trim() });
    setEditingId(null);
  };

  const handleSelectNovel = (id: string) => {
    setCurrentNovel(id);
    setCurrentView('chapters');
  };

  const handleViewChange = (view: ViewType) => {
    setCurrentView(view);
  };

  const handleCoverUpload = (novelId: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateNovel(novelId, { cover: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const handleCoverButtonClick = (e: React.MouseEvent, novelId: string) => {
    e.stopPropagation();
    const input = fileInputRef.current;
    if (!input) return;
    input.dataset.novelId = novelId;
    input.value = '';
    input.click();
  };

  const handleRemoveCover = (e: React.MouseEvent, novelId: string) => {
    e.stopPropagation();
    if (confirm('确定移除这本书的封面吗？')) {
      updateNovel(novelId, { cover: undefined });
    }
  };

  const handleCoverInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const novelId = e.target.dataset.novelId;
    if (file && novelId) {
      handleCoverUpload(novelId, file);
    }
  };

  const navItems: { id: ViewType; icon: typeof BookOpen; label: string }[] = [
    { id: 'outline', icon: FileText, label: '大纲' },
    { id: 'chapters', icon: BookOpen, label: '章节' },
    { id: 'characters', icon: Users, label: '人物' },
    { id: 'world', icon: Globe, label: '世界观' },
    { id: 'settings', icon: Settings, label: '设置' },
  ];

  return (
    <div className="flex h-full flex-col border-r border-border/50 bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl border border-border bg-background flex items-center justify-center shadow-sm">
            <BookOpen className="h-4 w-4 text-foreground" />
          </div>
          <h2 className="text-sm font-bold tracking-wide text-foreground">我的书架</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-xl hover:bg-muted transition-colors"
          onClick={() => { setIsCreating(true); setNewNovelTitle(''); }}
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      {/* Novel List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleCoverInputChange}
        />
        {novels.map((novel) => (
          <div
            key={novel.id}
            onClick={() => handleSelectNovel(novel.id)}
            className={`group relative p-4 rounded-2xl cursor-pointer transition-all duration-300 card-hover ${
              currentNovelId === novel.id
                ? 'bg-card border-2 border-foreground/20 shadow-lg'
                : 'bg-card/80 border border-border/50 hover:border-foreground/20 hover:bg-card'
            }`}
          >
            {/* 选中指示条 */}
            {currentNovelId === novel.id && (
              <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-foreground/70" />
            )}

            {editingId === novel.id ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUpdateTitle(novel.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onBlur={() => handleUpdateTitle(novel.id)}
                autoFocus
                className="w-full px-3 py-2 text-sm font-medium bg-background border-2 border-primary rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="relative shrink-0">
                    {novel.cover ? (
                      <img
                        src={novel.cover}
                        alt={`${novel.title}封面`}
                        className="h-16 w-12 rounded-lg object-cover border border-border shadow-sm"
                      />
                    ) : (
                      <div className="h-16 w-12 rounded-lg border border-dashed border-border bg-muted/50 flex items-center justify-center">
                        <BookOpen className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleCoverButtonClick(e, novel.id)}
                      className="absolute -right-2 -bottom-2 h-7 w-7 rounded-full border border-border bg-background shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                      title={novel.cover ? '更换封面' : '添加封面'}
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate group-hover:text-foreground transition-colors">
                      {novel.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`tag-creative ${
                        novel.status === 'draft' ? 'bg-muted text-muted-foreground' :
                        novel.status === 'writing' ? 'bg-muted text-foreground' :
                        'bg-muted text-foreground'
                      }`}>
                        {novel.status === 'draft' ? '草稿' : novel.status === 'writing' ? '创作中' : '已完成'}
                      </span>
                      <span className="text-xs text-muted-foreground font-medium">
                        {novel.wordCount.toLocaleString()} 字
                      </span>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className={`flex items-center gap-1 transition-all duration-200 ${
                    currentNovelId === novel.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`} onClick={(e) => e.stopPropagation()}>
                    {novel.cover && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg hover:bg-destructive/10"
                        onClick={(e) => handleRemoveCover(e, novel.id)}
                        title="移除封面"
                      >
                        <ImagePlus className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg hover:bg-muted"
                      onClick={() => { setEditingId(novel.id); setEditTitle(novel.title); }}
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg hover:bg-destructive/10"
                      onClick={() => confirm('确定删除？') && deleteNovel(novel.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}

        {/* 添加新书卡片 */}
        {isCreating && (
          <div className="p-4 rounded-2xl bg-card border-2 border-dashed border-border animate-slide-up">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-muted-foreground animate-pulse" />
              <span className="text-xs font-medium text-foreground">创建新书</span>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={newNovelTitle}
              onChange={(e) => setNewNovelTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateNovel();
                if (e.key === 'Escape') { setIsCreating(false); setNewNovelTitle(''); }
              }}
              onBlur={handleCreateNovel}
              placeholder="输入书名..."
              autoFocus
              className="w-full px-4 py-3 text-sm bg-background border-2 border-border rounded-xl input-creative"
            />
            <p className="text-xs text-muted-foreground mt-2 px-1">按 Enter 创建，Esc 取消</p>
          </div>
        )}

        {/* 空状态 */}
        {novels.length === 0 && !isCreating && (
          <div className="flex flex-col items-center justify-center py-16 animate-fade-scale">
            <div className="w-20 h-20 rounded-3xl border border-border bg-background flex items-center justify-center mb-4 shadow-inner">
              <BookOpen className="h-10 w-10 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">书架空空如也</p>
            <p className="text-xs text-muted-foreground mt-1">点击右上角 + 创建第一本书</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="p-3 space-y-1.5 border-t border-border/50 bg-muted/20">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleViewChange(item.id)}
            disabled={!currentNovelId && item.id !== 'settings'}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
              currentView === item.id
                ? 'bg-card shadow-sm border border-border'
                : 'hover:bg-card/50'
            }`}
          >
            <item.icon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{item.label}</span>
            {currentView === item.id && (
              <div className="ml-auto w-2 h-2 rounded-full bg-foreground/70" />
            )}
          </button>
        ))}
      </div>

      {/* User Info & Logout */}
      {user && (
        <div className="p-3 border-t border-border/50 bg-card/50">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
            <div className="w-7 h-7 rounded-full border border-border bg-background flex items-center justify-center shrink-0">
              <Cloud className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{user.nickname || user.email}</div>
              <div className="text-[10px] text-muted-foreground">已登录 · 云端同步</div>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="退出登录"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}