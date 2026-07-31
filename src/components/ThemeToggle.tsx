'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';

const storageKey = 'nfrp-theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const storedTheme = window.localStorage.getItem(storageKey);
  if (storedTheme === 'dark' || storedTheme === 'light') return storedTheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function subscribeToThemeChanges(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('nfrp-theme-change', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('nfrp-theme-change', callback);
  };
}

function getServerTheme(): Theme {
  return 'light';
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToThemeChanges, getInitialTheme, getServerTheme);

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(storageKey, nextTheme);
    window.dispatchEvent(new Event('nfrp-theme-change'));
  }

  const isDark = theme === 'dark';

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Attiva tema chiaro' : 'Attiva tema scuro'}
      title={isDark ? 'Tema chiaro' : 'Tema scuro'}
    >
      <span className="theme-toggle-track" aria-hidden>
        <span className="theme-toggle-thumb">{isDark ? <Moon size={14} /> : <Sun size={14} />}</span>
      </span>
    </button>
  );
}
