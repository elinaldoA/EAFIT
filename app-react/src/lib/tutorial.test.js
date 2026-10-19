import { describe, it, expect, beforeEach } from 'vitest';
import { STUDENT_STEPS, TRAINER_STEPS, stepsFor, visibleSteps, hasSeenTutorial, markTutorialSeen } from './tutorial';

const STUDENT_TABS = ['treino', 'historico', 'hidratacao', 'dash', 'perfil'];
const TRAINER_TABS = ['alunos', 'modelos', 'turma', 'recados', 'conta'];
const DASH_TABS = ['treinos', 'recordes', 'corpo', 'amigos'];

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

  it('passo com aba da Evolução fica na Evolução e usa uma aba que existe', () => {
    for (const s of STUDENT_STEPS.filter(x => x.dashTab)) {
      expect(s.tab).toBe('dash');
      expect(DASH_TABS).toContain(s.dashTab);
    }
  });

  it('cobre todas as abas de cada modo', () => {
    expect(new Set(STUDENT_STEPS.map(s => s.tab).filter(Boolean))).toEqual(new Set(STUDENT_TABS));
    expect(new Set(TRAINER_STEPS.map(s => s.tab).filter(Boolean))).toEqual(new Set(TRAINER_TABS));
  });
});

describe('passos visíveis', () => {
  const titleOf = flag => STUDENT_STEPS.find(s => s.flag === flag).title;

  it('com tudo ligado mostra os passos com chave do painel', () => {
    const titles = visibleSteps('aluno', {}).map(s => s.title);
    for (const flag of ['checkin_diario', 'desafios', 'amigos']) expect(titles).toContain(titleOf(flag));
  });

  it('esconde o passo de recurso desligado no painel admin', () => {
    const steps = visibleSteps('aluno', { amigos: false, desafios: false });
    expect(steps.map(s => s.title)).not.toContain(titleOf('amigos'));
    expect(steps.map(s => s.title)).not.toContain(titleOf('desafios'));
    expect(steps.map(s => s.title)).toContain(titleOf('checkin_diario'));
  });

  it('esconde o passo que o aparelho não suporta', () => {
    const coach = STUDENT_STEPS.find(s => s.when);
    expect(visibleSteps('aluno', {}).includes(coach)).toBe(coach.when());
  });

  it('o personal não tem passos condicionais', () => {
    expect(visibleSteps('trainer', { amigos: false })).toEqual(TRAINER_STEPS);
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
