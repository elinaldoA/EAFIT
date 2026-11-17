// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { friendlyError } from './friendlyError';

afterEach(() => { Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }); });

describe('friendlyError', () => {
  it.each([
    ['TypeError: Failed to fetch'],
    ['NetworkError when attempting to fetch resource.'],
    ['Load failed'],
    ['Network request failed'],
  ])('falha de rede (%s) vira aviso de conexão', msg => {
    expect(friendlyError(new Error(msg))).toBe('Sem conexão. Confira a internet e tente de novo.');
  });

  it('sem internet no aparelho vira aviso de conexão, qualquer que seja o erro', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    expect(friendlyError({ message: 'permission denied' })).toBe('Sem conexão. Confira a internet e tente de novo.');
  });

  it('sessão vencida pede para entrar de novo', () => {
    expect(friendlyError({ message: 'JWT expired' })).toBe('Sua sessão expirou. Entre de novo.');
    expect(friendlyError({ message: 'Invalid Refresh Token: Already Used' })).toBe('Sua sessão expirou. Entre de novo.');
  });

  it('qualquer outro erro vira o texto geral (ou o que a tela pediu), sem a mensagem crua', () => {
    expect(friendlyError({ message: 'duplicate key value violates unique constraint "x"' })).toBe('Não foi possível salvar. Tente de novo.');
    expect(friendlyError(null, 'Erro específico')).toBe('Erro específico');
  });
});

describe('userError', () => {
  it('mensagem escrita pelo app aparece como está', async () => {
    const { userError } = await import('./friendlyError');
    expect(friendlyError(userError('Imagem muito grande (máx. 5MB).'))).toBe('Imagem muito grande (máx. 5MB).');
  });
});
