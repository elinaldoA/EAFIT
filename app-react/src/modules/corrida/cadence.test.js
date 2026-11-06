import { describe, it, expect } from 'vitest';
import { emptySteps, addMotion, currentCadence, averageCadence } from './cadence';

// Leituras a 50 Hz de uma corrida a `spm` passos/min: um pico por passo.
function simulate(spm, seconds, { peak = 8, noise = 0.3 } = {}) {
  let st = emptySteps();
  const stepMs = 60000 / spm;
  for (let t = 0; t <= seconds * 1000; t += 20) {
    const phase = (t % stepMs) / stepMs;
    const a = 9.8 + (phase < 0.15 ? peak * Math.sin((phase / 0.15) * Math.PI) : -1) + (((t / 20) % 3) - 1) * noise;
    st = addMotion(st, t, a);
  }
  return st;
}

describe('cadência', () => {
  it('conta os passos de uma corrida a 170 passos/min', () => {
    const st = simulate(170, 90);
    expect(averageCadence(st.steps, st.ms)).toBeGreaterThanOrEqual(165);
    expect(averageCadence(st.steps, st.ms)).toBeLessThanOrEqual(175);
    expect(currentCadence(st, 90000)).toBeGreaterThanOrEqual(160);
    expect(currentCadence(st, 90000)).toBeLessThanOrEqual(180);
  });

  it('celular parado (só ruído) não conta passo', () => {
    let st = emptySteps();
    for (let t = 0; t <= 60000; t += 20) st = addMotion(st, t, 9.8 + (((t / 20) % 3) - 1) * 0.3);
    expect(st.steps).toBe(0);
    expect(averageCadence(st.steps, st.ms)).toBeNull();
  });

  it('pouco tempo medido ou tela apagada (buraco nas leituras) não dá média', () => {
    expect(averageCadence(100, 30000)).toBeNull();
    let st = addMotion(emptySteps(), 0, 9.8);
    st = addMotion(st, 5000, 9.8);
    expect(st.ms).toBe(0);
  });
});
