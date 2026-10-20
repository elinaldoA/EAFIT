// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ fetchMyAmbassador: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/ambassador', async orig => ({ ...(await orig()), fetchMyAmbassador: (...a) => h.fetchMyAmbassador(...a) }));

import { useProgram } from './useProgram';
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

describe('useProgram', () => {
  it('quem não está no programa fica sem papel', async () => {
    const { result } = renderHook(() => useProgram('u1'));
    await flush();
    expect(result.current).toBeNull();
  });

  it('embaixador e influenciador: o servidor confirma e o papel fica guardado', async () => {
    h.fetchMyAmbassador.mockResolvedValue({ code: 'bia', kind: 'embaixador', active: true });
    const { result } = renderHook(() => useProgram('u1'));
    await flush();
    expect(result.current).toBe('embaixador');
    expect(localStorage.getItem('eafit_program_kind:u1')).toBe('embaixador');

    h.fetchMyAmbassador.mockResolvedValue({ code: 'ana', kind: 'influenciador', active: true });
    const other = renderHook(() => useProgram('u2'));
    await flush();
    expect(other.result.current).toBe('influenciador');
  });

  it('guarda o código para o card de treino; link pausado sai do card', async () => {
    h.fetchMyAmbassador.mockResolvedValue({ code: 'bia', kind: 'embaixador', active: true });
    const { unmount } = renderHook(() => useProgram('u1'));
    await flush();
    expect(myRefCode()).toBe('bia');
    expect(localStorage.getItem('eafit_my_ref:u1')).toBe('bia');
    unmount();

    // próxima abertura: já vem do aparelho
    h.fetchMyAmbassador.mockResolvedValue({ code: 'bia', kind: 'embaixador', active: false });
    renderHook(() => useProgram('u1'));
    expect(myRefCode()).toBe('bia');
    await flush();
    expect(myRefCode()).toBe('');
  });

  it('sem usuário o card não leva código', () => {
    localStorage.setItem('eafit_my_ref:u1', 'ana');
    renderHook(() => useProgram(null));
    expect(myRefCode()).toBe('');
  });

  it('abre pelo valor guardado e mantém com falha de rede', async () => {
    localStorage.setItem('eafit_program_kind:u1', 'influenciador');
    h.fetchMyAmbassador.mockRejectedValue(new Error('rede'));
    const { result } = renderHook(() => useProgram('u1'));
    expect(result.current).toBe('influenciador');
    await flush();
    expect(result.current).toBe('influenciador');
  });

  it('saiu do programa: o servidor corrige e limpa o guardado', async () => {
    localStorage.setItem('eafit_program_kind:u1', 'embaixador');
    const { result } = renderHook(() => useProgram('u1'));
    await flush();
    expect(result.current).toBeNull();
    expect(localStorage.getItem('eafit_program_kind:u1')).toBeNull();
  });

  it('sem usuário não consulta', async () => {
    renderHook(() => useProgram(null));
    await flush();
    expect(h.fetchMyAmbassador).not.toHaveBeenCalled();
  });
});
