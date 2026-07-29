import { describe, it, expect, vi, beforeEach } from 'vitest';

// records.js importa lib/supabase.js, que chama createClient() na hora do
// import — sem VITE_SUPABASE_URL (não setado no step de test do CI) isso
// lança. Mocka pra manter o teste isolado de configuração de ambiente, e pra
// controlar o retorno de db.from(...) em cada teste.
const { mockDb } = vi.hoisted(() => ({ mockDb: { from: vi.fn() } }));
vi.mock('./supabase', () => ({ db: mockDb }));

import { estimateOneRepMax, fetchProgressionSuggestion, fetchPlateauStatus } from './records';

beforeEach(() => {
  mockDb.from.mockClear();
});

// Simula o query builder encadeável do supabase-js: qualquer método de filtro
// devolve a própria chain, e ela é "thenable" — await resolve pro resultado
// configurado, igual uma Promise real do client.
function chainResolving(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    not: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

function mockSets(sets) {
  mockDb.from.mockReturnValue(chainResolving({
    data: sets.map(s => ({ carga: s.carga, reps: s.reps, workouts: { user_id: 'u1', workout_date: s.date } })),
    error: null,
  }));
}

describe('estimateOneRepMax', () => {
  it('aplica a fórmula de Epley pra reps > 1', () => {
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.67, 1);
  });

  it('retorna a própria carga quando reps = 1', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
  });

  it('retorna null pra inputs inválidos', () => {
    expect(estimateOneRepMax('abc', 5)).toBeNull();
    expect(estimateOneRepMax(100, 0)).toBeNull();
    expect(estimateOneRepMax(100, -1)).toBeNull();
  });
});

describe('fetchProgressionSuggestion', () => {
  it('bateu o teto da faixa: sugere +2,5kg e nenhum alvo de reps', async () => {
    mockSets([
      { carga: 47.5, reps: 8, date: '2026-06-24' },
      { carga: 50, reps: 10, date: '2026-07-01' },
      { carga: 50, reps: 10, date: '2026-07-01' },
    ]);

    const result = await fetchProgressionSuggestion('u1', 'Supino Reto', '8-10');

    expect(result).toEqual({
      lastCarga: 50,
      lastReps: 10,
      suggestedCarga: 52.5,
      suggestedReps: null,
      hitCeiling: true,
    });
  });

  it('não bateu o teto: repete a carga e sugere +1 rep (dupla progressão)', async () => {
    mockSets([{ carga: 50, reps: 8, date: '2026-07-01' }]);

    const result = await fetchProgressionSuggestion('u1', 'Supino Reto', '8-10');

    expect(result).toEqual({
      lastCarga: 50,
      lastReps: 8,
      suggestedCarga: 50,
      suggestedReps: 9,
      hitCeiling: false,
    });
  });

  it('capa o alvo de reps no teto da faixa', async () => {
    mockSets([{ carga: 50, reps: 10, date: '2026-07-01' }, { carga: 50, reps: 9, date: '2026-07-01' }]);

    const result = await fetchProgressionSuggestion('u1', 'Supino Reto', '8-10');

    // Uma das séries não bateu o teto (9 < 10) -> hitCeiling false pro grupo,
    // alvo de reps sobe a partir da melhor série (10), mas não passa do teto.
    expect(result.hitCeiling).toBe(false);
    expect(result.suggestedReps).toBe(10);
  });

  it('retorna null sem histórico', async () => {
    mockSets([]);
    expect(await fetchProgressionSuggestion('u1', 'Supino Reto', '8-10')).toBeNull();
  });

  it('retorna null pra faixa de reps não numérica', async () => {
    const result = await fetchProgressionSuggestion('u1', 'Prancha', 'até a falha');
    expect(result).toBeNull();
    expect(mockDb.from).not.toHaveBeenCalled();
  });
});

describe('fetchPlateauStatus', () => {
  it('detecta estagnação após 3 sessões na mesma carga/reps sem bater o teto', async () => {
    mockSets([
      { carga: 50, reps: 8, date: '2026-06-17' },
      { carga: 50, reps: 8, date: '2026-06-24' },
      { carga: 50, reps: 8, date: '2026-07-01' },
    ]);

    const result = await fetchPlateauStatus('u1', 'Supino Reto', '8-10');

    expect(result).toEqual({
      sessionsStuck: 3, lastCarga: 50, suggestedDeload: 45,
    });
  });

  it('não sinaliza platô se os reps estão progredindo', async () => {
    mockSets([
      { carga: 50, reps: 6, date: '2026-06-17' },
      { carga: 50, reps: 7, date: '2026-06-24' },
      { carga: 50, reps: 8, date: '2026-07-01' },
    ]);

    expect(await fetchPlateauStatus('u1', 'Supino Reto', '8-10')).toBeNull();
  });

  it('retorna null com menos de 3 sessões distintas', async () => {
    mockSets([{ carga: 50, reps: 8, date: '2026-07-01' }]);
    expect(await fetchPlateauStatus('u1', 'Supino Reto', '8-10')).toBeNull();
  });
});
