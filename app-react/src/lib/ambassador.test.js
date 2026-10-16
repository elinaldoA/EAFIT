// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc } }));

import {
  ambassadorLink, conversion, sourceLabel, fetchMyAmbassador, fetchMyAmbassadorChannels,
  fetchMyAmbassadorDaily, shareAmbassadorLink,
} from './ambassador';

beforeEach(() => { mockRpc.mockReset(); });

describe('helpers', () => {
  it('link com código e canal', () => {
    expect(ambassadorLink('anafit')).toBe('https://eafit.com.br/?ref=anafit');
    expect(ambassadorLink('anafit', 'tiktok')).toBe('https://eafit.com.br/?ref=anafit&origem=tiktok');
  });

  it('conversão e nomes dos canais', () => {
    expect(conversion(0, 1)).toBeNull();
    expect(conversion(8, 2)).toBe(25);
    expect(sourceLabel('whatsapp')).toBe('WhatsApp');
    expect(sourceLabel('direto')).toBe('Link sem canal');
    expect(sourceLabel('grupo-academia')).toBe('grupo-academia');
  });
});

describe('consultas', () => {
  it('quem não é embaixador recebe null', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchMyAmbassador(7)).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('my_ambassador_summary', { days_back: 7 });
  });

  it('converte os números', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ am_name: 'Ana', am_code: 'ana', am_active: true, am_visits: '9', am_signups: '3', am_total: '12', am_active_7d: '4' }], error: null });
    expect(await fetchMyAmbassador()).toEqual({ name: 'Ana', code: 'ana', active: true, visits: 9, signups: 3, total: 12, active7: 4 });
    mockRpc.mockResolvedValueOnce({ data: [{ ch_source: 'instagram', ch_visits: '5', ch_signups: '1' }], error: null });
    expect(await fetchMyAmbassadorChannels()).toEqual([{ source: 'instagram', visits: 5, signups: 1 }]);
    mockRpc.mockResolvedValueOnce({ data: [{ day: '2026-10-16', visits: '2', signups: '0' }], error: null });
    expect(await fetchMyAmbassadorDaily()).toEqual([{ day: '2026-10-16', visits: 2, signups: 0 }]);
  });

  it('propaga o erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('falhou') });
    await expect(fetchMyAmbassador()).rejects.toThrow('falhou');
  });
});

describe('shareAmbassadorLink', () => {
  it('sem compartilhar nativo copia o link do canal', async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await shareAmbassadorLink('ana', 'whatsapp')).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://eafit.com.br/?ref=ana&origem=whatsapp');
  });

  it('cancelar o compartilhar não copia', async () => {
    const err = Object.assign(new Error('x'), { name: 'AbortError' });
    Object.defineProperty(navigator, 'share', { value: vi.fn().mockRejectedValue(err), configurable: true });
    expect(await shareAmbassadorLink('ana')).toBe('cancelled');
  });
});
