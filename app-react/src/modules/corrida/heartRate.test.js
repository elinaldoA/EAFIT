import { describe, it, expect } from 'vitest';
import { parseHeartRate, addHeart, heartOf, cleanHr, hrText, maxHeartRate, zoneOf } from './heartRate';
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

describe('zonas de esforço', () => {
  it('a frequência máxima vem do Perfil ou de 220 menos a idade', () => {
    expect(maxHeartRate({ hrMax: 188, idade: 30 })).toBe(188);
    expect(maxHeartRate({ idade: '30' })).toBe(190);
    expect(maxHeartRate({ hrMax: 500, idade: 40 })).toBe(180);
    expect(maxHeartRate({ hrMax: '', idade: '' })).toBeNull();
    expect(maxHeartRate(null)).toBeNull();
  });

  it('classifica a leitura em Z1 a Z5 pela porcentagem da máxima', () => {
    const z = bpm => zoneOf(bpm, 200);
    expect([100, 119, 120, 139, 140, 159, 160, 179, 180, 200].map(z)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(zoneOf(150, null)).toBe(0);
  });

  it('soma segundos por zona e guarda na corrida', () => {
    let s = startRun();
    s = addHeart(s, 150 * 10, 10, 160, [0, 4, 6, 0, 0]);
    s = addHeart(s, 170 * 10, 10, 180, [0, 0, 2.4, 7.6, 0]);
    expect(heartOf(s)).toEqual({ avg: 160, max: 180, z: [0, 4, 8, 8, 0] });
    expect(finishRun(s).hr.z).toEqual([0, 4, 8, 8, 0]);
  });

  it('sem zonas (sem frequência máxima) guarda só média e máxima', () => {
    let s = startRun();
    s = addHeart(s, 150 * 12, 12, 160, null);
    expect(heartOf(s)).toEqual({ avg: 150, max: 160 });
  });

  it('zona inválida vinda do banco é ignorada', () => {
    expect(cleanHr({ avg: 150, max: 170, z: [1, 2, 3] })).toEqual({ avg: 150, max: 170 });
    expect(cleanHr({ avg: 150, max: 170, z: [0, 0, 0, 0, 0] })).toEqual({ avg: 150, max: 170 });
    expect(cleanHr({ avg: 150, max: 170, z: [1, -2, 3, 4, 5] })).toEqual({ avg: 150, max: 170 });
    expect(cleanHr({ avg: 150, max: 170, z: [10, 20, 30, 40, 50] }).z).toEqual([10, 20, 30, 40, 50]);
  });
});

describe('hrAlert', () => {
  const max = 190;
  it('só avisa depois de segurar a zona alta por 20 s', async () => {
    const { hrAlert } = await import('./heartRate');
    let r = hrAlert(null, 170, max, 100);
    expect(r.message).toBeNull();
    r = hrAlert(r.state, 171, max, 110);
    expect(r.message).toBeNull();
    r = hrAlert(r.state, 172, max, 121);
    expect(r.message).toMatch(/172/);
  });
  it('repete só depois de 90 s e zera ao voltar para zona baixa', async () => {
    const { hrAlert } = await import('./heartRate');
    let r = hrAlert({ since: 0, lastAt: 100 }, 170, max, 150);
    expect(r.message).toBeNull();
    r = hrAlert(r.state, 170, max, 191);
    expect(r.message).not.toBeNull();
    r = hrAlert(r.state, 120, max, 200);
    expect(r.state.since).toBeNull();
  });
  it('não avisa em treino forte nem sem frequência máxima', async () => {
    const { hrAlert } = await import('./heartRate');
    expect(hrAlert({ since: 0, lastAt: null }, 180, max, 60, { type: 'intervalado' }).message).toBeNull();
    expect(hrAlert({ since: 0, lastAt: null }, 180, null, 60).message).toBeNull();
  });
});
