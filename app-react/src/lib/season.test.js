// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeSeason, activeSeason, activePeriod, isSeasonOff, setSeasonOff, onSeasonChange, earnedHalloween, halloweenWindow,
  earnedNovembroAzul, novembroAzulWindow, earnedOutubroRosa, outubroRosaWindow, workoutDaysIn,
  applySeason, bootSeason, cacheSeason, cachedSeason, currentSeason, seasonText,
} from './season';
import { normalizeConfig } from './appConfig';
import { seasonalBadges, visibleBadges, BADGES } from './achievements';
import { buildLine } from './coach';
import { SEASON_PHRASES, PHRASES, TONES } from '../data/coachPhrases';

const HALLOWEEN = { theme: 'halloween', startsOn: '2026-10-24', endsOn: '2026-11-02' };
const ON = { enabled: true, periods: [HALLOWEEN] };
const AGENDA = {
  enabled: true,
  periods: [
    { theme: 'outubro_rosa', startsOn: '2026-10-19', endsOn: '2026-10-23' },
    HALLOWEEN,
    { theme: 'novembro_azul', startsOn: '2026-11-03', endsOn: '2026-11-30' },
  ],
};

describe('tema de temporada', () => {
  beforeEach(() => localStorage.clear());

  it('normaliza a chave season e ignora tema desconhecido ou datas tortas', () => {
    expect(normalizeSeason(ON)).toEqual(ON);
    expect(normalizeSeason(AGENDA)).toEqual(AGENDA);
    expect(normalizeSeason({ enabled: true, periods: [{ ...HALLOWEEN, theme: 'natal' }] })).toEqual({ enabled: false, periods: [] });
    expect(normalizeSeason({ enabled: true, periods: [{ ...HALLOWEEN, theme: 'natal' }, HALLOWEEN] }).periods).toEqual([HALLOWEEN]);
    expect(normalizeSeason({ enabled: true, periods: [{ ...HALLOWEEN, startsOn: '24/10' }] }).periods[0].startsOn).toBe('');
    expect(normalizeSeason(null)).toEqual({ enabled: false, periods: [] });
    expect(normalizeConfig([{ key: 'season', value: AGENDA }]).season).toEqual(AGENDA);
    expect(normalizeConfig([]).season).toEqual({ enabled: false, periods: [] });
  });

  it('aceita o formato antigo, de um tema só', () => {
    expect(normalizeSeason({ enabled: true, ...HALLOWEEN })).toEqual(ON);
    expect(normalizeSeason({ enabled: true, ...HALLOWEEN, theme: 'natal' })).toEqual({ enabled: false, periods: [] });
  });

  it('só fica no ar entre as duas datas, inclusive', () => {
    expect(activeSeason(ON, '2026-10-23')).toBe('');
    expect(activeSeason(ON, '2026-10-24')).toBe('halloween');
    expect(activeSeason(ON, '2026-11-02')).toBe('halloween');
    expect(activeSeason(ON, '2026-11-03')).toBe('');
    // sem data final não liga: decoração esquecida não fica para sempre
    expect(activeSeason({ enabled: true, periods: [{ ...HALLOWEEN, endsOn: '' }] }, '2026-10-25')).toBe('');
    expect(activeSeason({ ...ON, enabled: false }, '2026-10-25')).toBe('');
  });

  it('passa de um tema agendado para o outro sozinho', () => {
    expect(activeSeason(AGENDA, '2026-10-18')).toBe('');
    expect(activeSeason(AGENDA, '2026-10-19')).toBe('outubro_rosa');
    expect(activeSeason(AGENDA, '2026-10-23')).toBe('outubro_rosa');
    expect(activeSeason(AGENDA, '2026-10-24')).toBe('halloween');
    expect(activeSeason(AGENDA, '2026-11-03')).toBe('novembro_azul');
    expect(activeSeason(AGENDA, '2026-12-01')).toBe('');
    expect(activePeriod(AGENDA, '2026-11-10')).toEqual(AGENDA.periods[2]);
    expect(activePeriod({ ...AGENDA, enabled: false }, '2026-11-10')).toBe(null);
  });

  it('a pessoa desliga por tema, e quem escuta é avisado', () => {
    let calls = 0;
    const stop = onSeasonChange(() => { calls++; });
    setSeasonOff('halloween', true);
    expect(isSeasonOff('halloween')).toBe(true);
    setSeasonOff('halloween', false);
    expect(isSeasonOff('halloween')).toBe(false);
    stop();
    setSeasonOff('halloween', true);
    expect(calls).toBe(2);
  });
});

