// 首次登录迁移向导
// 检测 localStorage 中是否有数据，提示用户导入到云端
import { useState } from 'react';
import { Upload, Database, CheckCircle, X, Loader2 } from 'lucide-react';
import { hasLocalData, importLocalDataToBackend, fetchAllFromBackend } from '@/api/sync';

export function MigrationWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'prompt' | 'importing' | 'done' | 'skipped'>('prompt');
  const [result, setResult] = useState<{
    novels: number; chapters: number; characters: number;
    worldSettings: number; plotCards: number; foreshadowings: number;
  } | null>(null);

  const localData = hasLocalData();
  const handleImport = async () => {
    setStep('importing');
    try {
      const res = await importLocalDataToBackend();
      setResult(res.imported);
      // 从后端拉取并填充
      await fetchAllFromBackend();
      setStep('done');
    } catch (err: any) {
      alert('导入失败：' + (err.message || '未知错误'));
      setStep('prompt');
    }
  };

  const handleSkip = async () => {
    // 直接从后端拉取（如果是新用户，后端是空的）
    try {
      await fetchAllFromBackend();
    } catch {
      // 忽略
    }
    setStep('skipped');
  };

  const handleFinish = () => {
    if (step === 'done' || step === 'skipped') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-lg animate-slide-up">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-green-400 flex items-center justify-center">
              <Database className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold">数据迁移</h2>
              <p className="text-xs text-muted-foreground">把本地数据上传到云端</p>
            </div>
          </div>
          {step !== 'importing' && (
            <button onClick={onClose} className="p-1 hover:bg-muted rounded">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="p-6">
          {step === 'prompt' && (
            <>
              {localData ? (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    检测到你的浏览器中保存了**本地小说数据**。是否将这些数据导入到云端，以便多设备同步？
                  </p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 dark:bg-amber-950/30 dark:border-amber-900">
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      💡 提示：导入成功后，本地数据将与云端数据合并。你可以随时在"设置"中查看或导出。
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground mb-4">
                  欢迎回来！你的云端账号已准备就绪。点击"开始使用"进入工作台。
                </p>
              )}

              <div className="flex gap-2">
                {localData ? (
                  <>
                    <button
                      onClick={handleSkip}
                      className="flex-1 py-2.5 text-sm font-medium border rounded-lg hover:bg-muted transition-colors"
                    >
                      跳过
                    </button>
                    <button
                      onClick={handleImport}
                      className="flex-1 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      导入本地数据
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleFinish}
                    className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                  >
                    开始使用
                  </button>
                )}
              </div>
            </>
          )}

          {step === 'importing' && (
            <div className="py-8 text-center">
              <Loader2 className="h-10 w-10 mx-auto mb-3 text-primary animate-spin" />
              <p className="text-sm font-medium">正在导入数据...</p>
              <p className="text-xs text-muted-foreground mt-1">请勿关闭页面</p>
            </div>
          )}

          {step === 'done' && result && (
            <div className="py-4">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
              <p className="text-sm font-medium text-center mb-4">导入成功！</p>
              <div className="grid grid-cols-3 gap-2 text-center text-xs mb-6">
                <div className="bg-muted/50 rounded p-2">
                  <div className="font-bold text-lg">{result.novels}</div>
                  <div className="text-muted-foreground">小说</div>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <div className="font-bold text-lg">{result.chapters}</div>
                  <div className="text-muted-foreground">章节</div>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <div className="font-bold text-lg">{result.characters}</div>
                  <div className="text-muted-foreground">角色</div>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <div className="font-bold text-lg">{result.plotCards}</div>
                  <div className="text-muted-foreground">大纲</div>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <div className="font-bold text-lg">{result.worldSettings}</div>
                  <div className="text-muted-foreground">世界观</div>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <div className="font-bold text-lg">{result.foreshadowings}</div>
                  <div className="text-muted-foreground">伏笔</div>
                </div>
              </div>
              <button
                onClick={handleFinish}
                className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                进入工作台
              </button>
            </div>
          )}

          {step === 'skipped' && (
            <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground mb-4">已跳过导入</p>
              <button
                onClick={handleFinish}
                className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                进入工作台
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
