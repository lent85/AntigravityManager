// @vitest-environment happy-dom
import { render } from '@testing-library/react';
import { test, expect } from 'vitest';
import ToggleTheme from '@/components/shared/toggle-theme';
import { ThemeProvider } from '@/components/shared/theme-provider';

test('renders ToggleTheme', () => {
  const { getByRole } = render(
    <ThemeProvider defaultTheme="system">
      <ToggleTheme />
    </ThemeProvider>,
  );
  const isButton = getByRole('button');

  expect(isButton).toBeInTheDocument();
});

test('has icon', () => {
  const { getByRole } = render(
    <ThemeProvider defaultTheme="system">
      <ToggleTheme />
    </ThemeProvider>,
  );
  const button = getByRole('button');
  const icon = button.querySelector('svg');

  expect(icon).toBeInTheDocument();
});

test('renders laptop icon by default for system mode', () => {
  const svgIconClassName: string = 'lucide-laptop';
  const { getByRole } = render(
    <ThemeProvider defaultTheme="system">
      <ToggleTheme />
    </ThemeProvider>,
  );
  const svg = getByRole('button').querySelector('svg');

  expect(svg?.classList).toContain(svgIconClassName);
});

test('renders moon icon for dark mode', () => {
  const svgIconClassName: string = 'lucide-moon';
  const { getByRole } = render(
    <ThemeProvider defaultTheme="dark">
      <ToggleTheme />
    </ThemeProvider>,
  );
  const svg = getByRole('button').querySelector('svg');

  expect(svg?.classList).toContain(svgIconClassName);
});

test('renders sun icon for light mode', () => {
  const svgIconClassName: string = 'lucide-sun';
  const { getByRole } = render(
    <ThemeProvider defaultTheme="light">
      <ToggleTheme />
    </ThemeProvider>,
  );
  const svg = getByRole('button').querySelector('svg');

  expect(svg?.classList).toContain(svgIconClassName);
});

