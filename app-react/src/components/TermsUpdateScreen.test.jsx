// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ auth: {}, fetchCurrentLegalDate: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/legal', async orig => ({ ...(await orig()), fetchCurrentLegalDate: (...a) => h.fetchCurrentLegalDate(...a) }));

import TermsUpdateScreen from './TermsUpdateScreen';

beforeEach(() => {
  h.auth = {
    user: { id: 'u1', user_metadata: { termsAcceptedAt: '2026-01-10T12:00:00.000Z' } },
    updateProfile: vi.fn().mockResolvedValue({ error: null }),
    logout: vi.fn(),
  };
  h.fetchCurrentLegalDate.mockReset().mockResolvedValue('2026-06-01');
});
afterEach(cleanup);

describe('TermsUpdateScreen', () => {
  it('pede novo aceite a quem aceitou antes da versão em vigor e grava a data', async () => {
    render(<TermsUpdateScreen />);
    expect(await screen.findByText('Atualizamos nossos termos')).toBeTruthy();
    expect(screen.getByText('Termos de Uso').getAttribute('href')).toBe('legal/termos.html');
    fireEvent.click(screen.getByText('Li e aceito'));
    await waitFor(() => expect(h.auth.updateProfile).toHaveBeenCalledTimes(1));
    expect(h.auth.updateProfile.mock.calls[0][0].termsAcceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('mostra erro se não conseguir gravar e permite sair da conta', async () => {
    h.auth.updateProfile.mockResolvedValue({ error: new Error('offline') });
    render(<TermsUpdateScreen />);
    fireEvent.click(await screen.findByText('Li e aceito'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByText('Sair da conta'));
    expect(h.auth.logout).toHaveBeenCalled();
  });

  it('não aparece para quem já aceitou a versão atual, sem versão ou se a consulta falhar', async () => {
    h.auth.user = { id: 'u1', user_metadata: { termsAcceptedAt: '2026-07-01T12:00:00.000Z' } };
    const a = render(<TermsUpdateScreen />);
    await waitFor(() => expect(h.fetchCurrentLegalDate).toHaveBeenCalledTimes(1));
    expect(a.container.textContent).toBe('');
    a.unmount();

    h.auth.user = { id: 'u1', user_metadata: {} };
    h.fetchCurrentLegalDate.mockResolvedValue(null);
    const b = render(<TermsUpdateScreen />);
    await waitFor(() => expect(h.fetchCurrentLegalDate).toHaveBeenCalledTimes(2));
    expect(b.container.textContent).toBe('');
    b.unmount();

    h.fetchCurrentLegalDate.mockRejectedValue(new Error('rede'));
    const c = render(<TermsUpdateScreen />);
    await waitFor(() => expect(h.fetchCurrentLegalDate).toHaveBeenCalledTimes(3));
    expect(c.container.textContent).toBe('');
  });
});
