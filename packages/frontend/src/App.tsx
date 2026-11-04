import { lazy, Suspense, useState, useCallback, useEffect } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { MainContent } from '@/components/layout/MainContent';
import { AgentPanel } from '@/components/layout/AgentPanel';
import { LoginPage } from '@/components/auth/LoginPage';
import { MigrationWizard } from '@/components/auth/MigrationWizard';
import { useNovelStore } from '@/stores/novelStore';
import { useAuthStore } from '@/stores/authStore';
import { fetchAllFromBackend, hasLocalData } from '@/api/sync';
import { IS_DEMO } from '@/lib/runtime';
import { DemoBanner } from '@/demo/DemoBanner';
import { useSettingsStore } from '@/stores/settingsStore';
import { isModelConfigured } from '@/lib/modelConfig';
import { BookOpen, Library, Bot } from 'lucide-react';
import { flushActiveEditor } from '@/lib/editorEvents';
import { OPEN_USAGE_EVENT } from '@/lib/usageNavigation';
import { OPEN_REVIEW_EVENT } from '@/lib/reviewNavigation';
import '@/styles/workspace.css';
import '@/styles/emerald-court.css';
import '@/styles/mobile-workspace.css';
import '@/styles/workspace-interactions.css';

const DemoAssistant = lazy(() => import('@/demo/DemoAssistant').then(module => ({ default: module.DemoAssistant })));
const PublicationHub = lazy(() => import('@/components/publishing/PublicationHub').then(module => ({ default: module.PublicationHub })));

// localStorage key
const STORAGE_KEY_SIDEBAR = 'novel-agent-sidebar-width';
const STORAGE_KEY_AGENT = 'novel-agent-panel-width';

const getDefaultAgentWidth = () => {
  const saved = localStorage.getItem(STORAGE_KEY_AGENT);
  if (saved) return parseInt(saved, 10);
  return Math.max(320, Math.min(600, window.innerWidth * 0.25));
};

const getDefaultSidebarWidth = () => {
  const saved = localStorage.getItem(STORAGE_KEY_SIDEBAR);
  if (saved) return parseInt(saved, 10);
  return 256;
};

