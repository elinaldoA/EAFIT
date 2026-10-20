// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  fetchMyAmbassador: vi.fn(), fetchMyAmbassadorChannels: vi.fn(), fetchMyAmbassadorDaily: vi.fn(),
  shareAmbassadorLink: vi.fn(), copyAmbassadorLink: vi.fn(), goTo: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/ambassador', async orig => ({ ...(await orig()), ...h }));
vi.mock('../lib/appNav', () => ({ goTo: (...a) => h.goTo(...a) }));

import ProfileAmbassadorSection from './ProfileAmbassadorSection';

const SUMMARY = { name: 'Ana', code: 'anafit', active: true, visits: 20, signups: 5, total: 12, active7: 4 };

beforeEach(() => {
  Object.values(h).forEach(fn => fn.mockReset());
  h.fetchMyAmbassador.mockResolvedValue(SUMMARY);
  h.fetchMyAmbassadorChannels.mockResolvedValue([{ source: 'instagram', visits: 15, signups: 4 }, { source: 'direto', visits: 5, signups: 1 }]);
  h.fetchMyAmbassadorDaily.mockResolvedValue([{ day: '2026-10-15', visits: 3, signups: 0 }, { day: '2026-10-16', visits: 6, signups: 2 }]);
});
afterEach(cleanup);

describe('ProfileAmbassadorSection', () => {
  it('não aparece para quem não é embaixador', async () => {
    h.fetchMyAmbassador.mockResolvedValue(null);
    const { container } = render(<ProfileAmbassadorSection toast={vi.fn()} />);
    await waitFor(() => expect(h.fetchMyAmbassador).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('mostra link, números e canais — sem dados de quem se cadastrou', async () => {
    render(<ProfileAmbassadorSection toast={vi.fn()} />);
    fireEvent.click(await screen.findByText('Painel do embaixador'));
    expect(screen.getByText('12 cadastros pelo seu link')).toBeTruthy();
    expect(screen.getByText('https://eafit.com.br/?ref=anafit')).toBeTruthy();
    await screen.findByText('Instagram', { selector: 'td' });
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByText('Link sem canal')).toBeTruthy();
  });

  it('troca o período e compartilha pelo canal', async () => {
    const toast = vi.fn();
    h.shareAmbassadorLink.mockResolvedValue('copied');
    render(<ProfileAmbassadorSection toast={toast} />);
    fireEvent.click(await screen.findByText('Painel do embaixador'));
    fireEvent.click(screen.getByText('7 dias'));
    await waitFor(() => expect(h.fetchMyAmbassadorChannels).toHaveBeenCalledWith(7));
    fireEvent.click(screen.getByText('WhatsApp', { selector: 'button' }));
    await waitFor(() => expect(h.shareAmbassadorLink).toHaveBeenCalledWith('anafit', 'whatsapp'));
    expect(toast).toHaveBeenCalledWith('🔗 Link copiado');
  });

  it('influenciador vê o atalho para o modo Influenciador', async () => {
    h.fetchMyAmbassador.mockResolvedValue({ ...SUMMARY, kind: 'influenciador' });
    render(<ProfileAmbassadorSection toast={vi.fn()} />);
    expect(await screen.findByText('Influenciador EAFIT')).toBeTruthy();
    expect(screen.getByText('12 cadastros pelo seu link')).toBeTruthy();
    expect(screen.queryByText('Painel do embaixador')).toBeNull();
    fireEvent.click(screen.getByText('Abrir modo Influenciador'));
    expect(h.goTo).toHaveBeenCalledWith({ mode: 'influencer', tab: 'resultados' });
  });

  it('embaixador pausado vê o aviso e não compartilha', async () => {
    h.fetchMyAmbassador.mockResolvedValue({ ...SUMMARY, active: false });
    render(<ProfileAmbassadorSection toast={vi.fn()} />);
    expect(await screen.findByText('Link pausado pela equipe EAFIT')).toBeTruthy();
    fireEvent.click(screen.getByText('Painel do embaixador'));
    expect(screen.getByText(/Seu link está pausado/)).toBeTruthy();
    expect(screen.getByText('Instagram', { selector: 'button' }).disabled).toBe(true);
  });
});
