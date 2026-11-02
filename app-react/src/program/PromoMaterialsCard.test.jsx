// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ fetch: vi.fn(), download: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/promoMaterials', async orig => ({
  ...(await orig()),
  fetchPromoMaterials: (...a) => h.fetch(...a),
  downloadPromoMaterial: (...a) => h.download(...a),
}));

import PromoMaterialsCard from './PromoMaterialsCard';

const ITEM = {
  id: 'm1', title: 'Logo EAFIT', description: 'PNG transparente', storage_path: 'a/logo.png',
  file_name: 'logo.png', mime_type: 'image/png', size_bytes: 2.5 * 1024 * 1024, created_at: new Date().toISOString(),
};

beforeEach(() => {
  h.fetch.mockReset();
  h.download.mockReset().mockResolvedValue();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PromoMaterialsCard', () => {
  it('lista o material e baixa o arquivo', async () => {
    h.fetch.mockResolvedValue([ITEM]);
    render(<PromoMaterialsCard toast={vi.fn()} />);
    expect(await screen.findByText('Logo EAFIT')).toBeTruthy();
    expect(screen.getByText('PNG transparente')).toBeTruthy();
    expect(screen.getByText(/2,5 MB/)).toBeTruthy();
    fireEvent.click(screen.getByText('Baixar'));
    await waitFor(() => expect(h.download).toHaveBeenCalledWith(ITEM));
  });

  it('falha no download avisa', async () => {
    h.fetch.mockResolvedValue([ITEM]);
    h.download.mockRejectedValue(new Error('x'));
    const toast = vi.fn();
    render(<PromoMaterialsCard toast={toast} />);
    fireEvent.click(await screen.findByText('Baixar'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('⚠️ Não deu pra baixar o arquivo. Tente de novo.'));
  });

  it('material com texto pronto copia o texto com o link de quem copia', async () => {
    h.fetch.mockResolvedValue([{ ...ITEM, caption: 'Meu treino fala comigo 🎧' }]);
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const toast = vi.fn();
    render(<PromoMaterialsCard toast={toast} amb={{ code: 'ANA10', active: true }} />);
    expect(await screen.findByText(/Meu treino fala comigo 🎧 .*ANA10/)).toBeTruthy();
    fireEvent.click(screen.getByText('Copiar texto'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^Meu treino fala comigo 🎧 https?:\/\/.*ANA10.*instagram/)));
    expect(toast).toHaveBeenCalledWith('📋 Texto copiado');
  });

  it('sem texto pronto não mostra o botão de copiar', async () => {
    h.fetch.mockResolvedValue([ITEM]);
    render(<PromoMaterialsCard toast={vi.fn()} amb={{ code: 'ANA10', active: true }} />);
    expect(await screen.findByText('Logo EAFIT')).toBeTruthy();
    expect(screen.queryByText('Copiar texto')).toBeNull();
  });

  it('sem material mostra o aviso', async () => {
    h.fetch.mockResolvedValue([]);
    render(<PromoMaterialsCard toast={vi.fn()} />);
    expect(await screen.findByText(/Ainda não há material/)).toBeTruthy();
  });
});
