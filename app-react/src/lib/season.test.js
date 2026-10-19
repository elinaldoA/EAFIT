// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeSeason, activeSeason, isSeasonOff, setSeasonOff, onSeasonChange, earnedHalloween, halloweenWindow,
  applySeason, bootSeason, cacheSeason, cachedSeason, currentSeason, seasonText,
} from './season';
import { normalizeConfig } from './appConfig';
import { seasonalBadges, visibleBadges, BADGES } from './achievements';
import { buildLine } from './coach';
import { SEASON_PHRASES, PHRASES, TONES } from '../data/coachPhrases';

const ON = { enabled: true, theme: 'halloween', startsOn: '2026-10-24', endsOn: '2026-11-02' };

describe('tema de temporada', () => {
  beforeEach(() => localStorage.clear());

  it('normaliza a chave season e ignora tema desconhecido ou datas tortas', () => {
    expect(normalizeSeason(ON)).toEqual(ON);
    expect(normalizeSeason({ ...ON, theme: 'natal' })).toMatchObject({ enabled: false, theme: '' });
    expect(normalizeSeason({ ...ON, startsOn: '24/10' }).startsOn).toBe('');
    expect(normalizeSeason(null)).toEqual({ enabled: false, theme: '', startsOn: '', endsOn: '' });
    expect(normalizeConfig([{ key: 'season', value: ON }]).season).toEqual(ON);
    expect(normalizeConfig([]).season.enabled).toBe(false);
  });

  it('só fica no ar entre as duas datas, inclusive', () => {
    expect(activeSeason(ON, '2026-10-23')).toBe('');
    expect(activeSeason(ON, '2026-10-24')).toBe('halloween');
    expect(activeSeason(ON, '2026-11-02')).toBe('halloween');
    expect(activeSeason(ON, '2026-11-03')).toBe('');
    // sem data final não liga: decoração esquecida não fica para sempre
    expect(activeSeason({ ...ON, endsOn: '' }, '2026-10-25')).toBe('');
    expect(activeSeason({ ...ON, enabled: false }, '2026-10-25')).toBe('');
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
    expect(seasonalBadges('2026-10-19').map(b => b.id)).toEqual(['halloween_2026']);
    expect(seasonalBadges('2028-01-05').map(b => b.id)).toEqual(['halloween_2026', 'halloween_2027', 'halloween_2028']);
    const [b] = seasonalBadges('2026-10-19');
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
  const NOW = { enabled: true, theme: 'halloween', startsOn: '2000-01-01', endsOn: '2999-12-31' };

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
    cacheSeason({ ...NOW, endsOn: '2001-01-01' });
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
  });
});
