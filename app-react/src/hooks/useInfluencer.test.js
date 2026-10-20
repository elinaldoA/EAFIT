// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ fetchMyAmbassador: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/ambassador', async orig => ({ ...(await orig()), fetchMyAmbassador: (...a) => h.fetchMyAmbassador(...a) }));

import { useInfluencer } from './useInfluencer';
import { myRefCode } from '../lib/myRef';

const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  localStorage.clear();
  h.fetchMyAmbassador.mockReset().mockResolvedValue(null);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useInfluencer', () => {
  it('quem não está no programa não é influenciador', async () => {
    const { result } = renderHook(() => useInfluencer('u1'));
    await flush();
    expect(result.current).toBe(false);
  });

  it('embaixador não é influenciador', async () => {
    h.fetchMyAmbassador.mockResolvedValue({ code: 'ana', kind: 'embaixador' });
    const { result } = renderHook(() => useInfluencer('u1'));
    await flush();
    expect(result.current).toBe(false);
  });

  it('influenciador: o servidor confirma e o valor fica guardado', async () => {
    h.fetchMyAmbassador.mockResolvedValue({ code: 'ana', kind: 'influenciador' });
    const { result } = renderHook(() => useInfluencer('u1'));
    await flush();
    expect(result.current).toBe(true);
    expect(localStorage.getItem('eafit_is_influencer:u1')).toBe('1');
  });

  it('embaixador não leva o link para o card de treino', async () => {
    h.fetchMyAmbassador.mockResolvedValue({ code: 'bia', kind: 'embaixador', active: true });
    renderHook(() => useInfluencer('u2'));
    await flush();
    expect(myRefCode()).toBe('');
  });

  it('guarda o código do influenciador para o card de treino', async () => {
    h.fetchMyAmbassador.mockResolvedValue({ code: 'ana', kind: 'influenciador', active: true });
    const { unmount } = renderHook(() => useInfluencer('u1'));
    await flush();
    expect(myRefCode()).toBe('ana');
    expect(localStorage.getItem('eafit_my_ref:u1')).toBe('ana');
    unmount();

    // próxima abertura: já vem do aparelho; link pausado sai do card
    h.fetchMyAmbassador.mockResolvedValue({ code: 'ana', kind: 'influenciador', active: false });
    renderHook(() => useInfluencer('u1'));
    expect(myRefCode()).toBe('ana');
    await flush();
    expect(myRefCode()).toBe('');
  });

  it('sem usuário o card não leva código', () => {
    localStorage.setItem('eafit_my_ref:u1', 'ana');
    renderHook(() => useInfluencer(null));
    expect(myRefCode()).toBe('');
  });

  it('abre pelo valor guardado e mantém com falha de rede', async () => {
    localStorage.setItem('eafit_is_influencer:u1', '1');
    h.fetchMyAmbassador.mockRejectedValue(new Error('rede'));
    const { result } = renderHook(() => useInfluencer('u1'));
    expect(result.current).toBe(true);
    await flush();
    expect(result.current).toBe(true);
  });

  it('saiu do programa: o servidor corrige e limpa o guardado', async () => {
    localStorage.setItem('eafit_is_influencer:u1', '1');
    const { result } = renderHook(() => useInfluencer('u1'));
    await flush();
    expect(result.current).toBe(false);
    expect(localStorage.getItem('eafit_is_influencer:u1')).toBeNull();
  });

  it('sem usuário não consulta', async () => {
    renderHook(() => useInfluencer(null));
    await flush();
    expect(h.fetchMyAmbassador).not.toHaveBeenCalled();
  });
});
