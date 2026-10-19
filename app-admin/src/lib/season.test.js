// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { applyAdminSeason, isAdminSeasonOff, liveTheme, setAdminSeasonOff, SEASON_CHANGE_EVENT } from './season';

describe('tema de temporada no painel', () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.innerHTML = '<link rel="icon" href="favicon.svg?v=2">';
    applyAdminSeason('');
  });

  it('usa o tema do período de hoje', () => {
    const season = { enabled: true, periods: [
      { theme: 'outubro_rosa', startsOn: '2026-10-19', endsOn: '2026-10-23' },
      { theme: 'halloween', startsOn: '2026-10-24', endsOn: '2026-11-02' },
    ] };
    expect(liveTheme(season, '2026-10-20')).toBe('outubro_rosa');
    expect(liveTheme(season, '2026-10-31')).toBe('halloween');
    expect(liveTheme(season, '2026-12-01')).toBe('');
    expect(liveTheme({ ...season, enabled: false }, '2026-10-20')).toBe('');
  });

  it('liga e desliga <html data-season> e o favicon do tema', () => {
    applyAdminSeason('natal');
    expect(document.documentElement.getAttribute('data-season')).toBe('natal');
    expect(decodeURIComponent(document.querySelector('link[rel="icon"]').getAttribute('href'))).toContain('🎄');
    applyAdminSeason('');
    expect(document.documentElement.hasAttribute('data-season')).toBe(false);
    expect(document.querySelector('link[rel="icon"]').getAttribute('href')).toBe('favicon.svg?v=2');
  });

  it('desligar vale por navegador e avisa quem escuta', () => {
    let calls = 0;
    const fn = () => { calls++; };
    window.addEventListener(SEASON_CHANGE_EVENT, fn);
    setAdminSeasonOff(true);
    expect(isAdminSeasonOff()).toBe(true);
    setAdminSeasonOff(false);
    expect(isAdminSeasonOff()).toBe(false);
    window.removeEventListener(SEASON_CHANGE_EVENT, fn);
    expect(calls).toBe(2);
  });
});
