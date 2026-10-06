import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { renderTemplate, countByKind, describeSchedule } from './autoNotifications';

describe('renderTemplate', () => {
  it('troca placeholders pelos valores de exemplo', () => {
    expect(renderTemplate('{nome}, faltam {faltam} treino(s)')).toBe('Ana, faltam 2 treino(s)');
  });

  it('limpa placeholder desconhecido e pontuação solta', () => {
    expect(renderTemplate('Oi {xyz}, bora?', {})).toBe('Oi, bora?');
  });

  it('aguenta template vazio', () => {
    expect(renderTemplate(undefined)).toBe('');
  });
});

describe('countByKind', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const day = 86400000;
  const at = (daysAgo) => new Date(now.getTime() - daysAgo * day).toISOString();

  it('conta 7 e 30 dias por tipo e ignora o que passou de 30', () => {
    const out = countByKind([
      { kind: 'comeback', created_at: at(1) },
      { kind: 'comeback', created_at: at(10) },
      { kind: 'comeback', created_at: at(40) },
      { kind: 'workout_today', created_at: at(2) },
    ], now);
    expect(out.comeback).toEqual({ d7: 1, d30: 2 });
    expect(out.workout_today).toEqual({ d7: 1, d30: 1 });
  });
});

describe('describeSchedule', () => {
  it('descreve todos os dias', () => {
    expect(describeSchedule({ send_hour: 9, weekdays: null })).toBe('todos os dias às 09h');
  });

  it('lista os dias da semana em ordem', () => {
    expect(describeSchedule({ send_hour: 18, weekdays: [5, 4] })).toBe('Qui, Sex às 18h');
  });
});
