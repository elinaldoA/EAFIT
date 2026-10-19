import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { normalizeSettings, isValidLink, isValidMovedUrl, nextBannerVersion, DEFAULT_SETTINGS } from './appSettings';

describe('normalizeSettings', () => {
  it('sem linhas devolve o padrão', () => {
    expect(normalizeSettings([])).toEqual(DEFAULT_SETTINGS);
  });

  it('mantém o texto do banner mesmo desligado (rascunho)', () => {
    const s = normalizeSettings([{ key: 'banner', value: { enabled: false, message: 'Rascunho', level: 'warning', version: 2 } }]);
    expect(s.banner).toMatchObject({ enabled: false, message: 'Rascunho', level: 'warning', version: 2 });
  });

  it('lê manutenção e só flags booleanas', () => {
    const s = normalizeSettings([
      { key: 'maintenance', value: { enabled: true, message: 'Volto já' } },
      { key: 'flags', value: { fotos_progresso: false, x: 'sim' } },
    ]);
    expect(s.maintenance).toEqual({ enabled: true, message: 'Volto já' });
    expect(s.flags).toEqual({ fotos_progresso: false });
  });
});

describe('mudança de endereço', () => {
  it('lê a chave moved e mantém o endereço mesmo desligado', () => {
    const s = normalizeSettings([{ key: 'moved', value: { enabled: false, url: 'https://eafit.com.br/app/' } }]);
    expect(s.moved).toEqual({ enabled: false, url: 'https://eafit.com.br/app/' });
  });

  it('endereço novo precisa ser https completo', () => {
    expect(isValidMovedUrl(' https://eafit.com.br/app/ ')).toBe(true);
    expect(isValidMovedUrl('http://eafit.com.br/')).toBe(false);
    expect(isValidMovedUrl('/app/')).toBe(false);
    expect(isValidMovedUrl('')).toBe(false);
  });
});

describe('isValidLink', () => {
  it('vazio, http(s) e relativo são válidos', () => {
    expect(isValidLink('')).toBe(true);
    expect(isValidLink('https://eafit.app')).toBe(true);
    expect(isValidLink('/EAFIT/')).toBe(true);
  });

  it('outros esquemas não', () => {
    expect(isValidLink('javascript:alert(1)')).toBe(false);
    expect(isValidLink('eafit.app')).toBe(false);
  });
});

describe('nextBannerVersion', () => {
  const current = { enabled: true, message: 'A', level: 'info', linkUrl: '', linkLabel: '', version: 4 };

  it('mantém a versão quando nada mudou', () => {
    expect(nextBannerVersion(current, { ...current })).toBe(4);
  });

  it('sobe a versão quando algo mudou', () => {
    expect(nextBannerVersion(current, { ...current, message: 'B' })).toBe(5);
    expect(nextBannerVersion(current, { ...current, enabled: false })).toBe(5);
  });
});

describe('tema de temporada', () => {
  it('normaliza a chave season e valida o período', async () => {
    const { isValidSeasonWindow } = await import('./appSettings');
    const s = normalizeSettings([{ key: 'season', value: { enabled: true, theme: 'natal', startsOn: '2026-10-24', endsOn: 'x' } }]).season;
    expect(s).toEqual({ enabled: true, theme: 'halloween', startsOn: '2026-10-24', endsOn: '' });
    expect(isValidSeasonWindow(s)).toBe(false);
    expect(isValidSeasonWindow({ startsOn: '2026-10-24', endsOn: '2026-11-02' })).toBe(true);
    expect(isValidSeasonWindow({ startsOn: '2026-11-02', endsOn: '2026-10-24' })).toBe(false);
  });

  it('rotula a conquista de temporada de qualquer ano', async () => {
    const { badgeLabel } = await import('./userDetailHelpers');
    expect(badgeLabel('halloween_2026')).toBe('🎃 Treino das Bruxas 2026');
    expect(badgeLabel('halloween_2031')).toBe('🎃 Treino das Bruxas 2031');
    expect(badgeLabel('streak_3')).toBe('🔥 Sequência de 3 dias');
    expect(badgeLabel('desconhecida')).toBe('desconhecida');
  });
});
