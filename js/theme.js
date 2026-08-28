import { t, subscribe } from './i18n/index.js';

const STORE_KEY = 'tv.site.theme';
const LIGHT_BG = '#F7F8FC';
const DARK_BG = '#05060D';

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function updateMeta(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? DARK_BG : LIGHT_BG);
}

export function applyTheme(theme, opts = {}) {
  document.documentElement.setAttribute('data-theme', theme);
  if (!opts.systemOnly) {
    try { localStorage.setItem(STORE_KEY, theme); } catch (_e) { /* storage unavailable */ }
  }
  updateMeta(theme);
  const btn = document.querySelector('#themeToggle');
  if (btn) {
    btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    btn.title = t(theme === 'dark' ? 'theme.day' : 'theme.night');
    btn.setAttribute('aria-label', t('theme.toggle'));
  }
}

const media = window.matchMedia('(prefers-color-scheme: dark)');

function readStored() {
  try { return localStorage.getItem(STORE_KEY); } catch (_e) { return null; }
}

export function initTheme() {
  const stored = readStored();
  if (stored === 'dark' || stored === 'light') {
    applyTheme(stored);
  } else {
    // No explicit choice: follow the OS, and keep following it live.
    applyTheme(media.matches ? 'dark' : 'light', { systemOnly: true });
    media.addEventListener('change', () => {
      if (!readStored()) applyTheme(media.matches ? 'dark' : 'light', { systemOnly: true });
    });
  }

  const btn = document.querySelector('#themeToggle');
  if (btn) {
    btn.addEventListener('click', () => applyTheme(getTheme() === 'dark' ? 'light' : 'dark'));
  }

  subscribe(() => applyTheme(getTheme()));
}