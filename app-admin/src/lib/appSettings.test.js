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
  const P = (theme, startsOn, endsOn) => ({ theme, startsOn, endsOn });

  it('normaliza a chave season (lista de períodos ou formato antigo) e valida o período', async () => {
    const { isValidSeasonWindow } = await import('./appSettings');
    const old = normalizeSettings([{ key: 'season', value: { enabled: true, theme: 'halloween', startsOn: '2026-10-24', endsOn: 'x' } }]).season;
    expect(old).toEqual({ enabled: true, periods: [P('halloween', '2026-10-24', '')] });
    expect(isValidSeasonWindow(old.periods[0])).toBe(false);
    const list = normalizeSettings([{ key: 'season', value: { enabled: true, periods: [P('reveillon', '2026-12-01', '2026-12-26'), P('outubro_rosa', '2026-10-19', '2026-10-23')] } }]).season;
    expect(list).toEqual({ enabled: true, periods: [P('outubro_rosa', '2026-10-19', '2026-10-23')] });
    expect(normalizeSettings([]).season).toEqual({ enabled: false, periods: [] });
    expect(isValidSeasonWindow({ startsOn: '2026-10-24', endsOn: '2026-11-02' })).toBe(true);
    expect(isValidSeasonWindow({ startsOn: '2026-11-02', endsOn: '2026-10-24' })).toBe(false);
  });

  it('agenda: exige período, datas e nada sobreposto', async () => {
    const { seasonScheduleError, seasonStatus, sortPeriods } = await import('./appSettings');
    const rosa = P('outubro_rosa', '2026-10-19', '2026-10-23');
    const bruxas = P('halloween', '2026-10-24', '2026-11-02');
    const azul = P('novembro_azul', '2026-11-03', '2026-11-30');
    expect(seasonScheduleError({ enabled: false, periods: [] })).toBe('');
    expect(seasonScheduleError({ enabled: true, periods: [] })).toMatch(/pelo menos um/);
    expect(seasonScheduleError({ enabled: true, periods: [P('halloween', '2026-10-24', '')] })).toMatch(/duas datas/);
    expect(seasonScheduleError({ enabled: true, periods: [azul, rosa, bruxas] })).toBe('');
    expect(seasonScheduleError({ enabled: true, periods: [rosa, { ...bruxas, startsOn: '2026-10-23' }] })).toMatch(/Outubro Rosa e .*Dia das Bruxas se sobrepõem/);
    expect(sortPeriods([azul, rosa, bruxas])).toEqual([rosa, bruxas, azul]);

    const agenda = { enabled: true, periods: [rosa, bruxas, azul] };
    expect(seasonStatus({ ...agenda, enabled: false }, '2026-10-20')).toEqual({ key: 'desligado' });
    expect(seasonStatus(agenda, '2026-10-18')).toEqual({ key: 'agendado' });
    expect(seasonStatus(agenda, '2026-10-30')).toEqual({ key: 'no_ar', theme: 'halloween' });
    expect(seasonStatus(agenda, '2026-12-01')).toEqual({ key: 'encerrado' });
  });

  it('agenda sugerida: datas móveis certas e sem pisar no que já existe', async () => {
    const { defaultSeasonPeriods, withDefaultPeriods, easterDay, seasonScheduleError } = await import('./appSettings');
    expect(easterDay(2026)).toBe('2026-04-05');
    expect(easterDay(2027)).toBe('2027-03-28');
    const y2027 = defaultSeasonPeriods(2027);
    expect(y2027.map(p => p.theme)).toEqual(['carnaval', 'pascoa', 'namorados', 'festa_junina', 'outubro_rosa', 'halloween', 'novembro_azul', 'natal', 'ano_novo']);
    expect(y2027[0]).toEqual(P('carnaval', '2027-02-05', '2027-02-10'));
    expect(y2027[1]).toEqual(P('pascoa', '2027-03-22', '2027-04-04'));
    expect(y2027.at(-1)).toEqual(P('ano_novo', '2027-12-27', '2028-01-07'));
    // a agenda sugerida de vários anos nunca se sobrepõe
    for (const y of [2026, 2027, 2028, 2035]) {
      expect(seasonScheduleError({ enabled: true, periods: [...defaultSeasonPeriods(y), ...defaultSeasonPeriods(y + 1)] })).toBe('');
    }

    // em 19/10/2026, com o que já está agendado: só entram Natal e Ano Novo
    const atual = [P('outubro_rosa', '2026-10-19', '2026-10-23'), P('halloween', '2026-10-24', '2026-11-02'), P('novembro_azul', '2026-11-03', '2026-11-30')];
    const r = withDefaultPeriods(atual, 2026, '2026-10-19');
    expect(r.added).toBe(2);
    expect(r.periods.map(p => p.theme)).toEqual(['outubro_rosa', 'halloween', 'novembro_azul', 'natal', 'ano_novo']);
    expect(withDefaultPeriods(r.periods, 2026, '2026-10-19').added).toBe(0);
  });

  it('rotula a conquista de temporada de qualquer ano', async () => {
    const { badgeLabel } = await import('./userDetailHelpers');
    expect(badgeLabel('halloween_2026')).toBe('🎃 Treino das Bruxas 2026');
    expect(badgeLabel('halloween_2031')).toBe('🎃 Treino das Bruxas 2031');
    expect(badgeLabel('novembro_azul_2027')).toBe('💙 Novembro Azul 2027');
    expect(badgeLabel('outubro_rosa_2027')).toBe('💗 Outubro Rosa 2027');
    expect(badgeLabel('festa_junina_2027')).toBe('🌽 Arraiá 2027');
    expect(badgeLabel('ano_novo_2027')).toBe('🎆 Ano Novo 2027');
    expect(badgeLabel('outra_coisa_2027')).toBe('outra_coisa_2027');
    expect(badgeLabel('streak_3')).toBe('🔥 Sequência de 3 dias');
    expect(badgeLabel('desconhecida')).toBe('desconhecida');
  });
});
