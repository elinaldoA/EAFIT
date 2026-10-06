import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import {
  normalizeCode, validateChallenge, challengeStatus, daysLeft, addDaysStr, friendlyChallengeError, inviteText, classChallengeMessage,
} from './challenges';

describe('normalizeCode', () => {
  it('maiúsculas e sem espaços ou símbolos', () => {
    expect(normalizeCode(' ab-12 cd ')).toBe('AB12CD');
    expect(normalizeCode(null)).toBe('');
  });
});

describe('validateChallenge', () => {
  it('exige nome de 3 a 50 letras e duração válida', () => {
    expect(validateChallenge('ab', 7).ok).toBe(false);
    expect(validateChallenge('x'.repeat(51), 7).ok).toBe(false);
    expect(validateChallenge('Turma', 0).ok).toBe(false);
    expect(validateChallenge('Turma', 90).ok).toBe(false);
    expect(validateChallenge('  Turma da firma ', 14)).toEqual({ ok: true, title: 'Turma da firma' });
  });
});

describe('status e prazo', () => {
  const c = { start_date: '2026-10-10', end_date: '2026-10-20' };
  it('classifica pelo dia', () => {
    expect(challengeStatus(c, '2026-10-09')).toBe('futuro');
    expect(challengeStatus(c, '2026-10-10')).toBe('ativo');
    expect(challengeStatus(c, '2026-10-20')).toBe('ativo');
    expect(challengeStatus(c, '2026-10-21')).toBe('encerrado');
  });
  it('conta dias restantes', () => {
    expect(daysLeft(c, '2026-10-18')).toBe(2);
    expect(daysLeft(c, '2026-10-20')).toBe(0);
  });
  it('soma dias atravessando o mês', () => {
    expect(addDaysStr('2026-10-25', 7)).toBe('2026-11-01');
  });
});

describe('textos', () => {
  it('traduz erros conhecidos e cai num genérico', () => {
    expect(friendlyChallengeError({ message: 'invalid_code' })).toMatch(/Código não encontrado/);
    expect(friendlyChallengeError({ message: 'challenge_full' })).toMatch(/20 participantes/);
    expect(friendlyChallengeError({ message: 'boom' })).toMatch(/Tente de novo/);
  });
  it('convite traz título e código', () => {
    const t = inviteText({ title: 'Turma', invite_code: 'A1B2C3' });
    expect(t).toContain('"Turma"');
    expect(t).toContain('A1B2C3');
  });
});

describe('desafio da turma', () => {
  it('o recado cita o nome e a data final', () => {
    const t = classChallengeMessage('Turma de outubro', '2026-10-31');
    expect(t).toContain('"Turma de outubro"');
    expect(t).toContain('até 31/10');
  });
});
