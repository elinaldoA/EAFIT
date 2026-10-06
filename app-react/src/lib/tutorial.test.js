import { describe, it, expect, beforeEach } from 'vitest';
import { STUDENT_STEPS, TRAINER_STEPS, stepsFor, hasSeenTutorial, markTutorialSeen } from './tutorial';

const STUDENT_TABS = ['treino', 'historico', 'hidratacao', 'dash', 'perfil'];
const TRAINER_TABS = ['alunos', 'modelos', 'turma', 'recados', 'conta'];

describe('passos do tutorial', () => {
  it('escolhe os passos pelo papel', () => {
    expect(stepsFor('trainer')).toBe(TRAINER_STEPS);
    expect(stepsFor('aluno')).toBe(STUDENT_STEPS);
  });

  it('todo passo tem título, texto e uma aba existente', () => {
    for (const s of STUDENT_STEPS) {
      expect(s.title && s.text).toBeTruthy();
      if (s.tab) expect(STUDENT_TABS).toContain(s.tab);
    }
    for (const s of TRAINER_STEPS) {
      expect(s.title && s.text).toBeTruthy();
      if (s.tab) expect(TRAINER_TABS).toContain(s.tab);
    }
  });

  it('cobre todas as abas de cada modo', () => {
    expect(new Set(STUDENT_STEPS.map(s => s.tab).filter(Boolean))).toEqual(new Set(STUDENT_TABS));
    expect(new Set(TRAINER_STEPS.map(s => s.tab).filter(Boolean))).toEqual(new Set(TRAINER_TABS));
  });
});

describe('já visto', () => {
  beforeEach(() => localStorage.clear());

  it('guarda por usuário e por modo', () => {
    expect(hasSeenTutorial('aluno', 'u1')).toBe(false);
    markTutorialSeen('aluno', 'u1');
    expect(hasSeenTutorial('aluno', 'u1')).toBe(true);
    expect(hasSeenTutorial('trainer', 'u1')).toBe(false);
    expect(hasSeenTutorial('aluno', 'u2')).toBe(false);
  });
});
