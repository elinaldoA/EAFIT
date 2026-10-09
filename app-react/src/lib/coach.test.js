import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ speak: vi.fn(), cancel: vi.fn(), supported: true }));
vi.mock('./voice', () => ({
  speak: (...a) => h.speak(...a),
  cancelSpeech: () => h.cancel(),
  isVoiceSupported: () => h.supported,
}));

import {
  getCoachPrefs, saveCoachPrefs, syncCoachPrefs, buildLine, coachSay, coachStop, coachSample,
  pickLine, greeting, speechTime, speechReps, speechExercise, speechDetail, isCoachAvailable,
  speechLoad, speechTip, setDoneEvent, weekEvent, coachSuggest, coachRestTip, FINISH_EVENTS,
} from './coach';
import { PHRASES, TONES, LIGHT_EVENTS, FREE_EVENTS } from '../data/coachPhrases';

beforeEach(() => {
  localStorage.clear();
  h.speak.mockClear();
  h.cancel.mockClear();
  h.supported = true;
  coachStop();
});

describe('preferências', () => {
  it('padrão: desligado, voz feminina, tom animado', () => {
    expect(getCoachPrefs()).toMatchObject({ enabled: false, voiceName: '', tone: 'animado', frequency: 'full', rate: 1 });
  });

  it('saveCoachPrefs mescla e persiste', () => {
    saveCoachPrefs({ enabled: true, voiceName: 'Luciana' });
    expect(getCoachPrefs()).toMatchObject({ enabled: true, voiceName: 'Luciana', tone: 'animado' });
  });

  it('JSON inválido volta ao padrão', () => {
    localStorage.setItem('coach_prefs', '{quebrado');
    expect(getCoachPrefs().enabled).toBe(false);
  });

  it('syncCoachPrefs traz o perfil da conta e usa só o primeiro nome (apelido primeiro)', () => {
    syncCoachPrefs({ user_metadata: { nome: 'Maria Souza', apelido: '', coachEnabled: true, coachTone: 'zoeira', coachFrequency: 'light', coachRate: 1.1 } });
    expect(getCoachPrefs()).toMatchObject({ name: 'Maria', enabled: true, tone: 'zoeira', frequency: 'light', rate: 1.1 });
    syncCoachPrefs({ user_metadata: { nome: 'Maria', apelido: 'Mari' } });
    expect(getCoachPrefs().name).toBe('Mari');
  });

  it('syncCoachPrefs sem metadados não apaga escolhas locais e ignora tom inválido', () => {
    saveCoachPrefs({ enabled: true, tone: 'calmo' });
    syncCoachPrefs({ user_metadata: { coachTone: 'invalido' } });
    expect(getCoachPrefs()).toMatchObject({ enabled: true, tone: 'calmo' });
    syncCoachPrefs(null);
    expect(getCoachPrefs().enabled).toBe(true);
  });

  it('syncCoachPrefs aceita o modo "à vontade" e ignora frequência desconhecida', () => {
    syncCoachPrefs({ user_metadata: { coachFrequency: 'free' } });
    expect(getCoachPrefs().frequency).toBe('free');
    syncCoachPrefs({ user_metadata: { coachFrequency: 'tagarela' } });
    expect(getCoachPrefs().frequency).toBe('free');
  });

  it('disponibilidade depende do suporte do navegador', () => {
    expect(isCoachAvailable()).toBe(true);
    h.supported = false;
    expect(isCoachAvailable()).toBe(false);
  });
});

