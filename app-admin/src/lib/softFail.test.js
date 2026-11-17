import { describe, it, expect, vi } from 'vitest';
import { softFail } from './softFail';

describe('softFail', () => {
  it('registra a origem no console e devolve o valor reserva', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await Promise.reject(new Error('boom')).catch(softFail('Perfil: preferências', []));
    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalledWith('[painel] falha ao carregar "Perfil: preferências":', 'boom');
    warn.mockRestore();
  });
});
