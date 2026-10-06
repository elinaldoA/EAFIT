import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { localInputToIso, upcomingAppointments, friendlyAppointmentError } from './trainerAppointments';

describe('localInputToIso', () => {
  it('converte data e hora locais em ISO', () => {
    const iso = localInputToIso('2026-10-20T18:30');
    expect(new Date(iso).getHours()).toBe(18);
    expect(new Date(iso).getMinutes()).toBe(30);
  });
  it('vazio ou inválido vira null', () => {
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso('abc')).toBeNull();
  });
});

describe('upcomingAppointments', () => {
  const now = new Date('2026-10-20T12:00:00Z').getTime();
  const a = (id, starts, status, duration = 60) => ({ id, starts, status, duration });

  it('mantém só aulas pendentes ou confirmadas que ainda não acabaram', () => {
    const rows = [
      a(1, '2026-10-20T11:30:00Z', 'confirmed'), // começou há 30 min, dura 60: ainda vale
      a(2, '2026-10-20T10:00:00Z', 'confirmed'), // já acabou
      a(3, '2026-10-21T10:00:00Z', 'pending'),
      a(4, '2026-10-21T10:00:00Z', 'declined'),
      a(5, '2026-10-22T10:00:00Z', 'cancelled'),
    ];
    expect(upcomingAppointments(rows, now).map(r => r.id)).toEqual([1, 3]);
  });
});

describe('friendlyAppointmentError', () => {
  it('traduz o erro do banco', () => {
    expect(friendlyAppointmentError({ message: 'invalid_time' })).toMatch(/futuro/);
    expect(friendlyAppointmentError({ message: 'xyz' })).toMatch(/Tente de novo/);
  });
});