describe('formatação para a fala', () => {
  it('greeting por período', () => {
    expect(greeting(new Date(2026, 0, 1, 8))).toBe('Bom dia');
    expect(greeting(new Date(2026, 0, 1, 15))).toBe('Boa tarde');
    expect(greeting(new Date(2026, 0, 1, 21))).toBe('Boa noite');
  });

  it('speechTime por extenso', () => {
    expect(speechTime(45)).toBe('45 segundos');
    expect(speechTime(1)).toBe('1 segundo');
    expect(speechTime(60)).toBe('1 minuto');
    expect(speechTime(90)).toBe('1 minuto e 30 segundos');
    expect(speechTime(121)).toBe('2 minutos e 1 segundo');
  });

  it('speechReps converte faixas e unidades', () => {
    expect(speechReps('8-10')).toBe('8 a 10');
    expect(speechReps('30s')).toBe('30 segundos');
    expect(speechReps('20min · Moderado')).toBe('20 minutos, Moderado');
    expect(speechReps(undefined)).toBe('');
  });

  it('speechExercise tira o emoji do início', () => {
    expect(speechExercise('🔷 Prancha')).toBe('Prancha');
    expect(speechExercise('Supino Reto')).toBe('Supino Reto');
    expect(speechExercise(null)).toBe('');
  });

  it('speechDetail: séries e repetições, ou só as repetições', () => {
    expect(speechDetail({ series: '3', reps: '8-10' })).toBe('3 séries de 8 a 10');
    expect(speechDetail({ series: '1', reps: '12' })).toBe('1 série de 12');
    expect(speechDetail({ series: '-', reps: '30-40min' })).toBe('30 a 40 minutos');
    expect(speechDetail(undefined)).toBe('');
  });

  it('speechLoad troca o ponto decimal por vírgula', () => {
    expect(speechLoad(42.5)).toBe('42,5');
    expect(speechLoad(40)).toBe('40');
    expect(speechLoad(undefined)).toBe('');
  });

  it('speechTip prepara a dica técnica e descarta o que não dá para falar', () => {
    expect(speechTip('Cadência 2-0-2')).toBe('cadência 2, 0, 2');
    expect(speechTip('Full ROM')).toBe('amplitude completa');
    expect(speechTip('Cotovelos fixos.')).toBe('cotovelos fixos');
    expect(speechTip('-')).toBe('');
    expect(speechTip(undefined)).toBe('');
    expect(speechTip('a'.repeat(121))).toBe('');
  });
});

describe('contexto do treino', () => {
  it('setDoneEvent escolhe do mais marcante para o mais comum', () => {
    expect(setDoneEvent({ leftInExercise: 0, leftInWorkout: 0, crossedHalf: true })).toBe('allDone');
    expect(setDoneEvent({ leftInExercise: 0, leftInWorkout: 6, crossedHalf: true })).toBe('exerciseDone');
    expect(setDoneEvent({ leftInExercise: 1, leftInWorkout: 6, crossedHalf: true })).toBe('halfway');
    expect(setDoneEvent({ leftInExercise: 1, leftInWorkout: 6, crossedHalf: false })).toBe('lastSet');
    expect(setDoneEvent({ leftInExercise: 2, leftInWorkout: 6, crossedHalf: false })).toBe('rest');
  });

  it('weekEvent comenta só o primeiro e o último treino da meta', () => {
    expect(weekEvent({ done: 0, total: 5 })).toBe('weekFirst');
    expect(weekEvent({ done: 4, total: 5 })).toBe('weekLast');
    expect(weekEvent({ done: 2, total: 5 })).toBeNull();
    expect(weekEvent({ done: 5, total: 5 })).toBeNull();
    expect(weekEvent({ done: 0, total: 1 })).toBeNull();
    expect(weekEvent({ done: 0, total: 0 })).toBeNull();
  });
});

