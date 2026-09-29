import React, { useState, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { cn } from '@/shared/ui/utils';
import { StatusBar } from '@/components/layout/StatusBar';
import { SidebarIndicators } from '@/components/layout/SidebarIndicators';
import {
  LayoutDashboard,
  Settings,
  Network,
  Rocket,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FlaskConical,
  Activity,
  Wrench,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ErrorBoundary } from 'react-error-boundary';
import { useToast } from '@/components/ui/use-toast';
import { getLocalizedErrorMessage } from '@/shared/utils/errorMessages';
import { useEmulationState } from '@/modules/cloud-account/hooks/useCloudAccounts';
import { useAppConfig } from '@/modules/config/hooks/useAppConfig';

export const MainLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { config } = useAppConfig();
  const hasShownRouteErrorToastRef = useRef(false);
  const { data: emulationState } = useEmulationState(5000);
  const isEmulationActive = !!emulationState?.enabled;
  const emulatedAccountCount = emulationState?.accounts?.length ?? 0;

  // Initialize state from localStorage if available, default to false (expanded)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved ? JSON.parse(saved) : false;
  });

  // Persist state changes
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  // Stealth shortcut: Ctrl+Shift+E toggles between accounts and emulation lab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
        e.preventDefault();
        if (location.pathname === '/emulation') {
          navigate({ to: '/' });
        } else {
          navigate({ to: '/emulation' });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [location.pathname, navigate]);

  const navItems = [
    {
      to: '/',
      icon: LayoutDashboard,
      label: t('nav.accounts'),
    },
    {
      to: '/proxy',
      icon: Network,
      label: t('nav.proxy'),
    },
    {
      to: '/client-tools',
      icon: Wrench,
      label: t('nav.client-tools', 'Client Tools'),
    },
    ...(config?.show_emulation_ui
      ? [
          {
            to: '/emulation' as const,
            icon: FlaskConical,
            label: t('nav.emulation', 'Emulation'),
            badge: isEmulationActive ? emulatedAccountCount : undefined,
          },
        ]
      : []),
    {
      to: '/traffic',
      icon: Activity,
      label: t('nav.traffic'),
    },
    {
      to: '/settings',
      icon: Settings,
      label: t('nav.settings'),
    },
  ];

  return (
    <div className="bg-background text-foreground flex h-screen flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={cn(
            'bg-card/75 group border-border/70 relative flex flex-col border-r backdrop-blur-lg transition-all duration-300 ease-in-out',
            isCollapsed ? 'w-[70px]' : 'w-64',
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="bg-background hover:bg-accent hover:text-accent-foreground absolute top-6 -right-3 z-10 h-6 w-6 rounded-full border opacity-0 shadow-md transition-opacity group-hover:opacity-100"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronLeft className="h-3 w-3" />
            )}
          </Button>

          <div className={cn('flex flex-col', isCollapsed ? 'items-center p-4' : 'p-6')}>
            <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap">
              <div className="bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded shadow-sm">
                <Rocket className="h-4 w-4" />
              </div>
              <div
                className={cn(
                  'overflow-hidden transition-all duration-300',
                  isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100',
                )}
              >
                <h1 className="text-xl font-bold tracking-tight">Antigravity</h1>
              </div>
            </div>
            <div
              className={cn(
                'text-muted-foreground mt-1 overflow-hidden text-xs whitespace-nowrap transition-all duration-300',
                isCollapsed ? 'h-0 opacity-0' : 'h-auto opacity-100',
              )}
            >
              Manager
            </div>
          </div>

          <nav className="flex-1 space-y-2 px-2">
            <TooltipProvider>
              {navItems.map((item) => {
                const isActive = location.pathname === item.to;

                if (isCollapsed) {
                  return (
                    <Tooltip key={item.to} delayDuration={0}>
                      <TooltipTrigger asChild>
                        <Link
                          to={item.to}
                          className={cn(
                            'relative mx-auto flex h-10 w-10 items-center justify-center rounded-md transition-all duration-200',
                            isActive
                              ? 'bg-primary/10 text-primary shadow-[0_2px_8px_rgba(37,99,235,0.08)]'
                              : 'hover:bg-muted text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <item.icon className="h-5 w-5" />
                          {item.badge !== undefined && (
                            <span className="absolute top-1.5 right-1.5 flex h-2 w-2 rounded-full bg-purple-500 ring-2 ring-background animate-pulse" />
                          )}
                          <span className="sr-only">{item.label}</span>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {item.label}
                        {item.badge !== undefined && ` (${item.badge})`}
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      'flex items-center justify-between rounded-md border-l-2 px-3 py-2.5 text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'bg-primary/10 text-primary border-primary rounded-l-none pl-2 font-semibold'
                        : 'hover:bg-muted text-muted-foreground hover:text-foreground border-transparent',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span className="rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-purple-400 border border-purple-500/30">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </TooltipProvider>
          </nav>

          <div className="border-border/60 border-t p-2">
            <SidebarIndicators isCollapsed={isCollapsed} />
          </div>

          <div className="border-border/60 border-t p-2">
            <StatusBar isCollapsed={isCollapsed} />
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-auto transition-all duration-300">
          <ErrorBoundary
            resetKeys={[location.pathname]}
            onReset={() => {
              hasShownRouteErrorToastRef.current = false;
            }}
            onError={(error) => {
              if (hasShownRouteErrorToastRef.current) {
                return;
              }

              toast({
                title: t('error.generic'),
                description: getLocalizedErrorMessage(error, t),
                variant: 'destructive',
              });
              hasShownRouteErrorToastRef.current = true;
            }}
            fallbackRender={({ resetErrorBoundary }) => (
              <div className="mx-auto max-w-3xl p-6">
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <div className="text-lg font-semibold">{t('error.generic')}</div>
                  <div className="text-muted-foreground mt-2 text-sm">{t('action.retry')}</div>
                  <Button className="mt-4" variant="outline" onClick={resetErrorBoundary}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t('action.retry')}
                  </Button>
                </div>
              </div>
            )}
          >
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};
