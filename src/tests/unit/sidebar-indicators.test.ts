// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarIndicators } from '@/components/layout/SidebarIndicators';
import { setAppConfigSaveStatus } from '@/modules/config/hooks/useAppConfig';
import { QUERY_KEYS } from '@/modules/cloud-account/hooks/useCloudAccounts';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock('@/ipc/manager', () => ({
  ipc: {
    client: {
      cloud: {
        getMetricsPollInterval: vi.fn().mockResolvedValue(5),
        setMetricsPollInterval: vi.fn().mockResolvedValue(5),
      },
      proc: {
        isProcessRunning: vi.fn().mockResolvedValue(false),
      },
      app: {
        getConfig: vi.fn().mockResolvedValue({ sync_interval: 5, process_poll_interval: 30 }),
        saveConfig: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

describe('SidebarIndicators', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    setAppConfigSaveStatus(() => ({
      status: 'saved',
      lastSavedAt: null,
    }));
  });

  it('renders configuration saved, metrics synced indicators, and process status with cadence badges', () => {
    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(SidebarIndicators, { isCollapsed: false }),
      ),
    );

    expect(screen.getByText('Configuration saved')).toBeDefined();
    expect(screen.getByText('Metrics synced')).toBeDefined();
    expect(screen.getByText('5m')).toBeDefined();
    expect(screen.getByText('Processes stopped')).toBeDefined();
    expect(screen.getByText('30s')).toBeDefined();
  });

  it('displays saving state when configuration is being saved', () => {
    setAppConfigSaveStatus(() => ({
      status: 'saving',
      lastSavedAt: null,
    }));

    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(SidebarIndicators, { isCollapsed: false }),
      ),
    );

    expect(screen.getByText('Saving configuration...')).toBeDefined();
  });

  it('displays error state when configuration save fails', () => {
    setAppConfigSaveStatus(() => ({
      status: 'error',
      lastSavedAt: null,
      errorMessage: 'Network error',
    }));

    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(SidebarIndicators, { isCollapsed: false }),
      ),
    );

    expect(screen.getByText('Save failed')).toBeDefined();
  });

  it('invalidates accounts and modelAvailability queries when clicking reload metrics', () => {
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(SidebarIndicators, { isCollapsed: false }),
      ),
    );

    const reloadButtons = screen.getAllByTitle('Click to reload metrics');
    fireEvent.click(reloadButtons[0]);

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: QUERY_KEYS.cloudAccounts,
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['gateway', 'modelAvailability'],
    });
  });

  it('invalidates process queries when clicking re-scan processes', () => {
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(SidebarIndicators, { isCollapsed: false }),
      ),
    );

    const rescanButtons = screen.getAllByTitle('Click to re-scan processes');
    fireEvent.click(rescanButtons[0]);

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['process', 'status'],
    });
  });

  it('renders collapsed mode without crashing', () => {
    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(SidebarIndicators, { isCollapsed: true }),
      ),
    );

    expect(screen.getByLabelText('Configuration saved')).toBeDefined();
    expect(
      screen.getByLabelText('Metrics synced (5m) - Click to reload metrics'),
    ).toBeDefined();
    expect(
      screen.getByLabelText('Processes stopped (30s) - Click to re-scan processes'),
    ).toBeDefined();
  });
});