describe('frases', () => {
  it('todo tom tem todas as situações com ao menos 3 variações', () => {
    const events = [
      'start', 'startOther', 'review', 'exercise', 'rest', 'rest10', 'restDone', 'pr', 'finish',
      'weekFirst', 'weekLast', 'weekGoal', 'suggestLoad', 'suggestReps', 'plateau', 'lastSet', 'exerciseDone',
      'halfway', 'allDone', 'finishStats', 'technique', 'tip', 'idle', 'paused', 'resumed',
    ];
    for (const tone of TONES) {
      for (const ev of events) expect(PHRASES[tone][ev].length, `${tone}.${ev}`).toBeGreaterThanOrEqual(3);
      expect(Object.keys(PHRASES[tone]).sort(), tone).toEqual([...events].sort());
    }
  });

  it('as listas de nível só citam situações que existem', () => {
    for (const ev of [...LIGHT_EVENTS, ...FREE_EVENTS, ...FINISH_EVENTS]) {
      for (const tone of TONES) expect(PHRASES[tone][ev], `${tone}.${ev}`).toBeDefined();
    }
  });

  it('o último exercício não tem próximo: sobra fala sem {proximo}', () => {
    const prefs = { ...getCoachPrefs(), name: 'Ana' };
    for (const tone of TONES) for (let i = 0; i < 12; i++) {
      expect(buildLine('exerciseDone', { tempo: '60 segundos' }, { ...prefs, tone }), tone).not.toMatch(/[{}]/);
    }
  });

  it('todo placeholder usado nas frases é conhecido', () => {
    const known = new Set([
      'dia', 'nome', 'saudacao', 'foco', 'exercicio', 'detalhe', 'tempo', 'carga', 'feitos', 'meta',
      'proximo', 'ultimaCarga', 'ultimasReps', 'sugestao', 'repsAlvo', 'dica', 'duracao', 'series',
    ]);
    for (const tone of TONES) for (const lines of Object.values(PHRASES[tone])) for (const l of lines) {
      for (const m of l.matchAll(/\{(\w+)\}/g)) expect(known.has(m[1]), `${m[1]} em "${l}"`).toBe(true);
    }
  });

  it('pickLine só sorteia falas que dá para preencher (sem nome, sem {nome})', () => {
    const lines = ['Oi {nome}!', 'Bora!'];
    for (let i = 0; i < 10; i++) expect(pickLine(lines, 'k-semnome', {}, () => 0)).toBe('Bora!');
  });

  it('pickLine não repete a fala recente enquanto houver outras', () => {
    const lines = ['a', 'b', 'c'];
    const first = pickLine(lines, 'k-rep', {}, () => 0);
    const second = pickLine(lines, 'k-rep', {}, () => 0);
    expect(second).not.toBe(first);
    const third = pickLine(lines, 'k-rep', {}, () => 0);
    expect([first, second]).not.toContain(third);
  });

  it('pickLine com uma única fala repete mesmo assim', () => {
    expect(pickLine(['só'], 'k-uma', {}, () => 0)).toBe('só');
    expect(pickLine(['só'], 'k-uma', {}, () => 0)).toBe('só');
  });

  it('buildLine preenche os dados e devolve null para situação desconhecida', () => {
    const prefs = { ...getCoachPrefs(), tone: 'animado', name: 'Ana' };
    const line = buildLine('rest', { tempo: '60 segundos' }, prefs, () => 0);
    expect(line).toContain('60 segundos');
    expect(line).not.toMatch(/[{}]/);
    expect(buildLine('evento-inexistente', {}, prefs)).toBeNull();
  });

  it('buildLine nunca deixa placeholder sem preencher em nenhuma frase', () => {
    for (const tone of TONES) for (const ev of Object.keys(PHRASES[tone])) {
      for (let i = 0; i < 12; i++) {
        const text = buildLine(ev, {
          foco: 'Peito', dia: 'Segunda', exercicio: 'Supino', detalhe: '3 séries', tempo: '60 segundos', carga: 40, feitos: 2, meta: 5,
          proximo: 'Crucifixo', ultimaCarga: '40', ultimasReps: 10, sugestao: '42,5', repsAlvo: 11, dica: 'cotovelos fixos', duracao: '50 minutos', series: 24,
        }, { ...getCoachPrefs(), tone, name: i % 2 ? 'Ana' : '' });
        expect(text, `${tone}.${ev}`).not.toMatch(/[{}]/);
      }
    }
  });
});

