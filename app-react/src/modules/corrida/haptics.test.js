import { describe, it, expect, vi, afterEach } from 'vitest';
import { buzz, BUZZ } from './haptics';

describe('buzz', () => {
  afterEach(() => { delete navigator.vibrate; });

  it('vibra com o padrao do aviso', () => {
    navigator.vibrate = vi.fn();
    buzz('km');
    expect(navigator.vibrate).toHaveBeenCalledWith(BUZZ.km);
  });

  it('nao faz nada sem suporte ou com aviso desconhecido', () => {
    expect(() => buzz('km')).not.toThrow();
    navigator.vibrate = vi.fn();
    buzz('inexistente');
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });

  it('cada aviso tem um padrao diferente', () => {
    const patterns = Object.values(BUZZ).map(p => p.join(','));
    expect(new Set(patterns).size).toBe(patterns.length);
  });
});
