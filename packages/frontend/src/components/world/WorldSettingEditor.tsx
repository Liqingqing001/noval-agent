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
import type { WorldSetting } from '@/types';

interface WorldSettingEditorProps {
  setting: WorldSetting | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Omit<WorldSetting, 'id' | 'novelId'>) => void;
}

const CATEGORIES = [
  '力量体系',
  '地理环境',
  '势力分布',
  '历史文化',
  '社会规则',
  '科技设定',
  '种族设定',
  '其他',
];

export function WorldSettingEditor({
  setting,
  open,
  onOpenChange,
  onSave,
}: WorldSettingEditorProps) {
  const [category, setCategory] = useState('其他');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  // 初始化表单
  useEffect(() => {
    if (setting) {
      setCategory(setting.category || '其他');
      setTitle(setting.title);
      setContent(setting.content || '');
    } else {
      setCategory('其他');
      setTitle('');
      setContent('');
    }
  }, [setting, open]);

  const handleSave = () => {
    if (!title.trim()) {
      alert('请输入设定名称');
      return;
    }

    onSave({
      category,
      title: title.trim(),
      content: content.trim(),
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {setting?.id ? '编辑设定' : '添加设定'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 分类 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">分类</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* 名称 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              名称 <span className="text-destructive">*</span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：灵力等级"
              autoFocus
            />
          </div>

          {/* 内容 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">详细内容</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="描述这个设定的具体内容..."
              className="w-full min-h-[150px] px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>
            {setting?.id ? '保存' : '添加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
