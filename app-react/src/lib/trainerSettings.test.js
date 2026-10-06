import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { weekOverview, INACTIVE_DAY_CHOICES, ALERT_OPTIONS, DEFAULT_SETTINGS } from './trainerSettings';

describe('weekOverview', () => {
  it('conta alunos ativos, parados e treinos da semana', () => {
    const o = weekOverview([{ days7: 3 }, { days7: 0 }, { days7: 1 }, { days7: 0 }]);
    expect(o).toEqual({ total: 4, active: 2, sessions: 4, idle: 2 });
  });
  it('sem alunos zera tudo', () => {
    expect(weekOverview([])).toEqual({ total: 0, active: 0, sessions: 0, idle: 0 });
  });
});

describe('configuração padrão', () => {
  it('prazo padrão está entre as opções e todo alerta tem texto', () => {
    expect(INACTIVE_DAY_CHOICES).toContain(DEFAULT_SETTINGS.days);
    for (const o of ALERT_OPTIONS) expect(o.label && o.hint).toBeTruthy();
    expect(ALERT_OPTIONS.map(o => o.key).sort()).toEqual(['inactive', 'pain', 'pr', 'weekly']);
  });
});
