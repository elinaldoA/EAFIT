import { describe, expect, it } from 'vitest';
import { ANIMATIONS, EXERCISE_SVG, MUSCLE_KEYS } from './exerciseSvg';
import { EXERCISE_VIDEOS } from './exerciseVideos';
import { getExerciseMedia } from './exerciseMedia';
import { buildTimeline, cycleLength, layout, LEN, sample, solveIK } from '../lib/exerciseFigure';

describe('solveIK', () => {
  it('alcança o alvo quando está ao alcance e respeita o tamanho dos ossos', () => {
    const [a1, a2] = solveIK([0, 0], [30, 20], LEN.thigh, LEN.shin, 'up');
    const knee = [Math.cos((a1 * Math.PI) / 180) * LEN.thigh, Math.sin((a1 * Math.PI) / 180) * LEN.thigh];
    const foot = [knee[0] + Math.cos((a2 * Math.PI) / 180) * LEN.shin, knee[1] + Math.sin((a2 * Math.PI) / 180) * LEN.shin];
    expect(foot[0]).toBeCloseTo(30, 1);
    expect(foot[1]).toBeCloseTo(20, 1);
  });

  it('estica o membro quando o alvo está longe demais', () => {
    const [a1, a2] = solveIK([0, 0], [500, 0], LEN.thigh, LEN.shin);
    expect(Math.abs(a1 - a2)).toBeLessThan(3);
  });
});

describe('animações em SVG', () => {
  it('todo nome aponta pra uma animação que existe, com músculos conhecidos', () => {
    for (const [nome, key] of Object.entries(EXERCISE_SVG)) {
      expect(ANIMATIONS[key], nome).toBeTruthy();
    }
    for (const [key, a] of Object.entries(ANIMATIONS)) {
      expect(a.poses.length, key).toBeGreaterThanOrEqual(2);
      expect([1, -1], key).toContain(a.facing);
      for (const m of a.muscles) expect(MUSCLE_KEYS, `${key}: ${m}`).toContain(m);
    }
  });

  it('toda animação é usada por algum exercício', () => {
    const used = new Set(Object.values(EXERCISE_SVG));
    expect(Object.keys(ANIMATIONS).filter(k => !used.has(k))).toEqual([]);
  });

  it('não repete exercício que já tem vídeo real (o vídeo ganha)', () => {
    expect(Object.keys(EXERCISE_SVG).filter(n => EXERCISE_VIDEOS[n])).toEqual([]);
  });

  it('o catálogo entrega o boneco como mídia', () => {
    expect(getExerciseMedia('Prancha Frontal Estática', '/')).toMatchObject({ type: 'svg', svg: 'plank' });
  });

  it('em nenhum instante do ciclo uma articulação atravessa o tapete', () => {
    for (const [key, a] of Object.entries(ANIMATIONS)) {
      const tl = buildTimeline(a.poses);
      const total = cycleLength(tl);
      for (let t = 0; t < total; t += 25) {
        const l = layout(sample(tl, t));
        const pts = [l.hip, l.waist, l.shoulder, l.head, ...l.leg, ...l.leg2, ...l.arm, ...l.arm2];
        const lowest = Math.min(...pts.map(p => p[1]));
        expect(lowest, `${key} @${t}ms`).toBeGreaterThanOrEqual(-2);
      }
    }
  });

  it('o ciclo fecha: o fim do loop volta à primeira pose', () => {
    for (const [key, a] of Object.entries(ANIMATIONS)) {
      const tl = buildTimeline(a.poses);
      const total = cycleLength(tl);
      const start = layout(sample(tl, 0));
      const end = layout(sample(tl, total - 0.001));
      expect(Math.hypot(start.head[0] - end.head[0], start.head[1] - end.head[1]), key).toBeLessThan(1);
    }
  });
});
