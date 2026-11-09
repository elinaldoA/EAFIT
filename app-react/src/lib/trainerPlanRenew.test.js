import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: (...a) => h.rpc(...a) } }));
vi.mock('./trainerMessages', () => ({ sendMessage: (...a) => h.send(...a) }));

import { renewPlan, friendlyPlanError } from './trainerPlan';

const PLAN = {
  name: 'Hipertrofia A/B', duration_weeks: 8, created_by_trainer: true,
  days: [
    { dia: 'Segunda', foco: 'Peito', exercicios: [{ nome: 'Supino', series: '4', reps: '8-10', descanso: '90s', tecnica: '' }] },
    { dia: 'Quarta', foco: 'Costas', exercicios: [{ nome: 'Remada', series: '4', reps: '10', descanso: '60s', tecnica: '' }] },
  ],
};

beforeEach(() => { h.rpc.mockReset(); h.send.mockReset(); h.send.mockResolvedValue(1); });

describe('renewPlan', () => {
  it('reenvia o mesmo plano, com o mesmo prazo, e avisa o aluno', async () => {
    h.rpc.mockImplementation(async name => (name === 'trainer_client_plan' ? { data: PLAN, error: null } : { data: 'novo-id', error: null }));
    const payload = await renewPlan('c1');
    const assign = h.rpc.mock.calls.find(([name]) => name === 'trainer_assign_plan');
    expect(assign[1]).toEqual(expect.objectContaining({ p_client: 'c1', p_name: 'Hipertrofia A/B', p_duration_weeks: 8 }));
    expect(assign[1].p_days.map(d => d.dia)).toEqual(['Segunda', 'Quarta']);
    expect(assign[1].p_days[0].exercicios[0].nome).toBe('Supino');
    expect(payload.weeks).toBe(8);
    expect(h.send).toHaveBeenCalledWith(['c1'], expect.stringContaining('8 semanas'), 'treino');
  });

  it('falha no aviso não derruba a renovação', async () => {
    h.rpc.mockImplementation(async name => (name === 'trainer_client_plan' ? { data: PLAN, error: null } : { data: 'x', error: null }));
    h.send.mockRejectedValue(new Error('push'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(renewPlan('c1')).resolves.toBeTruthy();
  });

  it('sem plano ou sem duração não envia nada', async () => {
    h.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(renewPlan('c1')).rejects.toThrow('no_plan');
    h.rpc.mockResolvedValueOnce({ data: { ...PLAN, duration_weeks: null }, error: null });
    await expect(renewPlan('c1')).rejects.toThrow('no_duration');
    expect(h.rpc.mock.calls.every(([name]) => name === 'trainer_client_plan')).toBe(true);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('mensagens amigáveis para os erros novos', () => {
    expect(friendlyPlanError(new Error('no_duration'))).toContain('duração');
    expect(friendlyPlanError(new Error('no_plan'))).toContain('plano ativo');
  });
});
