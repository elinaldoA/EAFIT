import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { validateFeedback, friendlyFeedbackError, MAX_LENGTH } from './feedback';

describe('validateFeedback', () => {
  it('aceita tipo válido com texto suficiente e apara espaços', () => {
    expect(validateFeedback('sugestao', '  Quero mais exercícios de core  ')).toEqual({
      ok: true, message: 'Quero mais exercícios de core', error: '',
    });
  });

  it('recusa tipo inválido', () => {
    expect(validateFeedback('xyz', 'texto longo o bastante').ok).toBe(false);
    expect(validateFeedback('', 'texto longo o bastante').error).toBe('Escolha o tipo.');
  });

  it('recusa texto curto demais ou vazio', () => {
    expect(validateFeedback('problema', 'oi').ok).toBe(false);
    expect(validateFeedback('problema', '     ').ok).toBe(false);
    expect(validateFeedback('problema', null).ok).toBe(false);
  });

  it('recusa texto acima do limite', () => {
    expect(validateFeedback('elogio', 'a'.repeat(MAX_LENGTH + 1)).ok).toBe(false);
    expect(validateFeedback('elogio', 'a'.repeat(MAX_LENGTH)).ok).toBe(true);
  });
});

describe('friendlyFeedbackError', () => {
  it('trata o limite diário (RLS) e erros genéricos', () => {
    expect(friendlyFeedbackError({ message: 'new row violates row-level security policy' })).toMatch(/vários feedbacks/);
    expect(friendlyFeedbackError({ message: 'network' })).toMatch(/Tente novamente/);
    expect(friendlyFeedbackError(null)).toMatch(/Tente novamente/);
  });
});
