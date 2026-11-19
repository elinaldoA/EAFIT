import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { validateChallenge, toDraft, challengeSituation, goalText, valueText, friendlyChallengeError, EMPTY_CHALLENGE } from './runChallenges';

const ok = { title: 'Desafio de dezembro', description: '', metric: 'km', goal: '100', start_date: '2026-12-01', end_date: '2026-12-31' };

describe('validateChallenge', () => {
  it('aceita um desafio válido e normaliza os campos', () => {
    const r = validateChallenge({ ...ok, title: '  Desafio de dezembro  ', goal: '42,5' });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ title: 'Desafio de dezembro', description: null, metric: 'km', goal: 42.5, start_date: '2026-12-01', end_date: '2026-12-31' });
  });

  it('recusa nome curto, meta inválida e tipo desconhecido', () => {
    expect(validateChallenge({ ...ok, title: 'ab' }).errors.title).toBeTruthy();
    expect(validateChallenge({ ...ok, goal: '' }).errors.goal).toBeTruthy();
    expect(validateChallenge({ ...ok, goal: '0' }).errors.goal).toBeTruthy();
    expect(validateChallenge({ ...ok, goal: '-5' }).errors.goal).toBeTruthy();
    expect(validateChallenge({ ...ok, metric: 'pace' }).errors.metric).toBeTruthy();
  });

  it('número de corridas precisa ser inteiro', () => {
    expect(validateChallenge({ ...ok, metric: 'runs', goal: '12,5' }).errors.goal).toMatch(/inteiro/);
    expect(validateChallenge({ ...ok, metric: 'runs', goal: '12' }).ok).toBe(true);
  });

  it('período: fim depois do início e até 92 dias', () => {
    expect(validateChallenge({ ...ok, end_date: '2026-11-30' }).errors.end_date).toMatch(/antes do início/);
    expect(validateChallenge({ ...ok, end_date: '2027-03-31' }).errors.end_date).toMatch(/92 dias/);
    expect(validateChallenge({ ...ok, end_date: '2027-03-03' }).ok).toBe(true);
    expect(validateChallenge({ ...ok, start_date: '' }).errors.start_date).toBeTruthy();
  });

  it('descrição passa de 300 caracteres', () => {
    expect(validateChallenge({ ...ok, description: 'x'.repeat(301) }).errors.description).toBeTruthy();
  });
});

describe('helpers', () => {
  it('toDraft devolve o formulário a partir da linha do banco', () => {
    const d = toDraft({ title: 'X', description: null, metric: 'hours', goal: 10, start_date: '2026-12-01', end_date: '2026-12-31' });
    expect(d).toEqual({ ...EMPTY_CHALLENGE, title: 'X', metric: 'hours', goal: '10', start_date: '2026-12-01', end_date: '2026-12-31' });
    expect(toDraft({ ...ok, goal: 42.5 }).goal).toBe('42,5');
    expect(toDraft({ ...ok, goal: '100.0' }).goal).toBe('100');
  });

  it('situação pelo período', () => {
    const c = { start_date: '2026-12-01', end_date: '2026-12-31' };
    expect(challengeSituation(c, '2026-11-30')).toBe('futuro');
    expect(challengeSituation(c, '2026-12-31')).toBe('ativo');
    expect(challengeSituation(c, '2027-01-01')).toBe('encerrado');
  });

  it('textos de meta e de total', () => {
    expect(goalText({ metric: 'km', goal: 100 })).toBe('100 km');
    expect(goalText({ metric: 'hours', goal: 7.5 })).toBe('7,5 h');
    expect(goalText({ metric: 'runs', goal: 12 })).toBe('12 corridas');
    expect(valueText('km', 30.04)).toBe('30 km');
    expect(valueText('hours', 2.25)).toBe('2,3 h');
    expect(valueText('runs', 7)).toBe('7');
  });

  it('erro amigável quando falta a migration ou o papel', () => {
    expect(friendlyChallengeError({ code: '42P01' })).toMatch(/migration/);
    expect(friendlyChallengeError({ message: 'new row violates row-level security policy' })).toMatch(/papel/);
    expect(friendlyChallengeError({ message: 'forbidden' })).toMatch(/papel/);
    expect(friendlyChallengeError({ message: 'outro' })).toBe('outro');
  });
});
