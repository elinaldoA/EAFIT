// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { playDrink, say, notify } = vi.hoisted(() => ({ playDrink: vi.fn(), say: vi.fn(), notify: vi.fn() }));
vi.mock('../lib/sound', () => ({ playHydrationSound: playDrink }));
vi.mock('../lib/coach', () => ({ coachSay: say }));
vi.mock('../lib/notifications', () => ({ sendNotification: notify }));

import { useWorkoutHydration } from './useWorkoutHydration';

const MIN = 60 * 1000;
const timer = (elapsedMs, status = 'running') => ({ status, elapsedMs });

function mount(initial) {
  return renderHook(props => useWorkoutHydration(props), { initialProps: { timer: timer(0), resting: false, ...initial } });
}

beforeEach(() => {
  playDrink.mockClear();
  say.mockClear();
  notify.mockReset().mockResolvedValue();
});
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('useWorkoutHydration', () => {
  it('sem nada ligado: começou o treino, aos 15 min avisa no descanso', () => {
    const { result, rerender } = mount();
    rerender({ timer: timer(15 * MIN + 1000), resting: false });
    expect(result.current.alert).toBeNull();
    rerender({ timer: timer(15 * MIN + 2000), resting: true });
    expect(result.current.alert).toBeTruthy();
    expect(playDrink).toHaveBeenCalledTimes(1);
    expect(say).toHaveBeenCalledWith('hydrate', {}, { queue: true });
  });

  it('sem descanso por 3 min avisa mesmo assim, e o próximo vem 15 min depois', () => {
    const { result, rerender } = mount();
    rerender({ timer: timer(18 * MIN), resting: false });
    expect(result.current.alert).toBeTruthy();
    act(() => result.current.dismiss());
    rerender({ timer: timer(30 * MIN), resting: true });
    expect(result.current.alert).toBeNull();
    rerender({ timer: timer(33 * MIN), resting: true });
    expect(result.current.alert).toBeTruthy();
  });

  it('treino parado ou pausado não avisa', () => {
    const { result, rerender } = mount({ timer: timer(0, 'idle') });
    rerender({ timer: timer(40 * MIN, 'paused'), resting: true });
    expect(result.current.alert).toBeNull();
  });

  it('quem desligou no perfil não recebe', () => {
    const { result, rerender } = mount({ enabled: false });
    rerender({ timer: timer(40 * MIN), resting: true, enabled: false });
    expect(result.current.alert).toBeNull();
  });

  it('com o app em segundo plano, vai como notificação do aparelho', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    const { rerender } = mount();
    rerender({ timer: timer(18 * MIN), resting: false });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('hidratar'), expect.objectContaining({ tag: 'workout-water' }));
  });

  it('o aviso some sozinho depois de 1 min', () => {
    vi.useFakeTimers();
    const { result, rerender } = mount();
    rerender({ timer: timer(18 * MIN), resting: false });
    expect(result.current.alert).toBeTruthy();
    act(() => { vi.advanceTimersByTime(MIN); });
    expect(result.current.alert).toBeNull();
  });
});
