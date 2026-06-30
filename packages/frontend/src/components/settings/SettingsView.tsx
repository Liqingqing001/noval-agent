import { useSettingsStore, API_PRESETS, type APIProvider } from '@/stores/settingsStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { useState, useEffect } from 'react';
import { Key, Thermometer, Hash, Check, ExternalLink, Server, Cpu } from 'lucide-react';

export function SettingsView() {
  const {
    apiProvider,
    apiKey,
    baseUrl,
    model,
    temperature,
    maxTokens,
    setApiProvider,
    setApiKey,
    setBaseUrl,
    setModel,
    setTemperature,
    setMaxTokens,
  } = useSettingsStore();

  const [apiKeyInput, setApiKeyInput] = useState(apiKey);
  const [baseUrlInput, setBaseUrlInput] = useState(baseUrl);
  const [modelInput, setModelInput] = useState(model);
  const [saved, setSaved] = useState(false);

  // 当 store 值变化时同步到本地 state（例如其他地方修改了配置）
  useEffect(() => {
    setApiKeyInput(apiKey);
    setBaseUrlInput(baseUrl);
    setModelInput(model);
  }, [apiKey, baseUrl, model]);

  const handleSaveAll = () => {
    setApiKey(apiKeyInput);
    setBaseUrl(baseUrlInput);
    setModel(modelInput);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleProviderChange = (provider: APIProvider) => {
    // 只切换服务商，不覆盖已有配置
    setApiProvider(provider);
    setSaved(false);
  };

  const isConfigured = !!apiKey;
  const currentPreset = API_PRESETS[apiProvider];

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <h2 className="text-2xl font-semibold">设置</h2>

        {/* API 提供商选择 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              API 提供商
            </CardTitle>
            <CardDescription>
              选择您要使用的 AI 服务提供商
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(API_PRESETS) as APIProvider[]).map((provider) => {
                const preset = API_PRESETS[provider];
                return (
                  <button
                    key={provider}
                    onClick={() => handleProviderChange(provider)}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      apiProvider === provider
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50 hover:bg-muted/50'
                    }`}
                  >
                    <div className="font-medium">{preset.name}</div>
                    {provider !== 'custom' && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {preset.models.length} 个模型可用
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* 帮助链接 */}
            {currentPreset.helpUrl && (
              <a
                href={currentPreset.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                获取 {currentPreset.name} API Key
              </a>
            )}
          </CardContent>
        </Card>

        {/* API 配置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API 配置
            </CardTitle>
            <CardDescription>
              配置您的 API Key 和服务地址
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConfigured ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <span className={isConfigured ? 'text-green-600' : 'text-red-600'}>
                {isConfigured ? '已配置' : '未配置'}
              </span>
            </div>

            {/* API Key */}
            <div className="space-y-2">
              <label className="text-sm font-medium">API Key</label>
              <Input
                type="password"
                placeholder={apiProvider === 'deepseek' ? 'sk-xxxxxxxxxxxxxxxx' :
                            apiProvider === 'openai' ? 'sk-...' :
                            '请输入 API Key'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
            </div>

            {/* Base URL */}
            <div className="space-y-2">
              <label className="text-sm font-medium">API 地址 (Base URL)</label>
              <Input
                type="text"
                placeholder="https://api.example.com/v1"
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
              />
              {apiProvider !== 'custom' && (
                <p className="text-xs text-muted-foreground">
                  当前使用 {currentPreset.name} 默认地址，如需修改请选择"自定义"
                </p>
              )}
            </div>

            {/* 模型选择 */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <Cpu className="h-4 w-4" />
                模型
              </label>
              <Input
                type="text"
                placeholder={apiProvider === 'deepseek' ? 'deepseek-chat' :
                            apiProvider === 'openai' ? 'gpt-4o' :
                            apiProvider === 'tencent' ? 'hunyuan-lite' :
                            '输入模型名称'}
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {apiProvider === 'deepseek' && '常见模型: deepseek-chat, deepseek-coder'}
                {apiProvider === 'openai' && '常见模型: gpt-4o, gpt-4-turbo, gpt-3.5-turbo'}
                {apiProvider === 'tencent' && '常见模型: hunyuan-lite, hunyuan-standard, hunyuan-pro, hunyuan-turbo'}
                {apiProvider === 'custom' && '请输入您的 API 支持的模型名称'}
              </p>
            </div>

            {/* 保存按钮 */}
            <Button onClick={handleSaveAll} disabled={saved} className="w-full">
              {saved ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  已保存
                </>
              ) : (
                '保存配置'
              )}
            </Button>

            <p className="text-xs text-muted-foreground">
              您的配置将安全地存储在本地浏览器中
            </p>
          </CardContent>
        </Card>

        {/* 模型参数配置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Thermometer className="h-5 w-5" />
              模型参数
            </CardTitle>
            <CardDescription>调整 AI 生成内容的参数</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <label className="text-sm font-medium">Temperature (随机性)</label>
                <span className="text-sm text-muted-foreground">{temperature}</span>
              </div>
              <Slider
                value={[temperature]}
                onValueChange={([value]) => setTemperature(value)}
                min={0}
                max={2}
                step={0.1}
              />
              <p className="text-xs text-muted-foreground">
                较低值(0.2)使输出更确定，较高值(1.0+)使输出更有创意
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <label className="text-sm font-medium flex items-center gap-1">
                  <Hash className="h-4 w-4" />
                  Max Tokens (最大长度)
                </label>
                <span className="text-sm text-muted-foreground">{maxTokens}</span>
              </div>
              <Slider
                value={[Math.min(maxTokens, 32768)]}
                onValueChange={([value]) => setMaxTokens(value)}
                min={1024}
                max={32768}
                step={1024}
              />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Math.max(1024, parseInt(e.target.value) || 4096))}
                  min={1024}
                  max={65536}
                  className="w-32 h-8 text-sm"
                />
                <span className="text-xs text-muted-foreground">tokens</span>
              </div>
              <p className="text-xs text-muted-foreground">
                控制 AI 单次回复的最大长度。建议：章节 8000-16000，短内容 4096。DeepSeek 最大支持 64K。
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 常见问题 */}
        <Card>
          <CardHeader>
            <CardTitle>常见 API 配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium">腾讯云混元 (Hunyuan)</p>
              <p className="text-muted-foreground mt-1">API 地址: https://api.hunyuan.tencent.com/v1</p>
              <p className="text-muted-foreground">模型: hunyuan-lite, hunyuan-standard, hunyuan-pro, hunyuan-turbo, hunyuan-role, hunyuan-code, hunyuan-translation 等</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium">DeepSeek</p>
              <p className="text-muted-foreground mt-1">API 地址: https://api.deepseek.com/v1</p>
              <p className="text-muted-foreground">模型: deepseek-chat, deepseek-coder</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium">OpenAI</p>
              <p className="text-muted-foreground mt-1">API 地址: https://api.openai.com/v1</p>
              <p className="text-muted-foreground">模型: gpt-4o, gpt-4-turbo, gpt-3.5-turbo</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium">其他兼容 OpenAI 格式的 API</p>
              <p className="text-muted-foreground mt-1">选择"自定义"，填入 API 地址和模型名称即可</p>
            </div>
          </CardContent>
        </Card>

        {/* 关于 */}
        <Card>
          <CardHeader>
            <CardTitle>关于 NovelAgent</CardTitle>
            <CardDescription>版本信息和开源协议</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">版本:</span> v0.2.0
            </p>
            <p>
              <span className="font-medium">支持的 API:</span> DeepSeek、OpenAI、腾讯云 CodingPlan、自定义
            </p>
            <p>
              <span className="font-medium">数据存储:</span> 本地浏览器存储
            </p>
            <p className="text-muted-foreground pt-2">
              NovelAgent 是一款 AI 驱动的小说创作助手，帮助作家高效完成高质量小说创作。
            </p>

            <div className="h-20" />
          </CardContent>
        </Card>

        {/* 数据调试 */}
        <Card>
          <CardHeader>
            <CardTitle>数据调试</CardTitle>
            <CardDescription>查看本地存储数据状态</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const data = JSON.parse(localStorage.getItem('novel-agent-storage') || '{}');
                  const chapters = data?.state?.chapters || [];
                  console.log('=== 数据调试 ===');
                  console.log('章节数量:', chapters.length);
                  console.log('章节列表:', chapters.map((c: { title: string; wordCount: number }) => `${c.title} (${c.wordCount}字)`));
                  console.log('当前小说ID:', data?.state?.currentNovelId);
                  console.log('完整数据:', data);
                  alert(`章节数量: ${chapters.length}\n点击确定查看控制台详情`);
                }}
              >
                查看章节数据
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const size = JSON.stringify(localStorage).length;
                  const sizeKB = Math.round(size / 1024);
                  const sizeMB = Math.round(size / 1024 / 1024 * 100) / 100;
                  alert(`localStorage 使用量: ${sizeKB} KB (${sizeMB} MB)\n限制: 5 MB`);
                }}
              >
                查看存储大小
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm('确定要清空所有数据吗？此操作不可恢复！')) {
                    localStorage.clear();
                    alert('数据已清空，请刷新页面');
                    window.location.reload();
                  }
                }}
              >
                清空数据
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              点击按钮后在浏览器控制台查看详细数据
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}