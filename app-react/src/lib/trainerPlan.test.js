import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import {
  emptyDraft, emptyDay, toggleDay, moveItem, draftFromPlan, buildPlanPayload, friendlyPlanError,
} from './trainerPlan';

describe('toggleDay', () => {
  it('adiciona em ordem da semana e remove ao desmarcar', () => {
    let d = emptyDraft();
    d = toggleDay(d, 'Quarta');
    d = toggleDay(d, 'Segunda');
    expect(d.days.map(x => x.dia)).toEqual(['Segunda', 'Quarta']);
    d = toggleDay(d, 'Segunda');
    expect(d.days.map(x => x.dia)).toEqual(['Quarta']);
  });
});

describe('moveItem', () => {
  it('troca vizinhos e respeita os limites', () => {
    expect(moveItem([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});

describe('buildPlanPayload', () => {
  const day = (dia, nomes) => ({ dia, foco: ' Peito ', exercicios: nomes.map(nome => ({ nome, series: '3', reps: '10', descanso: '60s', tecnica: '' })) });

  it('exige nome, dias e exercícios', () => {
    expect(buildPlanPayload({ name: '', weeks: '', days: [day('Segunda', ['Supino'])] }).ok).toBe(false);
    expect(buildPlanPayload({ name: 'Plano', weeks: '', days: [] }).ok).toBe(false);
    const r = buildPlanPayload({ name: 'Plano', weeks: '', days: [day('Segunda', ['  ', ''])] });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Segunda/);
  });

  it('limpa espaços, descarta linhas em branco e converte as semanas', () => {
    const r = buildPlanPayload({ name: ' Hipertrofia ', weeks: '8', days: [day('Segunda', ['Supino ', '']), day('Quarta', ['Agachamento'])] });
    expect(r.ok).toBe(true);
    expect(r.name).toBe('Hipertrofia');
    expect(r.weeks).toBe(8);
    expect(r.days[0]).toMatchObject({ dia: 'Segunda', foco: 'Peito' });
    expect(r.days[0].exercicios).toHaveLength(1);
    expect(r.days[0].exercicios[0].nome).toBe('Supino');
  });

  it('sem prazo vira null e passa de 20 exercícios é recusado', () => {
    expect(buildPlanPayload({ name: 'P', weeks: '', days: [day('Segunda', ['A'])] }).name).toBeUndefined(); // nome curto
    expect(buildPlanPayload({ name: 'Plano', weeks: '', days: [day('Segunda', ['A'])] }).weeks).toBeNull();
    const many = Array.from({ length: 21 }, (_, i) => `Ex ${i}`);
    expect(buildPlanPayload({ name: 'Plano', weeks: '', days: [day('Segunda', many)] }).ok).toBe(false);
  });
});

describe('draftFromPlan', () => {
  it('converte o plano ativo e ordena os dias', () => {
    const d = draftFromPlan({
      name: 'Plano X', duration_weeks: 6,
      days: [{ dia: 'Quarta', foco: 'Pernas', exercicios: [{ nome: 'Agachamento', series: '4', reps: '8', descanso: '90s', tecnica: null }] },
        { dia: 'Segunda', foco: null, exercicios: [] }],
    });
    expect(d.weeks).toBe('6');
    expect(d.days.map(x => x.dia)).toEqual(['Segunda', 'Quarta']);
    expect(d.days[1].exercicios[0].tecnica).toBe('');
    expect(draftFromPlan(null)).toEqual(emptyDraft());
  });
});

describe('friendlyPlanError', () => {
  it('traduz códigos conhecidos', () => {
    expect(friendlyPlanError({ message: 'invalid_exercises' })).toMatch(/1 a 20 exercícios/);
    expect(friendlyPlanError({ message: 'x' })).toMatch(/Tente de novo/);
    expect(emptyDay('Sexta').exercicios).toHaveLength(1);
  });
});
