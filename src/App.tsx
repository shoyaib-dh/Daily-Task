import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Toaster, toast } from 'sonner';
import {
  BarChart3,
  Calendar,
  CalendarClock,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  FolderKanban,
  FolderOpen,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  Wallet,
  X,
} from 'lucide-react';
import { auth } from './lib/firebase';
import { apiFetch, setFirebaseTokenProvider, setSessionToken } from './lib/api';
import type { AdminProfile, ModuleKey } from './types/poms';
import { LoginPage } from './components/LoginPage';
import { DashboardModule } from './components/DashboardModule';
import { TasksModule } from './components/TasksModule';
import { PlannerCalendarModule } from './components/PlannerCalendarModule';
import { NotesModule } from './components/NotesModule';
import { ProjectsModule } from './components/ProjectsModule';
import { DataManagerModule } from './components/DataManagerModule';
import { FinanceModule } from './components/FinanceModule';
import { FileManagerModule } from './components/FileManagerModule';
import { ReportsModule } from './components/ReportsModule';
import { ActivityModule } from './components/ActivityModule';
import { DEFAULT_AVATAR_URL, SettingsModule } from './components/SettingsModule';

const NAV_ITEMS: Array<{
  key: ModuleKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'tasks', label: 'My Tasks', icon: CheckSquare },
  { key: 'planner', label: 'Daily Planner', icon: CalendarClock },
  { key: 'calendar', label: 'Calendar', icon: Calendar },
  { key: 'notes', label: 'My Notes', icon: FileText },
  { key: 'projects', label: 'Projects', icon: FolderKanban },
  { key: 'data-manager', label: 'Data Manager', icon: Database },
  { key: 'finance', label: 'Finance', icon: Wallet },
  { key: 'files', label: 'File Manager', icon: FolderOpen },
  { key: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
  { key: 'activity', label: 'Activity History', icon: History },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [booting, setBooting] = useState(true);
  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [avatarFailed, setAvatarFailed] = useState(false);

  // Sync Tailwind v4 .dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  // Restore session (HTTP-only cookie or active Firebase Auth session)
  useEffect(() => {
    let settled = false;

    const trySessionMe = async () => {
      try {
        const res = await apiFetch<{ admin: AdminProfile }>('/api/auth/me');
        if (!settled) {
          settled = true;
          setAdmin(res.admin);
          setTheme(res.admin.theme === 'dark' ? 'dark' : 'light');
          setBooting(false);
        }
        return true;
      } catch {
        return false;
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseTokenProvider(() => fbUser.getIdToken());
        const ok = await trySessionMe();
        if (!ok && !settled) {
          settled = true;
          setBooting(false);
        }
      } else {
        setFirebaseTokenProvider(null);
        const ok = await trySessionMe();
        if (!ok && !settled) {
          settled = true;
          setBooting(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const handleAuthenticated = (profile: AdminProfile) => {
    setAdmin(profile);
    setTheme(profile.theme === 'dark' ? 'dark' : 'light');
    setActiveModule('dashboard');
  };

  const handleToggleTheme = async () => {
    const next: 'light' | 'dark' = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (admin) {
      setAdmin({ ...admin, theme: next });
      try {
        await apiFetch('/api/auth/profile', {
          method: 'PUT',
          body: JSON.stringify({ theme: next }),
        });
      } catch {
        // non-blocking
      }
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
    setSessionToken(null);
    setFirebaseTokenProvider(null);
    setAdmin(null);
    toast.success('Signed out safely.');
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-900 dark:bg-blue-600 text-white font-display font-bold flex items-center justify-center">
            PO
          </div>
          <p className="text-xs text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!admin) {
    return (
      <>
        <Toaster position="top-right" richColors closeButton />
        <LoginPage onAuthenticated={handleAuthenticated} />
      </>
    );
  }

  const currentNav = NAV_ITEMS.find((n) => n.key === activeModule) || NAV_ITEMS[0];
  const avatarSrc = admin.avatarUrl || DEFAULT_AVATAR_URL;

  const renderSidebarNav = (isMobile = false) => (
    <div className="flex h-full flex-col">
      {/* Brand header */}
      <div className="flex h-15 items-center justify-between border-b border-sidebar-border px-4">
        <button
          type="button"
          onClick={() => {
            setActiveModule('dashboard');
            if (isMobile) setMobileNavOpen(false);
          }}
          className="flex items-center gap-2.5 min-w-0 cursor-pointer"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 dark:bg-blue-600 font-display text-xs font-bold text-white">
            PO
          </div>
          {(!sidebarCollapsed || isMobile) && (
            <span className="font-display text-sm font-bold tracking-tight text-foreground truncate whitespace-nowrap">
              POMS Workspace
            </span>
          )}
        </button>

        {isMobile ? (
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* Navigation items */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeModule === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setActiveModule(item.key);
                if (isMobile) setMobileNavOpen(false);
              }}
              title={sidebarCollapsed && !isMobile ? item.label : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {(!sidebarCollapsed || isMobile) && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Bottom Profile & Sign Out */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveModule('settings');
              if (isMobile) setMobileNavOpen(false);
            }}
            className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
          >
            <div className="h-8 w-8 shrink-0 rounded-full border border-border bg-muted overflow-hidden flex items-center justify-center">
              {!avatarFailed ? (
                <img
                  src={avatarSrc}
                  alt={admin.displayName || admin.username}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs font-bold text-foreground">
                  {(admin.displayName || admin.username).slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            {(!sidebarCollapsed || isMobile) && (
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-foreground">
                  {admin.displayName || admin.username}
                </div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {admin.username}
                </div>
              </div>
            )}
          </button>

          {(!sidebarCollapsed || isMobile) && (
            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              aria-label="Sign Out"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Toaster position="top-right" richColors closeButton theme={theme} />

      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ${
          sidebarCollapsed ? 'w-[68px]' : 'w-[248px]'
        }`}
      >
        <div className="sticky top-0 h-screen">{renderSidebarNav(false)}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-slate-950/50 backdrop-blur-[2px]"
          onClick={() => setMobileNavOpen(false)}
        >
          <aside
            className="h-full w-[264px] bg-sidebar border-r border-sidebar-border shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {renderSidebarNav(true)}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean Top Navigation Bar */}
        <header className="sticky top-0 z-30 flex h-15 items-center justify-between gap-4 border-b border-border bg-card/90 px-4 sm:px-6 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-muted-foreground hidden sm:inline">Office</span>
              <span className="text-muted-foreground hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-foreground truncate">{currentNav.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="rounded-lg border border-border bg-card p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => setActiveModule('settings')}
              className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{admin.displayName || admin.username}</span>
            </button>
          </div>
        </header>

        {/* Active Module Viewport */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {activeModule === 'dashboard' && (
            <DashboardModule admin={admin} onNavigate={setActiveModule} />
          )}
          {activeModule === 'tasks' && <TasksModule admin={admin} />}
          {activeModule === 'planner' && (
            <PlannerCalendarModule admin={admin} mode="planner" />
          )}
          {activeModule === 'calendar' && (
            <PlannerCalendarModule admin={admin} mode="calendar" />
          )}
          {activeModule === 'notes' && <NotesModule admin={admin} />}
          {activeModule === 'projects' && <ProjectsModule admin={admin} />}
          {activeModule === 'data-manager' && <DataManagerModule admin={admin} />}
          {activeModule === 'finance' && <FinanceModule admin={admin} />}
          {activeModule === 'files' && <FileManagerModule admin={admin} />}
          {activeModule === 'reports' && <ReportsModule admin={admin} />}
          {activeModule === 'activity' && <ActivityModule />}
          {activeModule === 'settings' && (
            <SettingsModule
              admin={admin}
              onAdminUpdated={(updated) => {
                setAdmin(updated);
                setTheme(updated.theme === 'dark' ? 'dark' : 'light');
              }}
              onLogout={handleLogout}
            />
          )}
        </main>
      </div>
    </div>
  );
}
