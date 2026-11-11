import { describe, it, expect } from 'vitest';
import { hasGoogleIdentity, needsGoogleSignupFinish } from './googleAuth';

const NOW = new Date('2026-11-11T12:00:00Z').getTime();
const hoursAgo = h => new Date(NOW - h * 3600 * 1000).toISOString();
const google = (over = {}) => ({
  created_at: hoursAgo(1),
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: {},
  ...over,
});

describe('hasGoogleIdentity', () => {
  it('reconhece o Google em providers ou em provider', () => {
    expect(hasGoogleIdentity(google())).toBe(true);
    expect(hasGoogleIdentity({ app_metadata: { provider: 'google' } })).toBe(true);
    expect(hasGoogleIdentity({ app_metadata: { provider: 'email', providers: ['email', 'google'] } })).toBe(true);
  });
  it('não reconhece e-mail e senha nem usuário vazio', () => {
    expect(hasGoogleIdentity({ app_metadata: { provider: 'email', providers: ['email'] } })).toBe(false);
    expect(hasGoogleIdentity(null)).toBe(false);
  });
});

describe('needsGoogleSignupFinish', () => {
  it('conta do Google recém-criada e sem aceite precisa fechar o cadastro', () => {
    expect(needsGoogleSignupFinish(google(), NOW)).toBe(true);
  });
  it('conta que já tem o aceite gravado não repete', () => {
    expect(needsGoogleSignupFinish(google({ user_metadata: { termsAcceptedAt: hoursAgo(0.5) } }), NOW)).toBe(false);
  });
  it('conta antiga sem aceite fica para a tela de novo aceite', () => {
    expect(needsGoogleSignupFinish(google({ created_at: hoursAgo(48) }), NOW)).toBe(false);
  });
  it('conta de e-mail e senha não entra', () => {
    expect(needsGoogleSignupFinish(google({ app_metadata: { provider: 'email', providers: ['email'] } }), NOW)).toBe(false);
  });
  it('data de criação inválida não entra', () => {
    expect(needsGoogleSignupFinish(google({ created_at: 'x' }), NOW)).toBe(false);
  });
});
