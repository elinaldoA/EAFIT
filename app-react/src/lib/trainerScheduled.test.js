import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: (...a) => h.rpc(...a) } }));

import {
  toLocalInput, minScheduleValue, maxScheduleValue, scheduleToIso, scheduledTarget, friendlyScheduleError,
  scheduleMessage, fetchScheduled, cancelScheduled, MIN_LEAD_MINUTES,
} from './trainerScheduled';

beforeEach(() => h.rpc.mockReset());

// 15/10/2026 12:00 local
const NOW = new Date(2026, 9, 15, 12, 0, 0);

describe('janela de horário', () => {
  it('toLocalInput usa a hora local, com zeros à esquerda', () => {
    expect(toLocalInput(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05T07:03');
  });

  it('mínimo é daqui a 5 minutos e máximo daqui a 60 dias', () => {
    expect(minScheduleValue(NOW)).toBe('2026-10-15T12:05');
    expect(maxScheduleValue(NOW)).toBe('2026-12-14T12:00');
  });

  it('scheduleToIso aceita dentro da janela e devolve o instante em UTC', () => {
    const iso = scheduleToIso('2026-10-16T08:30', NOW);
    expect(iso).toBe(new Date(2026, 9, 16, 8, 30).toISOString());
  });

  it('scheduleToIso recusa vazio, inválido, cedo demais e longe demais', () => {
    expect(scheduleToIso('', NOW)).toBeNull();
    expect(scheduleToIso('lixo', NOW)).toBeNull();
    expect(scheduleToIso('2026-10-15T12:03', NOW)).toBeNull(); // menos de 5 min
    expect(scheduleToIso('2026-10-15T12:05', NOW)).not.toBeNull(); // exatamente 5 min
    expect(scheduleToIso('2027-01-01T08:00', NOW)).toBeNull(); // mais de 60 dias
    expect(MIN_LEAD_MINUTES).toBe(5);
  });
});

describe('scheduledTarget', () => {
  it('todos, um nome, dois nomes e "e mais N"', () => {
    expect(scheduledTarget({ all: true })).toBe('Todos os alunos');
    expect(scheduledTarget({ all: false, count: 1, names: 'Ana' })).toBe('Ana');
    expect(scheduledTarget({ all: false, count: 2, names: 'Ana, Bruno' })).toBe('Ana, Bruno');
    expect(scheduledTarget({ all: false, count: 5, names: 'Ana, Bruno' })).toBe('Ana, Bruno e mais 3');
  });
});

describe('RPCs', () => {
  it('agenda para a lista escolhida, ou null para todos', async () => {
    h.rpc.mockResolvedValue({ data: 's1', error: null });
    expect(await scheduleMessage(['a', 'b'], 'Oi', '2026-10-16T11:00:00.000Z')).toBe('s1');
    expect(h.rpc).toHaveBeenLastCalledWith('trainer_schedule_message', { p_clients: ['a', 'b'], p_body: 'Oi', p_send_at: '2026-10-16T11:00:00.000Z' });
    await scheduleMessage([], 'Oi', '2026-10-16T11:00:00.000Z');
    expect(h.rpc).toHaveBeenLastCalledWith('trainer_schedule_message', expect.objectContaining({ p_clients: null }));
  });

  it('lista os pendentes e cancela', async () => {
    h.rpc.mockResolvedValueOnce({ data: [{ sm_id: 's1', sm_body: 'Oi', sm_at: '2026-10-16T11:00:00Z', sm_all: false, sm_count: 2, sm_names: 'Ana, Bruno' }], error: null });
    expect(await fetchScheduled()).toEqual([{ id: 's1', body: 'Oi', at: '2026-10-16T11:00:00Z', all: false, count: 2, names: 'Ana, Bruno' }]);
    h.rpc.mockResolvedValueOnce({ error: null });
    await cancelScheduled('s1');
    expect(h.rpc).toHaveBeenLastCalledWith('trainer_cancel_scheduled', { p_id: 's1' });
  });

  it('propaga o erro do banco', async () => {
    h.rpc.mockResolvedValue({ data: null, error: new Error('invalid_when') });
    await expect(scheduleMessage(null, 'Oi', 'x')).rejects.toThrow('invalid_when');
  });
});

describe('friendlyScheduleError', () => {
  it('traduz os códigos do banco', () => {
    expect(friendlyScheduleError(new Error('invalid_when'))).toContain('Escolha um horário');
    expect(friendlyScheduleError(new Error('too_many'))).toContain('20 recados agendados');
    expect(friendlyScheduleError(new Error('no_recipients'))).toContain('Nenhum aluno ativo');
    expect(friendlyScheduleError(new Error('not_found'))).toContain('já foi enviado ou cancelado');
    expect(friendlyScheduleError(new Error('boom'))).toContain('Não foi possível');
  });
});