describe('conquista Treino das Bruxas', () => {
  it('vale treinar em 31/10 ou 3 treinos de 24/10 a 02/11', () => {
    expect(halloweenWindow(2026)).toEqual({ from: '2026-10-24', to: '2026-11-02', day: '2026-10-31' });
    expect(earnedHalloween(['2026-10-31'], 2026)).toBe(true);
    expect(earnedHalloween(['2026-10-24', '2026-10-28', '2026-11-02'], 2026)).toBe(true);
    // mesmo dia repetido conta uma vez; fora do período não conta
    expect(earnedHalloween(['2026-10-25', '2026-10-25', '2026-10-26'], 2026)).toBe(false);
    expect(earnedHalloween(['2026-10-23', '2026-11-03', '2026-10-30'], 2026)).toBe(false);
    expect(earnedHalloween(['2025-10-31'], 2026)).toBe(false);
  });

  it('cria uma conquista por ano a partir de 2026', () => {
    expect(seasonalBadges('2026-10-19').map(b => b.id)).toEqual(['outubro_rosa_2026', 'halloween_2026', 'novembro_azul_2026']);
    expect(seasonalBadges('2027-01-05').map(b => b.id)).toEqual([
      'outubro_rosa_2026', 'halloween_2026', 'novembro_azul_2026', 'outubro_rosa_2027', 'halloween_2027', 'novembro_azul_2027',
    ]);
    const b = seasonalBadges('2026-10-19').find(x => x.id === 'halloween_2026');
    expect(b.check({ completedDates: ['2026-10-31'] })).toBe(true);
    expect(b.check({})).toBe(false);
  });

  it('aparece na grade só se ganha ou durante o tema do ano', () => {
    const none = new Set();
    expect(visibleBadges(none, { theme: '', year: 2026 }, '2026-10-19')).toHaveLength(BADGES.length);
    expect(visibleBadges(none, { theme: 'halloween', year: 2026 }, '2026-10-25').at(-1).id).toBe('halloween_2026');
    const won = visibleBadges(new Set(['halloween_2026']), { theme: '', year: 2027 }, '2027-03-01');
    expect(won.map(b => b.id)).toContain('halloween_2026');
    expect(won.map(b => b.id)).not.toContain('halloween_2027');
  });
});

describe('conquista Novembro Azul', () => {
  const days = (n, from = 1) => Array.from({ length: n }, (_, i) => `2026-11-${String(from + i).padStart(2, '0')}`);

  it('vale 12 treinos em dias diferentes de novembro', () => {
    const w = novembroAzulWindow(2026);
    expect(w).toEqual({ from: '2026-11-01', to: '2026-11-30', goal: 12 });
    expect(earnedNovembroAzul(days(12), 2026)).toBe(true);
    expect(earnedNovembroAzul(days(11), 2026)).toBe(false);
    // mesmo dia repetido conta uma vez; fora de novembro ou de outro ano não conta
    expect(workoutDaysIn([...days(11), '2026-11-01'], w)).toBe(11);
    expect(workoutDaysIn([...days(10), '2026-10-31', '2026-12-01', '2025-11-20'], w)).toBe(10);
    expect(earnedNovembroAzul(days(12), 2027)).toBe(false);
  });

  it('aparece na grade durante o tema do ano e confere pelos treinos', () => {
    const grid = visibleBadges(new Set(), { theme: 'novembro_azul', year: 2026 }, '2026-11-10');
    expect(grid.at(-1).id).toBe('novembro_azul_2026');
    expect(grid.map(b => b.id)).not.toContain('halloween_2026');
    expect(grid.at(-1).check({ completedDates: days(12, 5) })).toBe(true);
  });
});

describe('conquista Outubro Rosa', () => {
  it('2026 (primeira edição, no ar em 19/10): 3 treinos de 19/10 a 23/10', () => {
    expect(outubroRosaWindow(2026)).toEqual({ from: '2026-10-19', to: '2026-10-23', goal: 3 });
    expect(earnedOutubroRosa(['2026-10-19', '2026-10-21', '2026-10-23'], 2026)).toBe(true);
    expect(earnedOutubroRosa(['2026-10-18', '2026-10-21', '2026-10-24'], 2026)).toBe(false);
  });

  it('dali em diante: 10 treinos de 01/10 a 23/10', () => {
    expect(outubroRosaWindow(2027)).toEqual({ from: '2027-10-01', to: '2027-10-23', goal: 10 });
    const ten = Array.from({ length: 10 }, (_, i) => `2027-10-${String(i * 2 + 1).padStart(2, '0')}`);
    expect(earnedOutubroRosa(ten, 2027)).toBe(true);
    expect(earnedOutubroRosa(ten.slice(1), 2027)).toBe(false);
  });

  it('aparece na grade durante o tema do ano', () => {
    const grid = visibleBadges(new Set(), { theme: 'outubro_rosa', year: 2026 }, '2026-10-20');
    expect(grid.at(-1).id).toBe('outubro_rosa_2026');
    expect(grid.at(-1).check({ completedDates: ['2026-10-19', '2026-10-20', '2026-10-22'] })).toBe(true);
  });
});

