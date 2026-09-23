/**
 * ============================================================================
 * THEME SERVICE (MODO OSCURO / CLARO)
 * Persistencia en localStorage y aplicación global en todo el DOM
 * ============================================================================
 */

const THEME_KEY = 'libreta_app_theme';

export function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'dark';
}

export function isDarkMode() {
  return getTheme() === 'dark';
}

export function setTheme(theme) {
  const selected = theme === 'light' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, selected);
  applyTheme(selected);
}

export function toggleTheme() {
  const current = getTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

export function applyTheme(theme = null) {
  const t = theme || getTheme();
  const isLight = t === 'light';

  if (isLight) {
    document.documentElement.classList.add('theme-light');
    document.body.classList.add('theme-light');
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.classList.remove('theme-light');
    document.body.classList.remove('theme-light');
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  updateAllThemeIcons();
}

export function updateAllThemeIcons() {
  const isLight = getTheme() === 'light';
  const icon = isLight ? '☀️' : '🌙';
  const label = isLight ? 'Modo Claro' : 'Modo Oscuro';

  document.querySelectorAll('[data-theme-icon]').forEach(el => {
    el.textContent = icon;
  });
  document.querySelectorAll('[data-theme-label]').forEach(el => {
    el.textContent = label;
  });
}