function App() {
  const [publicationOpen, setPublicationOpen] = useState(false);
  const openPublication = () => { flushActiveEditor(); setPublicationOpen(true); };
  const [mobilePanel, setMobilePanel] = useState<'bookshelf' | 'content' | 'assistant'>('content');
  const [sidebarWidth, setSidebarWidth] = useState(getDefaultSidebarWidth);
  const [agentPanelWidth, setAgentPanelWidth] = useState(getDefaultAgentWidth);

  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const [isDraggingAgent, setIsDraggingAgent] = useState(false);

  const [showMigration, setShowMigration] = useState(false);

  const currentView = useNovelStore((state) => state.currentView);
  const currentNovelId = useNovelStore(state => state.currentNovelId);
  const reconcileOutlineProgress = useNovelStore(state => state.reconcileOutlineProgress);
  useEffect(() => { if (currentNovelId) reconcileOutlineProgress(currentNovelId); }, [currentNovelId, currentView, reconcileOutlineProgress]);
  const { isAuthenticated, fetchMe, logout } = useAuthStore();
  const configured = useSettingsStore(isModelConfigured);

  const showContent = useCallback(() => setMobilePanel('content'), []);

  // Navigation from the assistant or sidebar should reveal the requested work on narrow screens.
  useEffect(() => { showContent(); }, [currentView, showContent]);

  const switchPanel = (panel: typeof mobilePanel) => {
    flushActiveEditor();
    setMobilePanel(panel);
  };

  useEffect(() => {
    const openUsage = () => {
      flushActiveEditor();
      useNovelStore.getState().setCurrentView('settings');
      setMobilePanel('content');
    };
    const openReview = () => {
      flushActiveEditor();
      useNovelStore.getState().setCurrentView('review');
      setMobilePanel('content');
    };
    window.addEventListener(OPEN_USAGE_EVENT, openUsage);
    window.addEventListener(OPEN_REVIEW_EVENT, openReview);
    return () => {
      window.removeEventListener(OPEN_USAGE_EVENT, openUsage);
      window.removeEventListener(OPEN_REVIEW_EVENT, openReview);
    };
  }, []);

  // 首次加载：尝试获取当前用户
  useEffect(() => {
    if (isAuthenticated && !IS_DEMO) {
      fetchMe().then(() => {
        const hasMigrated = localStorage.getItem('novel-agent-migrated');
        const shouldMigrate = !hasMigrated && hasLocalData();

        // 关键保护：如果本地有旧数据且还没迁移，先弹迁移向导，不能先拉云端空数据覆盖本地。
        if (shouldMigrate) {
          setShowMigration(true);
          return;
        }

        // 已迁移或本地无数据时，再从云端拉取。
        fetchAllFromBackend({ preserveLocalIfRemoteEmpty: true }).catch((err) => {
          console.warn('拉取后端数据失败:', err);
        });

        if (!hasMigrated) {
          setShowMigration(true);
        }
      });
    }
  }, [isAuthenticated, fetchMe]);

  const handleMouseDownSidebar = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSidebar(true);
  }, []);

  const handleMouseDownAgent = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingAgent(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingSidebar) {
        const newWidth = Math.max(200, Math.min(400, e.clientX));
        setSidebarWidth(newWidth);
        localStorage.setItem(STORAGE_KEY_SIDEBAR, newWidth.toString());
      }
      if (isDraggingAgent) {
        const newWidth = Math.max(280, Math.min(600, window.innerWidth - e.clientX));
        setAgentPanelWidth(newWidth);
        localStorage.setItem(STORAGE_KEY_AGENT, newWidth.toString());
      }
    };

    const handleMouseUp = () => {
      setIsDraggingSidebar(false);
      setIsDraggingAgent(false);
    };

    if (isDraggingSidebar || isDraggingAgent) {
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
  }, [isDraggingSidebar, isDraggingAgent]);

  // 未登录：显示登录页
  if (!isAuthenticated && !IS_DEMO) {
    return <LoginPage />;
  }

  return (
    <div className="workspace-app flex flex-col bg-background">
      {IS_DEMO && <DemoBanner />}
      <div className={`workspace-layout flex min-h-0 flex-1 ${currentView === 'reference' ? 'workspace-reference' : ''}`} data-mobile-panel={mobilePanel}>
      {/* Left Sidebar - Bookshelf */}
      <div id="workspace-bookshelf" style={{ width: sidebarWidth }} className="workspace-panel workspace-sidebar flex-shrink-0">
        <Sidebar currentView={currentView} onLogout={logout} onNavigate={showContent} onOpenPublication={openPublication} />
      </div>

      <div
        onMouseDown={handleMouseDownSidebar}
        className={`workspace-divider w-1 flex-shrink-0 cursor-col-resize hover:bg-primary/30 transition-colors ${
          isDraggingSidebar ? 'bg-primary/50' : 'bg-border'
        }`}
      />

      <main id="workspace-content" className="workspace-panel workspace-content flex-1 flex flex-col min-w-0 overflow-hidden">
        <MainContent currentView={currentView} onOpenPublication={openPublication} />
      </main>

      <div
        onMouseDown={handleMouseDownAgent}
        className={`workspace-agent-divider workspace-divider w-1 flex-shrink-0 cursor-col-resize hover:bg-primary/30 transition-colors ${
          isDraggingAgent ? 'bg-primary/50' : 'bg-border'
        }`}
      />

      <div id="workspace-assistant" style={{ width: agentPanelWidth }} className="workspace-panel workspace-assistant flex-shrink-0">
        {IS_DEMO && !configured ? <Suspense fallback={<p className="p-4 text-sm">正在载入演示…</p>}><DemoAssistant onNavigate={showContent} /></Suspense> : <AgentPanel currentView={currentView} />}
      </div>
      </div>
      <nav className="workspace-mobile-nav" aria-label="工作区切换">
        {([
          ['bookshelf', '书架', Library],
          ['content', '作品', BookOpen],
          ['assistant', 'AI 助手', Bot],
        ] as const).filter(([panel]) => currentView !== 'reference' || panel !== 'assistant').map(([panel, label, Icon]) => (
          <button key={panel} type="button" aria-controls={`workspace-${panel}`} aria-current={mobilePanel === panel ? 'page' : undefined} onClick={() => switchPanel(panel)}>
            <Icon className="h-5 w-5" aria-hidden="true" /><span>{panel === 'content' && currentView === 'reference' ? '参考创作' : label}</span>
          </button>
        ))}
      </nav>

      {/* 首次登录迁移向导 */}
      {publicationOpen && <Suspense fallback={<p className="fixed inset-x-4 bottom-20 z-50 rounded-lg border bg-card p-4 text-sm" role="status">正在载入发布中心…</p>}><PublicationHub onClose={() => setPublicationOpen(false)} /></Suspense>}
      {showMigration && (
        <MigrationWizard
          onClose={() => {
            localStorage.setItem('novel-agent-migrated', 'true');
            setShowMigration(false);
          }}
        />
      )}
    </div>
  );
}

export default App;