describe('treinador por voz no tema', () => {
  const prefs = { tone: 'zoeira', name: '' };

  it('soma as falas do tema às de sempre só com o tema no ar', () => {
    const extra = SEASON_PHRASES.halloween.zoeira.restDone;
    const base = PHRASES.zoeira.restDone;
    const pickLast = () => 0.999;
    expect(extra).toContain(buildLine('restDone', {}, prefs, pickLast, 'halloween'));
    expect(base).toContain(buildLine('restDone', {}, prefs, pickLast, ''));
  });

  it('só usa tons e situações que existem nas falas de sempre', () => {
    for (const [, byTone] of Object.entries(SEASON_PHRASES)) {
      for (const [tone, events] of Object.entries(byTone)) {
        expect(TONES).toContain(tone);
        for (const event of Object.keys(events)) expect(PHRASES[tone][event]).toBeDefined();
      }
    }
  });
});

describe('tema no documento e nos textos', () => {
  // Período em volta de hoje, pra valer em qualquer data que o teste rodar.
  const NOW = { enabled: true, periods: [{ theme: 'halloween', startsOn: '2000-01-01', endsOn: '2999-12-31' }] };

  beforeEach(() => {
    localStorage.clear();
    applySeason('');
    document.head.innerHTML = '<meta name="theme-color" content="#0e0e12"><link rel="icon" href="favicon.svg">';
  });

  it('liga e desliga <html data-season>, barra de status e favicon', () => {
    applySeason('halloween');
    expect(document.documentElement.getAttribute('data-season')).toBe('halloween');
    expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#120c1a');
    expect(document.querySelector('link[rel="icon"]').getAttribute('href')).toMatch(/^data:image\/svg\+xml/);
    applySeason('');
    expect(document.documentElement.hasAttribute('data-season')).toBe(false);
    expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#0e0e12');
    expect(document.querySelector('link[rel="icon"]').getAttribute('href')).toBe('favicon.svg');
  });

  it('abre com o tema guardado no aparelho enquanto está no período', () => {
    cacheSeason(NOW);
    expect(cachedSeason()).toEqual(NOW);
    bootSeason();
    expect(currentSeason()).toBe('halloween');
  });

  it('tema guardado vencido ou desligado pela pessoa não liga no boot', () => {
    cacheSeason({ enabled: true, periods: [{ ...NOW.periods[0], endsOn: '2001-01-01' }] });
    bootSeason();
    expect(currentSeason()).toBe('');
    cacheSeason(NOW);
    setSeasonOff('halloween', true);
    bootSeason();
    expect(currentSeason()).toBe('');
  });

  it('cache ilegível volta ao padrão desligado', () => {
    localStorage.setItem('eafit_season_cache', '{oops');
    expect(cachedSeason().enabled).toBe(false);
  });

  it('troca só os emojis de enfeite, e só com o tema ligado', () => {
    expect(seasonText('Sequência 🔥')).toBe('Sequência 🔥');
    applySeason('halloween');
    expect(seasonText('Sequência 🔥 · Bora 💪 🎉')).toBe('Sequência 🎃 · Bora 🦇 👻');
    expect(seasonText('⚠️ Atenção ✅')).toBe('⚠️ Atenção ✅');
    expect(seasonText('💪🏽 forte')).toBe('💪🏽 forte');
    applySeason('novembro_azul');
    expect(seasonText('Sequência 🔥 · Bora 💪 🎉 🎯')).toBe('Sequência 💙 · Bora 💪 💙 🎯');
    applySeason('outubro_rosa');
    expect(seasonText('Sequência 🔥 🎉')).toBe('Sequência 💗 💗');
  });

  it('campanhas de saúde têm barra de status e favicon próprios', () => {
    applySeason('novembro_azul');
    expect(document.documentElement.getAttribute('data-season')).toBe('novembro_azul');
    expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#0b1220');
    expect(document.querySelector('link[rel="icon"]').getAttribute('href')).toMatch(/^data:image\/svg\+xml.*2563eb/);
    applySeason('outubro_rosa');
    expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#170c14');
    expect(document.querySelector('link[rel="icon"]').getAttribute('href')).toMatch(/db2777/);
  });
});
