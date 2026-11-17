import { describe, it, expect } from 'vitest';
import { batteryState, batteryMessage, batterySpoken, batteryReadable, nudgeBlock, nudgeMessage, nudgeSpoken, NUDGE_EVERY_S } from './battery';

describe('bateria na corrida', () => {
  it('avisa em 20% ou menos e fica crítico em 10% ou menos', () => {
    expect([100, 50, 21, 20, 11, 10, 3].map(l => batteryState(l, false))).toEqual(['ok', 'ok', 'ok', 'low', 'low', 'critical', 'critical']);
  });

  it('carregando ou sem leitura nunca avisa', () => {
    expect(batteryState(5, true)).toBe('ok');
    expect(batteryState(null, false)).toBe('ok');
    expect(batteryState(undefined, false)).toBe('ok');
  });

  it('textos de cada nível', () => {
    expect(batteryMessage('ok', 80)).toBe('');
    expect(batteryMessage('low', 18)).toContain('18%');
    expect(batteryMessage('critical', 8)).toMatch(/finalize logo/);
    expect(batterySpoken('low', 18)).toBe('Bateria em 18 por cento.');
    expect(batterySpoken('critical', 8)).toMatch(/Finalize logo/);
  });

  it('sabe se o navegador deixa ler a bateria', () => {
    expect(batteryReadable()).toBe(false); // sem getBattery (como no iPhone)
    navigator.getBattery = () => Promise.resolve({});
    expect(batteryReadable()).toBe(true);
    delete navigator.getBattery;
  });

  it('o lembrete de corrida longa vence a cada 45 minutos', () => {
    expect(NUDGE_EVERY_S).toBe(2700);
    expect([0, 2699, 2700, 5399, 5400, 8100].map(nudgeBlock)).toEqual([0, 0, 1, 1, 2, 3]);
    expect(nudgeBlock(-5)).toBe(0);
    expect(nudgeMessage()).toBe('⏱️ Corrida longa: se a bateria estiver baixa, use a tela escura.');
    expect(nudgeSpoken()).toMatch(/tela escura/);
  });
});
