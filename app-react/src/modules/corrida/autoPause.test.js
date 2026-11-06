import { describe, it, expect } from 'vitest';
import { emptyMotion, motionStep, STILL_MS } from './autoPause';

const T0 = 1_000_000;

function feed(samples, paused = false, since = 0) {
  let motion = emptyMotion();
  const actions = [];
  for (const s of samples) {
    const step = motionStep(motion, s, paused, since);
    motion = step.motion;
    if (step.action) actions.push(step.action);
  }
  return { motion, actions };
}

describe('pausa automática', () => {
  it('pausa depois de ficar parado com sinal bom, no momento do último movimento', () => {
    const { actions } = feed([
      { t: T0, reason: 'first' },
      { t: T0 + 3000, reason: 'moved', meters: 8 },
      { t: T0 + 6000, reason: 'drift' },
      { t: T0 + 10000, reason: 'drift' },
      { t: T0 + 3000 + STILL_MS, reason: 'drift' },
    ]);
    expect(actions).toEqual([{ type: 'pause', at: T0 + 3000 }]);
  });

  it('sinal perdido ou impreciso não vira pausa', () => {
    const { actions } = feed([
      { t: T0, reason: 'first' },
      { t: T0 + 20000, reason: 'accuracy' },
      { t: T0 + 40000, reason: 'speed' },
    ]);
    expect(actions).toEqual([]);
  });

  it('uma leitura parada só não basta', () => {
    const { actions } = feed([{ t: T0, reason: 'first' }, { t: T0 + 30000, reason: 'drift' }]);
    expect(actions).toEqual([]);
  });

  it('não volta para antes do começo do trecho atual', () => {
    const { actions } = feed([
      { t: T0, reason: 'first' },
      { t: T0 + 12000, reason: 'drift' },
      { t: T0 + 25000, reason: 'drift' },
    ], false, T0 + 5000);
    expect(actions).toEqual([{ type: 'pause', at: T0 + 5000 }]);
  });

  it('volta com dois passos somando 15 m, não com um salto isolado', () => {
    expect(feed([{ t: T0, reason: 'moved', meters: 30 }], true).actions).toEqual([]);
    const { actions } = feed([
      { t: T0, reason: 'moved', meters: 7 },
      { t: T0 + 5000, reason: 'moved', meters: 9 },
    ], true);
    expect(actions).toEqual([{ type: 'resume' }]);
  });

  it('passos muito separados no tempo não somam', () => {
    const { actions } = feed([
      { t: T0, reason: 'moved', meters: 8 },
      { t: T0 + 40000, reason: 'moved', meters: 8 },
    ], true);
    expect(actions).toEqual([]);
  });
});
