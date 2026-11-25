// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';

const ka = vi.hoisted(() => ({ keepAwake: vi.fn(), allowSleep: vi.fn() }));
vi.mock('@capacitor-community/keep-awake', () => ({ KeepAwake: ka }));
vi.mock('../lib/native', () => ({ isNative: () => true }));

import { useWakeLock } from './useWakeLock';

beforeEach(() => {
  ka.keepAwake.mockReset().mockResolvedValue();
  ka.allowSleep.mockReset().mockResolvedValue();
});
afterEach(cleanup);

describe('useWakeLock no app Android', () => {
  it('liga a tela acesa nativa ao montar e solta ao desmontar', () => {
    const { unmount } = renderHook(() => useWakeLock());
    expect(ka.keepAwake).toHaveBeenCalledTimes(1);
    unmount();
    expect(ka.allowSleep).toHaveBeenCalledTimes(1);
  });

  it('desativado: não liga', () => {
    renderHook(() => useWakeLock(false));
    expect(ka.keepAwake).not.toHaveBeenCalled();
  });
});
