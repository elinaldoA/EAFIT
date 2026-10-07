import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ speak: vi.fn(), cancel: vi.fn(), supported: true }));
vi.mock('./voice', () => ({
  speak: (...a) => h.speak(...a),
  cancelSpeech: () => h.cancel(),
  isVoiceSupported: () => h.supported,
}));

import {
  getCoachPrefs, saveCoachPrefs, syncCoachPrefs, buildLine, coachSay, coachStop, coachSample,
  pickLine, greeting, speechTime, speechReps, speechExercise, speechDetail, coachName, isCoachAvailable,
} from './coach';
import { PHRASES, TONES } from '../data/coachPhrases';

beforeEach(() => {
  localStorage.clear();
  h.speak.mockClear();
  h.cancel.mockClear();
  h.supported = true;
  coachStop();
});

describe('preferências', () => {
  it('padrão: desligado, voz feminina, tom animado', () => {
    expect(getCoachPrefs()).toMatchObject({ enabled: false, gender: 'female', tone: 'animado', frequency: 'full', rate: 1 });
  });

  it('saveCoachPrefs mescla e persiste', () => {
    saveCoachPrefs({ enabled: true, gender: 'male' });
    expect(getCoachPrefs()).toMatchObject({ enabled: true, gender: 'male', tone: 'animado' });
  });

  it('JSON inválido volta ao padrão', () => {
    localStorage.setItem('coach_prefs', '{quebrado');
    expect(getCoachPrefs().enabled).toBe(false);
  });

  it('syncCoachPrefs traz o perfil da conta e usa só o primeiro nome (apelido primeiro)', () => {
    syncCoachPrefs({ user_metadata: { nome: 'Maria Souza', apelido: '', coachEnabled: true, coachGender: 'male', coachTone: 'zoeira', coachFrequency: 'light', coachRate: 1.1 } });
    expect(getCoachPrefs()).toMatchObject({ name: 'Maria', enabled: true, gender: 'male', tone: 'zoeira', frequency: 'light', rate: 1.1 });
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

  it('coachName e disponibilidade', () => {
    expect(coachName('female')).toBe('Bia');
    expect(coachName('male')).toBe('Beto');
    expect(coachName('x')).toBe('Bia');
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
});

describe('frases', () => {
  it('todo tom tem todas as situações com ao menos 3 variações', () => {
    const events = ['start', 'exercise', 'rest', 'rest10', 'restDone', 'pr', 'finish'];
    for (const tone of TONES) {
      for (const ev of events) expect(PHRASES[tone][ev].length, `${tone}.${ev}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('todo placeholder usado nas frases é conhecido', () => {
    const known = new Set(['nome', 'coach', 'saudacao', 'foco', 'exercicio', 'detalhe', 'tempo', 'carga', 'feitos', 'meta']);
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
    const prefs = { ...getCoachPrefs(), tone: 'animado', gender: 'male', name: 'Ana' };
    const line = buildLine('rest', { tempo: '60 segundos' }, prefs, () => 0);
    expect(line).toContain('60 segundos');
    expect(line).not.toMatch(/[{}]/);
    expect(buildLine('evento-inexistente', {}, prefs)).toBeNull();
  });

  it('buildLine nunca deixa placeholder sem preencher em nenhuma frase', () => {
    for (const tone of TONES) for (const ev of Object.keys(PHRASES[tone])) {
      for (let i = 0; i < 12; i++) {
        const text = buildLine(ev, { foco: 'Peito', exercicio: 'Supino', detalhe: '3 séries', tempo: '60 segundos', carga: 40, feitos: 2, meta: 5 }, { ...getCoachPrefs(), tone, name: i % 2 ? 'Ana' : '' });
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
    saveCoachPrefs({ enabled: true, gender: 'male', tone: 'calmo', rate: 1.1 });
    expect(coachSay('rest', { tempo: '30 segundos' })).toBe(true);
    const [text, opts] = h.speak.mock.calls[0];
    expect(text).toContain('30 segundos');
    expect(opts).toMatchObject({ gender: 'male', queue: false });
    expect(opts.rate).toBeCloseTo(0.95 * 1.1);
  });

  it('modo "só o essencial" pula exercício e descanso, mas fala recorde', () => {
    saveCoachPrefs({ enabled: true, frequency: 'light' });
    expect(coachSay('exercise', { exercicio: 'Supino', detalhe: '3 séries' })).toBe(false);
    expect(coachSay('rest', { tempo: '30 segundos' })).toBe(false);
    expect(coachSay('pr', { exercicio: 'Supino', carga: 50 })).toBe(true);
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
