import { describe, it, expect } from 'vitest';
import { parseHeartRate, addHeart, heartOf, cleanHr, hrText } from './heartRate';
import { startRun, finishRun } from './liveRun';

const view = bytes => new DataView(new Uint8Array(bytes).buffer);

describe('frequência cardíaca', () => {
  it('lê valor de 8 e de 16 bits (flags da característica 0x2A37)', () => {
    expect(parseHeartRate(view([0x00, 142]))).toBe(142);
    expect(parseHeartRate(view([0x01, 0x90, 0x00]))).toBe(144);
  });

  it('descarta leitura fora do normal ou incompleta', () => {
    expect(parseHeartRate(view([0x00, 0]))).toBeNull();
    expect(parseHeartRate(view([0x00, 10]))).toBeNull();
    expect(parseHeartRate(view([0x01, 0xff, 0xff]))).toBeNull();
    expect(parseHeartRate(view([0x01, 0x90]))).toBeNull();
    expect(parseHeartRate(null)).toBeNull();
  });

  it('soma as leituras e só guarda com amostras suficientes', () => {
    let s = startRun();
    s = addHeart(s, 150 * 5, 5, 160);
    expect(heartOf(s)).toBeNull();
    s = addHeart(s, 170 * 5, 5, 175);
    expect(heartOf(s)).toEqual({ avg: 160, max: 175 });
    expect(addHeart(s, 0, 0, 0)).toBe(s);
  });

  it('valida o formato vindo do banco e monta o texto', () => {
    expect(cleanHr({ avg: 150.4, max: 171 })).toEqual({ avg: 150, max: 171 });
    expect(cleanHr({ avg: 180, max: 170 })).toBeNull();
    expect(cleanHr({ avg: 'x', max: 170 })).toBeNull();
    expect(cleanHr(null)).toBeNull();
    expect(hrText({ avg: 150, max: 171 })).toBe('❤️ 150 bpm em média · máx 171');
    expect(hrText(null)).toBe('');
  });

  it('a corrida finalizada leva a frequência cardíaca', () => {
    let s = startRun();
    s = addHeart(s, 155 * 20, 20, 168);
    expect(finishRun(s).hr).toEqual({ avg: 155, max: 168 });
    expect(finishRun(startRun()).hr).toBeNull();
  });
});
