// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { takeEmailLink } from './emailLink';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('takeEmailLink', () => {
  it('lê o código e o tipo e limpa a barra de endereço', () => {
    window.history.replaceState(null, '', '/app/?token_hash=abc123&type=recovery');
    expect(takeEmailLink()).toEqual({ token_hash: 'abc123', type: 'recovery' });
    expect(window.location.pathname + window.location.search).toBe('/app/');
  });

  it('preserva os outros parâmetros e o hash', () => {
    window.history.replaceState(null, '', '/app/?origem=mudanca&token_hash=abc&type=signup#treino');
    expect(takeEmailLink()).toEqual({ token_hash: 'abc', type: 'signup' });
    expect(window.location.search).toBe('?origem=mudanca');
    expect(window.location.hash).toBe('#treino');
  });

  it('sem código, ou com tipo desconhecido, não mexe em nada', () => {
    window.history.replaceState(null, '', '/app/?origem=card');
    expect(takeEmailLink()).toBeNull();
    expect(window.location.search).toBe('?origem=card');

    window.history.replaceState(null, '', '/app/?token_hash=abc&type=magiclink');
    expect(takeEmailLink()).toBeNull();
    expect(window.location.search).toBe('?token_hash=abc&type=magiclink');
  });
});
