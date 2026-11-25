import { describe, it, expect, vi, beforeEach } from 'vitest';

const hl = vi.hoisted(() => ({
  isAvailable: vi.fn(), checkAuthorization: vi.fn(), requestAuthorization: vi.fn(),
  queryAggregated: vi.fn(), readSamples: vi.fn(), openHealthConnectSettings: vi.fn(),
}));
const native = vi.hoisted(() => ({ on: true }));
vi.mock('@capgo/capacitor-health', () => ({ Health: hl }));
vi.mock('./native', () => ({ isNative: () => native.on }));

import { getHealthState, connectHealth, readHealthSummary, HEALTH_READ } from './nativeHealth';

beforeEach(() => {
  native.on = true;
  Object.values(hl).forEach(f => f.mockReset());
  hl.isAvailable.mockResolvedValue({ available: true });
  hl.checkAuthorization.mockResolvedValue({ readAuthorized: ['steps'] });
  hl.requestAuthorization.mockResolvedValue({ readAuthorized: ['steps', 'heartRate'] });
});

describe('estado e conexão', () => {
  it('só pede leitura, nunca escrita', async () => {
    await connectHealth();
    const arg = hl.requestAuthorization.mock.calls[0][0];
    expect(arg.read).toEqual(HEALTH_READ);
    expect(arg.write).toBeUndefined();
  });

  it('fora do app ou sem Health Connect: unavailable', async () => {
    native.on = false;
    expect(await getHealthState()).toBe('unavailable');
    native.on = true;
    hl.isAvailable.mockResolvedValue({ available: false });
    expect(await getHealthState()).toBe('unavailable');
  });

  it('com permissão: on; sem nenhuma: off', async () => {
    expect(await getHealthState()).toBe('on');
    hl.checkAuthorization.mockResolvedValue({ readAuthorized: [] });
    expect(await getHealthState()).toBe('off');
  });

  it('erro do plugin ao conectar vira off', async () => {
    hl.requestAuthorization.mockRejectedValue(new Error('x'));
    expect(await connectHealth()).toBe('off');
  });
});

describe('readHealthSummary', () => {
  const now = new Date('2026-11-25T15:00:00');
  const iso = h => new Date(`2026-11-25T${h}`).toISOString();

  it('monta passos, frequência e peso', async () => {
    hl.queryAggregated.mockImplementation(async ({ dataType }) => dataType === 'steps'
      ? { samples: [{ startDate: iso('00:00:00').replace('25', '24'), value: 3000 }, { startDate: new Date('2026-11-25T00:00:00').toISOString(), value: 4210.4 }] }
      : { samples: [{ startDate: new Date('2026-11-25T00:00:00').toISOString(), value: 0, values: { average: 71.6, min: 52, max: 150 } }] });
    hl.readSamples.mockResolvedValue({ samples: [{ value: 78.46, endDate: '2026-11-20T08:00:00Z' }] });
    const r = await readHealthSummary(now);
    expect(r.todaySteps).toBe(4210);
    expect(r.days).toHaveLength(2);
    expect(r.heartRate).toEqual({ avg: 72, min: 52, max: 150 });
    expect(r.weight).toEqual({ kg: 78.5, date: '2026-11-20T08:00:00Z' });
  });

  it('tipo sem permissão vem null sem derrubar os outros', async () => {
    hl.queryAggregated.mockImplementation(async ({ dataType }) => {
      if (dataType === 'steps') return { samples: [] };
      throw new Error('sem permissão');
    });
    hl.readSamples.mockRejectedValue(new Error('sem permissão'));
    const r = await readHealthSummary(now);
    expect(r.todaySteps).toBe(0);
    expect(r.heartRate).toBeNull();
    expect(r.weight).toBeNull();
  });
});
