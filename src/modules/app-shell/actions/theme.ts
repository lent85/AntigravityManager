import { parseThemeMode, ThemeMode } from '@/modules/app-shell/types/theme-mode';
import { ipc } from '@/ipc/manager';
import { LOCAL_STORAGE_KEYS } from '@/shared/constants';

export interface ThemePreferences {
  system: ThemeMode;
  local: ThemeMode | null;
}

export async function getCurrentTheme(): Promise<ThemePreferences> {
  const currentTheme = await ipc.client.theme.getCurrentThemeMode();
  const localTheme = parseThemeMode(localStorage.getItem(LOCAL_STORAGE_KEYS.THEME));

  return {
    system: currentTheme,
    local: localTheme,
  };
}

export async function setTheme(newTheme: ThemeMode) {
  await ipc.client.theme.setThemeMode(newTheme);
  localStorage.setItem(LOCAL_STORAGE_KEYS.THEME, newTheme);
  updateDocumentTheme(newTheme);
}

export async function toggleTheme() {
  const localTheme = localStorage.getItem(LOCAL_STORAGE_KEYS.THEME) as ThemeMode | null;
  const current = localTheme || 'system';
  let next: ThemeMode;
  if (current === 'system') {
    next = 'light';
  } else if (current === 'light') {
    next = 'dark';
  } else {
    next = 'system';
  }
  await setTheme(next);
}

export async function syncWithLocalTheme() {
  const { local } = await getCurrentTheme();
  const theme = local || 'system';
  await setTheme(theme);
}

export function updateDocumentTheme(mode: ThemeMode) {
  const isDarkMode =
    mode === 'dark' ||
    (mode === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  if (typeof document !== 'undefined') {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }
}

