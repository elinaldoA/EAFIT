// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { shouldOfferName, firstNameFromAccount, readNamePromptDismissed, markNamePromptDismissed, readLocalName } from './namePrompt';

beforeEach(() => localStorage.clear());

describe('shouldOfferName', () => {
  it('oferece a quem não tem nome nem apelido', () => {
    expect(shouldOfferName({ metadata: {} })).toBe(true);
    expect(shouldOfferName({ metadata: { nome: '   ' } })).toBe(true);
  });

  it('não oferece com nome ou apelido na conta ou no aparelho, nem depois de dispensado', () => {
    expect(shouldOfferName({ metadata: { nome: 'Ana' } })).toBe(false);
    expect(shouldOfferName({ metadata: { apelido: 'Aninha' } })).toBe(false);
    expect(shouldOfferName({ metadata: {}, localName: 'Ana' })).toBe(false);
    expect(shouldOfferName({ metadata: {}, dismissed: true })).toBe(false);
  });
});

describe('firstNameFromAccount', () => {
  it('pega o primeiro nome do que a conta trouxer (Google)', () => {
    expect(firstNameFromAccount({ given_name: 'Carla' })).toBe('Carla');
    expect(firstNameFromAccount({ full_name: '  Carla   Dias ' })).toBe('Carla');
    expect(firstNameFromAccount({ name: 'Rui Costa' })).toBe('Rui');
    expect(firstNameFromAccount({})).toBe('');
  });
});

describe('armazenamento', () => {
  it('"Agora não" fica gravado por conta', () => {
    expect(readNamePromptDismissed('u1')).toBe(false);
    markNamePromptDismissed('u1');
    expect(readNamePromptDismissed('u1')).toBe(true);
    expect(readNamePromptDismissed('u2')).toBe(false);
  });

  it('lê o nome guardado no aparelho (nome ou apelido)', () => {
    expect(readLocalName()).toBe('');
    localStorage.setItem('profile_apelido', 'Bia');
    expect(readLocalName()).toBe('Bia');
  });
});
