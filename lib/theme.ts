'use client';

import { useEffect, useState } from 'react';

/**
 * Appearance: light, dark, or follow the phone. Kept on this device; applied
 * as data-theme on <html> by THEME_SCRIPT before first paint (no flash), and
 * by setTheme when changed in Settings.
 */

export type Theme = 'system' | 'light' | 'dark';

const KEY = 'gridlock:theme';
/** Status-bar colour for each look, matching --color-bg. */
const BAR = { light: '#f3f2f2', dark: '#161514' };

/** Runs inline in <head>, before anything renders. Keep it tiny and ES5. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${KEY}');var d=document.documentElement;if(t==='light'||t==='dark'){d.setAttribute('data-theme',t);var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].setAttribute('content',t==='dark'?'${BAR.dark}':'${BAR.light}');}}catch(e){}})();`;

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function setTheme(theme: Theme): void {
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Storage blocked: applies for this visit only.
  }
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  // Forced themes override both media-specific status-bar colours.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const media = m.getAttribute('media') ?? '';
    const own = media.includes('dark') ? BAR.dark : BAR.light;
    m.setAttribute('content', theme === 'system' ? own : dark ? BAR.dark : BAR.light);
  });
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, set] = useState<Theme>('system');
  useEffect(() => set(readTheme()), []);
  return [theme, (t) => { setTheme(t); set(t); }];
}
