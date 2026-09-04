import { Moon, Sun, Laptop, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/shared/theme-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from 'react-i18next';

export default function ToggleTheme() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t('settings.theme.title', 'Theme')}
        >
          {theme === 'light' ? (
            <Sun className="h-4 w-4" />
          ) : theme === 'dark' ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Laptop className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          className="flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <Sun className="h-4 w-4" />
            <span>{t('settings.theme.light', 'Light')}</span>
          </div>
          {theme === 'light' && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          className="flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4" />
            <span>{t('settings.theme.dark', 'Dark')}</span>
          </div>
          {theme === 'dark' && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('system')}
          className="flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <Laptop className="h-4 w-4" />
            <span>{t('settings.theme.system', 'System')}</span>
          </div>
          {theme === 'system' && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

