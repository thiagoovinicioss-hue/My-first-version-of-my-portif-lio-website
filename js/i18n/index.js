import { dictionary, SUPPORTED_LANGS, DEFAULT_LANG } from './strings.js';

const STORAGE_KEY = 'tv.site.lang';
const listeners = new Set();

let currentLang = detectInitial();

export function detectInitial() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
  } catch (_) { /* storage unavailable */ }

  const nav = (navigator.language || DEFAULT_LANG).toLowerCase().slice(0, 2);
  if (nav === 'pt') return 'pt';
  if (nav === 'es') return 'es';
  if (nav === 'en') return 'en';
  return DEFAULT_LANG;
}

export function getLang() {
  return currentLang;
}

function lookup(lang, key) {
  const table = dictionary[lang] || dictionary[DEFAULT_LANG];
  if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
  if (lang !== DEFAULT_LANG) return dictionary[DEFAULT_LANG][key];
  return key;
}

export function t(key, vars) {
  let text = lookup(currentLang, key);
  if (text === undefined) text = key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.split(`{${k}}`).join(v);
    }
  }
  return text;
}

export function getOptions(key) {
  return lookup(currentLang, key) || [];
}

function setLangCommon(lang) {
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (_) { /* ignore */ }
  document.documentElement.setAttribute('lang', lang === 'pt' ? 'pt-BR' : lang);
  applyStatic();
  bindSwitcher();
  // Update title & meta
  document.title = t('meta.title');
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', t('meta.description'));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang) || lang === currentLang) return;
  setLangCommon(lang);
  document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang } }));
}

export function init() {
  if (!currentLang) currentLang = DEFAULT_LANG;
  setLangCommon(currentLang);
  bindSwitcher();
  document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: currentLang } }));
}

function bindSwitcher() {
  document.querySelectorAll('.lang-btn').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.lang === currentLang));
}

const DYNAMIC_CONTAINERS = '.carousel-track, #leadsList, #adminStats, #adminFilters, #quoteReview';

function applyStatic() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    // Containers rendered by JS (carousel cards, admin, quote review) re-render on i18n:change.
    if (el.closest(DYNAMIC_CONTAINERS)) return;
    el.textContent = t(el.dataset.i18n);
  });
  // Localized placeholders
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  // Localized option labels rendered by JS
  document.querySelectorAll('[data-i18n-opt]').forEach((el) => {
    if (el.tagName === 'OPTION') el.textContent = t(el.dataset.i18nOpt);
  });
}