describe('coachSay', () => {
  it('não fala com a voz desligada', () => {
    expect(coachSay('start', { foco: 'Peito' })).toBe(false);
    expect(h.speak).not.toHaveBeenCalled();
  });

  it('não fala sem suporte do navegador', () => {
    saveCoachPrefs({ enabled: true });
    h.supported = false;
    expect(coachSay('start', { foco: 'Peito' })).toBe(false);
  });

  it('fala com a voz e o tom escolhidos', () => {
    saveCoachPrefs({ enabled: true, voiceName: 'Luciana', tone: 'calmo', rate: 1.1 });
    expect(coachSay('rest', { tempo: '30 segundos' })).toBe(true);
    const [text, opts] = h.speak.mock.calls[0];
    expect(text).toContain('30 segundos');
    expect(opts).toMatchObject({ voiceName: 'Luciana', queue: false });
    expect(opts).not.toHaveProperty('gender');
    expect(opts.rate).toBeCloseTo(0.95 * 1.1);
  });

  it('modo "só o essencial" pula exercício e descanso, mas fala recorde', () => {
    saveCoachPrefs({ enabled: true, frequency: 'light' });
    expect(coachSay('exercise', { exercicio: 'Supino', detalhe: '3 séries' })).toBe(false);
    expect(coachSay('rest', { tempo: '30 segundos' })).toBe(false);
    expect(coachSay('pr', { exercicio: 'Supino', carga: 50 })).toBe(true);
  });

  it('modo completo comenta o andamento, mas não toma a iniciativa', () => {
    saveCoachPrefs({ enabled: true, frequency: 'full' });
    expect(coachSay('halfway', { tempo: '60 segundos' })).toBe(true);
    expect(coachSay('idle', { exercicio: 'Supino' })).toBe(false);
    expect(coachSay('paused')).toBe(false);
    expect(coachRestTip({ tecnica: 'Cotovelos fixos', seconds: 60, techniqueSaid: false }, () => 0)).toBeNull();
  });

  it('modo "só o essencial" ainda comenta a semana, mas não o andamento', () => {
    saveCoachPrefs({ enabled: true, frequency: 'light' });
    expect(coachSay('weekLast')).toBe(true);
    expect(coachSay('weekGoal')).toBe(true);
    expect(coachSay('halfway', { tempo: '60 segundos' })).toBe(false);
    expect(coachSuggest({ lastCarga: 40, lastReps: 10, suggestedCarga: 42.5, suggestedReps: null }, null)).toBe(false);
  });

  it('modo "à vontade" libera pausa, retomada e o chamado de volta', () => {
    saveCoachPrefs({ enabled: true, frequency: 'free' });
    expect(coachSay('paused')).toBe(true);
    expect(coachSay('resumed')).toBe(true);
    expect(coachSay('idle', { exercicio: 'Supino' })).toBe(true);
    expect(h.speak.mock.calls[2][0]).toContain('Supino');
  });

  it('coachSuggest fala a carga nova, as repetições alvo ou a estagnação', () => {
    saveCoachPrefs({ enabled: true });
    expect(coachSuggest({ lastCarga: 40, lastReps: 10, suggestedCarga: 42.5, suggestedReps: null }, null)).toBe(true);
    expect(h.speak.mock.calls[0][0]).toContain('42,5');
    expect(h.speak.mock.calls[0][1]).toMatchObject({ queue: true });

    expect(coachSuggest({ lastCarga: 40, lastReps: 8, suggestedCarga: 40, suggestedReps: 9 }, null)).toBe(true);
    expect(h.speak.mock.calls[1][0]).toMatch(/\b9\b/);
    expect(h.speak.mock.calls[1][0]).not.toMatch(/[{}]/);

    expect(coachSuggest({ lastCarga: 40, lastReps: 8, suggestedCarga: 40, suggestedReps: 9 }, { lastCarga: 40, suggestedDeload: 36 })).toBe(true);
    expect(h.speak.mock.calls[2][0]).toContain('36');

    expect(coachSuggest(null, null)).toBe(false);
  });

  it('coachRestTip: técnica uma vez por exercício, depois dica geral de vez em quando', () => {
    saveCoachPrefs({ enabled: true, frequency: 'free' });
    expect(coachRestTip({ tecnica: 'Cotovelos fixos', seconds: 60, techniqueSaid: false }, () => 0.99)).toBe('technique');
    expect(h.speak.mock.calls[0][0]).toContain('cotovelos fixos');
    expect(h.speak.mock.calls[0][1]).toMatchObject({ queue: true });
    expect(coachRestTip({ tecnica: 'Cotovelos fixos', seconds: 60, techniqueSaid: true }, () => 0.99)).toBeNull();
    expect(coachRestTip({ tecnica: 'Cotovelos fixos', seconds: 60, techniqueSaid: true }, () => 0)).toBe('tip');
    expect(coachRestTip({ tecnica: '', seconds: 60, techniqueSaid: false }, () => 0)).toBe('tip');
    // descanso curto não comporta dica
    expect(coachRestTip({ tecnica: 'Cotovelos fixos', seconds: 30, techniqueSaid: false }, () => 0)).toBeNull();
    expect(h.speak).toHaveBeenCalledTimes(3);
  });

  it('delayMs agenda a fala e coachStop cancela, exceto o que for mantido', () => {
    vi.useFakeTimers();
    saveCoachPrefs({ enabled: true });
    coachSay('restDone', {}, { delayMs: 3900 });
    coachSay('finish', { feitos: 3, meta: 5 }, { delayMs: 900 });
    coachStop({ keep: ['finish'] });
    vi.advanceTimersByTime(5000);
    expect(h.speak).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('coachSample fala mesmo com a voz desligada', () => {
    expect(coachSample()).toBe(true);
    expect(h.speak).toHaveBeenCalled();
  });
});
