import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { templateSummary, templateToPlan, friendlyTemplateError } from './trainerTemplates';
import { draftFromPlan } from './trainerPlan';

const tpl = {
  id: '1', name: 'Hipertrofia A', weeks: 8,
  days: [
    { dia: 'Segunda', foco: 'Peito', exercicios: [{ nome: 'Supino', series: '4', reps: '8', descanso: '90s', tecnica: '' }, { nome: 'Crucifixo' }] },
    { dia: 'Quarta', foco: 'Pernas', exercicios: [{ nome: 'Agachamento' }] },
  ],
};

describe('templateSummary', () => {
  it('conta dias, exercícios e semanas', () => {
    expect(templateSummary(tpl)).toBe('2 dias · 3 exercícios · 8 semanas');
    expect(templateSummary({ days: [], weeks: null })).toBe('0 dias · 0 exercícios');
  });
});

describe('templateToPlan', () => {
  it('vira um rascunho válido do construtor', () => {
    const draft = draftFromPlan(templateToPlan(tpl));
    expect(draft.name).toBe('Hipertrofia A');
    expect(draft.weeks).toBe('8');
    expect(draft.days.map(d => d.dia)).toEqual(['Segunda', 'Quarta']);
    expect(draft.days[0].exercicios[1]).toMatchObject({ nome: 'Crucifixo', series: '', reps: '' });
  });
});

describe('friendlyTemplateError', () => {
  it('traduz erros conhecidos', () => {
    expect(friendlyTemplateError({ message: 'too_many_templates' })).toMatch(/50 modelos/);
    expect(friendlyTemplateError({ message: 'no_recipients' })).toMatch(/vinculado/);
    expect(friendlyTemplateError({ message: 'zzz' })).toMatch(/Tente de novo/);
  });
});
