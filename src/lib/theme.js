export const getThemeMode = () => localStorage.getItem('ysv.theme') || 'dark';

export const nextThemeMode = (mode) => {
  if (mode === 'dark') return 'light';
  if (mode === 'light') return 'system';
  return 'dark';
};

export function applyTheme(mode) {
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const light = mode === 'light' || (mode === 'system' && prefersLight);
  document.documentElement.classList.toggle('light', light);
  document.documentElement.style.colorScheme = light ? 'light' : 'dark';
}

export function applyAccent(accent) {
  document.documentElement.setAttribute('data-accent', accent || 'silver');
}

export function applyMotion(pref) {
  document.documentElement.setAttribute('data-motion', pref === 'reduced' ? 'reduced' : 'full');
}

export function applyPreferences() {
  applyTheme(getThemeMode());
  applyAccent(localStorage.getItem('ysv.accent') || 'silver');
  applyMotion(localStorage.getItem('ysv.motion') || 'full');
}