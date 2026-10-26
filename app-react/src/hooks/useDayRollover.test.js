// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';

const { today } = vi.hoisted(() => ({ today: { value: '2026-10-07' } }));
vi.mock('../data/treinoData', () => ({ todayDate: () => today.value }));

import { useDayRollover } from './useDayRollover';

const reload = vi.fn();
const original = window.location;

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  today.value = '2026-10-07';
  reload.mockClear();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
});
afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'location', { configurable: true, value: original });
  setVisibility('visible');
});

describe('useDayRollover', () => {
  it('voltar ao primeiro plano no mesmo dia não recarrega', () => {
    renderHook(() => useDayRollover());
    setVisibility('visible');
    expect(reload).not.toHaveBeenCalled();
  });

  it('voltar ao primeiro plano num dia diferente recarrega a página', () => {
    renderHook(() => useDayRollover());
    today.value = '2026-10-08';
    setVisibility('visible');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ir para segundo plano nunca recarrega, mesmo virando o dia', () => {
    renderHook(() => useDayRollover());
    today.value = '2026-10-08';
    setVisibility('hidden');
    expect(reload).not.toHaveBeenCalled();
  });

  it('ao desmontar para de escutar', () => {
    const { unmount } = renderHook(() => useDayRollover());
    unmount();
    today.value = '2026-10-08';
    setVisibility('visible');
    expect(reload).not.toHaveBeenCalled();
  });
});
