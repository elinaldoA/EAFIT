import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc, mockInsert } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockInsert: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc, from: () => ({ insert: mockInsert }) } }));

import { buildPlanExport, parsePlanFile, summarizePlan, importPlanForUser } from './workoutPlanFile';

const active = {
  name: 'Plano A', duration_weeks: 4,
  plan_days: [
    { dia: 'Seg', foco: 'Peito', plan_exercises: [
      { nome: 'Supino', series: 3, reps: '10', descanso: '60s', tecnica: '', grupo: 'A', aquecimento: 2, is_post_workout: false },
      { nome: 'Prancha', series: 3, reps: '30s', descanso: '30s', is_post_workout: true },
    ] },
    { dia: 'Ter', foco: 'Descanso', plan_exercises: [] },
  ],
};

beforeEach(() => { vi.clearAllMocks(); mockInsert.mockResolvedValue({ error: null }); });

describe('workoutPlanFile', () => {
  it('exporta e reimporta o mesmo plano', () => {
    const res = parsePlanFile(JSON.stringify(buildPlanExport(active)));
    expect(res.plan.name).toBe('Plano A');
    expect(res.plan.durationWeeks).toBe(4);
    expect(res.plan.days[0].exercicios[0]).toMatchObject({ nome: 'Supino Reto com Barra', series: '3', grupo: 'A', aquecimento: 2 });
    expect(res.plan.days[0].pos[0].nome).toBe('Prancha Frontal Estática');
    expect(summarizePlan(res.plan)).toEqual({ days: 2, exercises: 2, withDemo: 2 });
  });

  it('recusa JSON inválido, arquivo de outro tipo e plano vazio', () => {
    expect(parsePlanFile('{oops').error).toMatch(/JSON/);
    expect(parsePlanFile('{"kind":"x"}').error).toMatch(/não é um plano/);
    expect(parsePlanFile(JSON.stringify({ kind: 'eafit-workout-plan', version: 1, days: [] })).error).toMatch(/nenhum dia/);
    expect(parsePlanFile(JSON.stringify({ kind: 'eafit-workout-plan', version: 9, days: [{}] })).error).toMatch(/Versão/);
  });

  it('normaliza campos que o banco restringe', () => {
    const res = parsePlanFile(JSON.stringify({
      kind: 'eafit-workout-plan', version: 1, durationWeeks: 99,
      days: [{ dia: 'Seg', exercicios: [{ nome: 'X', grupo: 'ab1', aquecimento: 9 }, { nome: '  ' }] }],
    }));
    expect(res.plan.durationWeeks).toBeNull();
    expect(res.plan.days[0].exercicios).toEqual([expect.objectContaining({ nome: 'X', grupo: 'A', aquecimento: null })]);
  });

  it('grava via RPC para o usuário alvo e registra a auditoria', async () => {
    mockRpc.mockResolvedValue({ error: null });
    const { plan } = parsePlanFile(JSON.stringify(buildPlanExport(active)));
    await importPlanForUser('u1', plan, { activate: true, adminId: 'a1' });
    expect(mockRpc).toHaveBeenCalledWith('create_workout_plan', expect.objectContaining({
      p_user_id: 'u1', p_name: 'Plano A', p_activate: true, p_duration_weeks: 4,
    }));
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ action: 'importWorkoutPlan', target_user_id: 'u1' }));
  });

  it('propaga erro do RPC sem auditar', async () => {
    mockRpc.mockResolvedValue({ error: new Error('boom') });
    const { plan } = parsePlanFile(JSON.stringify(buildPlanExport(active)));
    await expect(importPlanForUser('u1', plan, { activate: false, adminId: 'a1' })).rejects.toThrow('boom');
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

import { readPlanFile, planFromText } from './workoutPlanFile';

describe('readPlanFile', () => {
  const file = (content, name, type = '') => new File([content], name, { type });

  it('lê ficha em texto/CSV e monta os 7 dias', async () => {
    const res = await readPlanFile(file('Dia A - Peito\nSupino reto 4x10\nCrucifixo 3x12\nDia B - Costas\nRemada curvada 4x8\nPuxada 3x12', 'ficha_joao.txt'));
    expect(res.plan.name).toBe('ficha joao');
    expect(res.plan.days).toHaveLength(7);
    expect(res.plan.days.filter(d => d.exercicios.length).length).toBe(2);
    expect(res.plan.days.find(d => d.exercicios[0]?.nome === 'Supino Reto com Barra').exercicios[0]).toMatchObject({ series: '4', reps: '10' });
  });

  it('aceita o JSON exportado', async () => {
    const json = JSON.stringify(buildPlanExport(active));
    expect((await readPlanFile(file(json, 'p.json', 'application/json'))).plan.name).toBe('Plano A');
  });

  it('avisa quando não acha exercícios e recusa formatos sem leitura', async () => {
    expect((await readPlanFile(file('nada aqui', 'a.txt'))).error).toMatch(/Não encontrei exercícios/);
    expect((await readPlanFile(file('x', 'a.xls'))).error).toMatch(/\.xlsx/);
    expect((await readPlanFile(file('x', 'a.jpg', 'image/jpeg'))).error).toMatch(/Foto/);
    expect(planFromText('', 'x').error).toBeTruthy();
  });
});

describe('vídeos de execução', () => {
  it('casa o nome digitado com o catálogo e conta quantos têm vídeo', () => {
    const res = planFromText('Dia A\nsupino reto barra 4x10\nExercicio Inventado Xyz 3x12', 'f');
    const names = res.plan.days.flatMap(d => d.exercicios.map(e => e.nome));
    expect(names).toContain('Supino Reto com Barra');
    expect(names).toContain('Exercicio Inventado Xyz');
    expect(summarizePlan(res.plan)).toMatchObject({ exercises: 2, withDemo: 1 });
  });
});
