import { useState, useCallback, useEffect } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { MainContent } from '@/components/layout/MainContent';
import { AgentPanel } from '@/components/layout/AgentPanel';
import { LoginPage } from '@/components/auth/LoginPage';
import { MigrationWizard } from '@/components/auth/MigrationWizard';
import { useNovelStore } from '@/stores/novelStore';
import { useAuthStore } from '@/stores/authStore';
import { fetchAllFromBackend, hasLocalData } from '@/api/sync';

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
  const [sidebarWidth, setSidebarWidth] = useState(getDefaultSidebarWidth);
  const [agentPanelWidth, setAgentPanelWidth] = useState(getDefaultAgentWidth);

  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const [isDraggingAgent, setIsDraggingAgent] = useState(false);

  const [showMigration, setShowMigration] = useState(false);

  const currentView = useNovelStore((state) => state.currentView);
  const { isAuthenticated, fetchMe, logout } = useAuthStore();

  // 首次加载：尝试获取当前用户
  useEffect(() => {
    if (isAuthenticated) {
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
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Left Sidebar - Bookshelf */}
      <div style={{ width: sidebarWidth }} className="flex-shrink-0">
        <Sidebar currentView={currentView} onLogout={logout} />
      </div>

      <div
        onMouseDown={handleMouseDownSidebar}
        className={`w-1 flex-shrink-0 cursor-col-resize hover:bg-primary/30 transition-colors ${
          isDraggingSidebar ? 'bg-primary/50' : 'bg-border'
        }`}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <MainContent currentView={currentView} />
      </div>

      <div
        onMouseDown={handleMouseDownAgent}
        className={`w-1 flex-shrink-0 cursor-col-resize hover:bg-primary/30 transition-colors ${
          isDraggingAgent ? 'bg-primary/50' : 'bg-border'
        }`}
      />

      <div style={{ width: agentPanelWidth }} className="flex-shrink-0">
        <AgentPanel currentView={currentView} />
      </div>

      {/* 首次登录迁移向导 */}
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
