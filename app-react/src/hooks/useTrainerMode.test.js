// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ fetchIsTrainer: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/trainer', () => ({ fetchIsTrainer: (...a) => h.fetchIsTrainer(...a) }));

import { useTrainerMode } from './useTrainerMode';

const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  localStorage.clear();
  h.fetchIsTrainer.mockReset().mockResolvedValue(false);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useTrainerMode', () => {
  it('aluno comum: não é personal e o servidor confirma', async () => {
    const { result } = renderHook(() => useTrainerMode('u1'));
    await flush();
    expect(result.current.isTrainer).toBe(false);
    expect(h.fetchIsTrainer).toHaveBeenCalled();
  });

  it('personal: o servidor confirma e o valor fica guardado para a próxima abertura', async () => {
    h.fetchIsTrainer.mockResolvedValue(true);
    const { result } = renderHook(() => useTrainerMode('u1'));
    await flush();
    expect(result.current.isTrainer).toBe(true);
    expect(localStorage.getItem('eafit_is_trainer:u1')).toBe('1');
  });

  it('abre já como personal pelo valor guardado, sem esperar a rede', () => {
    localStorage.setItem('eafit_is_trainer:u1', '1');
    h.fetchIsTrainer.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTrainerMode('u1'));
    expect(result.current.isTrainer).toBe(true);
  });

  it('perdeu o acesso de personal: o servidor corrige e limpa o guardado', async () => {
    localStorage.setItem('eafit_is_trainer:u1', '1');
    h.fetchIsTrainer.mockResolvedValue(false);
    const { result } = renderHook(() => useTrainerMode('u1'));
    await flush();
    expect(result.current.isTrainer).toBe(false);
    expect(localStorage.getItem('eafit_is_trainer:u1')).toBeNull();
  });

  it('falha de rede mantém o último valor conhecido', async () => {
    localStorage.setItem('eafit_is_trainer:u1', '1');
    h.fetchIsTrainer.mockRejectedValue(new Error('rede'));
    const { result } = renderHook(() => useTrainerMode('u1'));
    await flush();
    expect(result.current.isTrainer).toBe(true);
  });

  it('sem usuário não consulta e não é personal', async () => {
    const { result } = renderHook(() => useTrainerMode(null));
    await flush();
    expect(result.current.isTrainer).toBe(false);
    expect(h.fetchIsTrainer).not.toHaveBeenCalled();
  });

  it('o modo padrão é trainer e a troca fica guardada', () => {
    const { result } = renderHook(() => useTrainerMode('u1'));
    expect(result.current.mode).toBe('trainer');
    act(() => result.current.setMode('aluno'));
    expect(result.current.mode).toBe('aluno');
    expect(localStorage.getItem('eafit_mode')).toBe('aluno');

    const again = renderHook(() => useTrainerMode('u1'));
    expect(again.result.current.mode).toBe('aluno');
  });
});
