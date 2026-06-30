import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Character } from '@/types';

interface CharacterEditorProps {
  character: Character | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Omit<Character, 'id' | 'novelId'>) => void;
}

const ROLE_OPTIONS: { value: Character['role']; label: string; color: string }[] = [
  { value: 'protagonist', label: '主角', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'supporting', label: '配角', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  { value: 'minor', label: '龙套', color: 'bg-muted text-muted-foreground border-border' },
];

export function CharacterEditor({
  character,
  open,
  onOpenChange,
  onSave,
}: CharacterEditorProps) {
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [personality, setPersonality] = useState('');
  const [background, setBackground] = useState('');
  const [appearance, setAppearance] = useState('');
  const [description, setDescription] = useState('');
  const [role, setRole] = useState<Character['role']>('supporting');

  // 初始化表单
  useEffect(() => {
    if (character) {
      setName(character.name);
      setAliases(character.aliases?.join('、') || '');
      setPersonality(character.personality || '');
      setBackground(character.background || '');
      setAppearance(character.appearance || '');
      setDescription(character.description || '');
      setRole(character.role || 'supporting');
    } else {
      // 新建角色
      setName('');
      setAliases('');
      setPersonality('');
      setBackground('');
      setAppearance('');
      setDescription('');
      setRole('supporting');
    }
  }, [character, open]);

  const handleSave = () => {
    if (!name.trim()) {
      alert('请输入角色姓名');
      return;
    }

    onSave({
      name: name.trim(),
      aliases: aliases.split(/[、,，]/).map(s => s.trim()).filter(Boolean),
      personality: personality.trim(),
      background: background.trim(),
      appearance: appearance.trim(),
      description: description.trim(),
      role,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {character?.id ? '编辑角色' : '添加角色'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 姓名 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              姓名 <span className="text-destructive">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="角色姓名"
              autoFocus
            />
          </div>

          {/* 角色定位 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">角色定位</label>
            <div className="flex gap-2">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRole(opt.value)}
                  className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                    role === opt.value ? opt.color : 'bg-background border-border hover:bg-muted'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 别名 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">别名/称号</label>
            <Input
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="用顿号或逗号分隔多个别名"
            />
          </div>

          {/* 性格 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">性格特点</label>
            <textarea
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="描述角色的性格特征..."
              className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            />
          </div>

          {/* 背景 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">背景故事</label>
            <textarea
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              placeholder="角色的出身、经历..."
              className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            />
          </div>

          {/* 外貌 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">外貌描写</label>
            <textarea
              value={appearance}
              onChange={(e) => setAppearance(e.target.value)}
              placeholder="角色的外貌特征..."
              className="w-full min-h-[60px] px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            />
          </div>

          {/* 描述 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">其他描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="其他需要记录的信息..."
              className="w-full min-h-[60px] px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>
            {character?.id ? '保存' : '添加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
