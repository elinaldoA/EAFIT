// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MIN_WORKOUTS, REASK_AFTER_DAYS, COMMENT_MAX, shouldAskAppRating, readAppRatingState,
  noteWorkoutFinished, markAppRatingDismissed, markAppRatingAnswered, buildRatingFeedback,
} from './appRating';

const now = new Date('2026-10-10T12:00:00Z').getTime();
const daysAgo = (d) => now - d * 86400000;

beforeEach(() => localStorage.clear());

describe('shouldAskAppRating', () => {
  it('só pergunta depois de alguns treinos', () => {
    expect(shouldAskAppRating({ workouts: MIN_WORKOUTS - 1, now })).toBe(false);
    expect(shouldAskAppRating({ workouts: MIN_WORKOUTS, now })).toBe(true);
    expect(shouldAskAppRating({ now })).toBe(false);
  });

  it('não pergunta de novo a quem já avaliou', () => {
    expect(shouldAskAppRating({ workouts: 50, answeredAt: daysAgo(400), now })).toBe(false);
  });

  it('respeita o "Agora não" recente e volta a perguntar depois do prazo', () => {
    expect(shouldAskAppRating({ workouts: 10, dismissedAt: daysAgo(3), now })).toBe(false);
    expect(shouldAskAppRating({ workouts: 10, dismissedAt: daysAgo(REASK_AFTER_DAYS + 1), now })).toBe(true);
  });
});

describe('estado no aparelho', () => {
  it('conta os treinos e avisa quando chega a hora', () => {
    for (let i = 1; i < MIN_WORKOUTS; i += 1) expect(noteWorkoutFinished(now)).toBe(false);
    expect(noteWorkoutFinished(now)).toBe(true);
    expect(readAppRatingState().workouts).toBe(MIN_WORKOUTS);
  });

  it('dispensar adia e avaliar encerra, sem perder a contagem', () => {
    localStorage.setItem('eafit_app_rating', JSON.stringify({ workouts: 5 }));
    markAppRatingDismissed(now);
    expect(noteWorkoutFinished(now)).toBe(false);
    expect(noteWorkoutFinished(now + (REASK_AFTER_DAYS + 1) * 86400000)).toBe(true);
    markAppRatingAnswered(now);
    expect(noteWorkoutFinished(now + 365 * 86400000)).toBe(false);
    expect(readAppRatingState().workouts).toBe(8);
  });

  it('valor inválido no armazenamento vira estado vazio', () => {
    localStorage.setItem('eafit_app_rating', '{torto');
    expect(readAppRatingState()).toEqual({});
  });
});

describe('buildRatingFeedback', () => {
  it('4 e 5 estrelas viram elogio; abaixo disso, sugestão', () => {
    expect(buildRatingFeedback(5, '').kind).toBe('elogio');
    expect(buildRatingFeedback(4, '').kind).toBe('elogio');
    expect(buildRatingFeedback(3, '').kind).toBe('sugestao');
  });

  it('monta a mensagem com a nota e o comentário aparado', () => {
    expect(buildRatingFeedback(5, '').message).toBe('Avaliação do app: ⭐ 5/5');
    expect(buildRatingFeedback(2, '  falta timer  ').message).toBe('Avaliação do app: ⭐ 2/5\nfalta timer');
    expect(buildRatingFeedback(1, 'x'.repeat(COMMENT_MAX + 50)).message.length).toBeLessThanOrEqual(1000);
  });
});
