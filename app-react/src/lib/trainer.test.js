import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { clientAttention, sortClients, summarizeClient, normalizeTrainerCode, friendlyTrainerError } from './trainer';

const TODAY = '2026-10-10';

describe('clientAttention', () => {
  it('classifica pelos dias sem treinar', () => {
    expect(clientAttention({ last_day: '2026-10-10' }, TODAY)).toMatchObject({ level: 'ok', label: 'Treinou hoje' });
    expect(clientAttention({ last_day: '2026-10-09' }, TODAY).label).toBe('Treinou ontem');
    expect(clientAttention({ last_day: '2026-10-07' }, TODAY)).toMatchObject({ level: 'ok', days: 3 });
    expect(clientAttention({ last_day: '2026-10-05' }, TODAY)).toMatchObject({ level: 'atencao', days: 5 });
    expect(clientAttention({ last_day: '2026-10-02' }, TODAY)).toMatchObject({ level: 'risco', days: 8 });
  });
  it('pausa e aluno novo têm níveis próprios', () => {
    expect(clientAttention({ paused: true, last_day: '2026-01-01' }, TODAY).level).toBe('pausado');
    expect(clientAttention({ last_day: null }, TODAY).level).toBe('novo');
  });
});

describe('sortClients', () => {
  it('risco primeiro, pausados por último, nome desempata', () => {
    const list = [
      { id: 1, name: 'Zé', last_day: '2026-10-10' },
      { id: 2, name: 'Ana', last_day: '2026-10-01' },
      { id: 3, name: 'Bia', last_day: '2026-10-10', paused: true },
      { id: 4, name: 'Caio', last_day: '2026-10-10' },
    ];
    expect(sortClients(list, TODAY).map(c => c.id)).toEqual([2, 4, 1, 3]);
  });
});

describe('summarizeClient', () => {
  it('resume frequência, sequência, peso e medidas', () => {
    const detail = {
      training_days: ['2026-09-20', '2026-10-08', '2026-10-09', '2026-10-10'],
      weights: [{ d: '2026-09-01', v: '82' }, { d: '2026-10-01', v: '80.5' }],
      measurements: [{ d: '2026-09-01', cintura: 90 }, { d: '2026-10-01', cintura: 88 }],
      checkins: [],
    };
    const s = summarizeClient(detail, TODAY);
    expect(s).toMatchObject({ last7: 3, last30: 4, streak: 3, lastDay: '2026-10-10', weightDelta: -1.5 });
    expect(s.measureDeltas.cintura.diff).toBe(-2);
    expect(s.checkins).toBeNull();
  });
  it('sem dados não quebra', () => {
    const s = summarizeClient({}, TODAY);
    expect(s).toMatchObject({ last7: 0, streak: 0, lastDay: null, weightDelta: null });
  });
});

describe('textos', () => {
  it('normaliza código e traduz erros', () => {
    expect(normalizeTrainerCode(' p-ab12c ')).toBe('PAB12C');
    expect(friendlyTrainerError({ message: 'already_linked' })).toMatch(/já está vinculado/);
    expect(friendlyTrainerError({ message: 'x' })).toMatch(/Tente de novo/);
  });
});
