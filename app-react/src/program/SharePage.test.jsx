// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), writeText: vi.fn(), shareInviteQr: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('./PromoMaterialsCard', () => ({ default: () => <div>material</div> }));
vi.mock('../lib/shareCard', () => ({ shareInviteQr: (...a) => h.shareInviteQr(...a) }));

import SharePage from './SharePage';

const AMB = { name: 'Ana', code: 'anafit', active: true, kind: 'influenciador' };

beforeEach(() => {
  h.toast.mockReset();
  h.writeText.mockReset().mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: h.writeText }, configurable: true });
});
afterEach(cleanup);

describe('SharePage', () => {
  it('mostra o link e os textos prontos com o link do canal', () => {
    render(<SharePage amb={AMB} />);
    expect(screen.getByText('https://eafit.com.br/app/?ref=anafit')).toBeTruthy();
    expect(screen.getByText(/^Bora treinar junto\?.*\?ref=anafit&origem=whatsapp$/)).toBeTruthy();
    expect(screen.getAllByText(/origem=instagram$/)).toHaveLength(2);
  });

  it('copia o texto pronto', async () => {
    render(<SharePage amb={AMB} />);
    fireEvent.click(screen.getAllByText('Copiar texto')[0]);
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('📋 Texto copiado'));
    expect(h.writeText).toHaveBeenCalledWith('Meu treino é montado e registrado no EAFIT. Grátis: https://eafit.com.br/app/?ref=anafit&origem=instagram');
  });

  it('mostra o QR do link e baixa a imagem', async () => {
    h.shareInviteQr.mockResolvedValue('downloaded');
    render(<SharePage amb={AMB} />);
    expect(screen.getByRole('img', { name: 'QR Code do seu link' })).toBeTruthy();
    fireEvent.click(screen.getByText('Baixar imagem do QR'));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('🖼️ Imagem baixada'));
    expect(h.shareInviteQr).toHaveBeenCalledWith('anafit');
  });

  it('link pausado: avisa e não deixa copiar textos', () => {
    render(<SharePage amb={{ ...AMB, active: false }} />);
    expect(screen.getByText(/Seu link está pausado/)).toBeTruthy();
    for (const b of screen.getAllByText('Copiar texto')) expect(b.disabled).toBe(true);
    expect(screen.getByText('Baixar imagem do QR').disabled).toBe(true);
  });
});
