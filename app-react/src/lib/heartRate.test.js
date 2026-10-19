import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseHeartRate, maxHeartRate, heartRateZone, emptySession, addSample, summarizeSession,
  readSession, writeSession, clearSession, friendlyHeartRateError, isHeartRateSupported,
} from './heartRate';

beforeEach(() => localStorage.clear());

function view(bytes) {
  return new DataView(new Uint8Array(bytes).buffer);
}

describe('parseHeartRate', () => {
  it('lê o valor em 8 bits e em 16 bits conforme a flag', () => {
    expect(parseHeartRate(view([0x00, 72]))).toBe(72);
    expect(parseHeartRate(view([0x01, 0x2c, 0x00]))).toBe(44);
    expect(parseHeartRate(view([0x01, 0xb4, 0x00]))).toBe(180);
  });

  it('descarta leitura fora da faixa humana', () => {
    expect(parseHeartRate(view([0x00, 0]))).toBeNull();
    expect(parseHeartRate(view([0x01, 0xff, 0x01]))).toBeNull();
  });
});

describe('zonas', () => {
  it('FC máxima por idade, com padrão de 30 anos', () => {
    expect(maxHeartRate('40')).toBe(180);
    expect(maxHeartRate('')).toBe(190);
    expect(maxHeartRate(200)).toBe(190);
  });

  it('zona pelo % da máxima', () => {
    expect(heartRateZone(100, 200)).toBe(1);
    expect(heartRateZone(120, 200)).toBe(2);
    expect(heartRateZone(150, 200)).toBe(3);
    expect(heartRateZone(170, 200)).toBe(4);
    expect(heartRateZone(185, 200)).toBe(5);
  });
});

describe('sessão', () => {
  it('soma média, máxima e tempo por zona, limitando buracos a 5 s', () => {
    let s = emptySession();
    s = addSample(s, 120, 200, 0);
    s = addSample(s, 150, 200, 1000);
    s = addSample(s, 150, 200, 2000);
    s = addSample(s, 185, 200, 60000);
    s = addSample(s, 100, 200, 61000);
    expect(s.samples).toBe(5);
    expect(s.max).toBe(185);
    expect(s.zones).toEqual([1, 0, 2, 0, 5]);
    expect(summarizeSession(s)).toEqual({ avg: 141, max: 185, zones: [1, 0, 2, 0, 5] });
  });

  it('poucas leituras não viram resumo', () => {
    expect(summarizeSession(addSample(emptySession(), 120, 190, 0))).toBeNull();
    expect(summarizeSession(null)).toBeNull();
  });

  it('guarda e apaga a sessão do dia', () => {
    expect(readSession('Segunda')).toEqual(emptySession());
    writeSession('Segunda', { ...emptySession(), samples: 3 });
    expect(readSession('Segunda').samples).toBe(3);
    clearSession('Segunda');
    expect(readSession('Segunda').samples).toBe(0);
  });
});

describe('ambiente', () => {
  it('sem Web Bluetooth não é suportado', () => {
    expect(isHeartRateSupported()).toBe(false);
  });

  it('fechar o seletor não é erro para o usuário', () => {
    expect(friendlyHeartRateError({ name: 'NotFoundError' })).toBeNull();
    expect(friendlyHeartRateError({ name: 'NotAllowedError' })).toBe('permission');
    expect(friendlyHeartRateError(new Error('x'))).toBe('generic');
  });
});
