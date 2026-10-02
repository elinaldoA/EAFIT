import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shareInvite, INVITE_TEXT } from './invite';
import { INVITE_URL } from './links';

function setNavigator(nav) {
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
}

describe('shareInvite', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('usa o compartilhar do sistema com o link de convite', async () => {
    const share = vi.fn().mockResolvedValue();
    setNavigator({ share });
    expect(await shareInvite()).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'EAFIT', text: INVITE_TEXT, url: INVITE_URL });
    expect(INVITE_URL).toMatch(/\/landing\/\?origem=convite$/);
  });

  it('fechar o menu não é erro', async () => {
    setNavigator({ share: vi.fn().mockRejectedValue(Object.assign(new Error(), { name: 'AbortError' })) });
    expect(await shareInvite()).toBe('cancelled');
  });

  it('sem compartilhar nativo, copia texto + link', async () => {
    const writeText = vi.fn().mockResolvedValue();
    setNavigator({ clipboard: { writeText } });
    expect(await shareInvite()).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(`${INVITE_TEXT} ${INVITE_URL}`);
  });

  it('compartilhar bloqueado cai pra cópia; se nada funciona, avisa falha', async () => {
    const writeText = vi.fn().mockResolvedValue();
    setNavigator({ share: vi.fn().mockRejectedValue(new Error('NotAllowed')), clipboard: { writeText } });
    expect(await shareInvite()).toBe('copied');

    setNavigator({ clipboard: { writeText: vi.fn().mockRejectedValue(new Error('x')) } });
    expect(await shareInvite()).toBe('failed');
  });
});
