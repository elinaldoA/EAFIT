// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/tracking', () => ({ trackFeature: vi.fn() }));

import BossMonster from './BossMonster';
import { monsterKind } from '../lib/arena';

afterEach(cleanup);

describe('BossMonster', () => {
  it('escolhe o monstro pelo tipo de meta', () => {
    expect(monsterKind('workouts')).toBe('gorilla');
    expect(monsterKind('xp')).toBe('dragon');
    expect(monsterKind('run_km')).toBe('serpent');
    expect(monsterKind('qualquer')).toBe('dragon');
    expect(monsterKind(undefined)).toBe('dragon');
  });

  it('desenha um monstro diferente para cada tipo', () => {
    const art = ['workouts', 'xp', 'run_km'].map(m => render(<BossMonster metric={m} />).container.innerHTML);
    expect(new Set(art).size).toBe(3);
  });

  it('muda a expressão e a classe conforme o estado', () => {
    const state = mood => render(<BossMonster metric="xp" mood={mood} label="Dragão" />).container;
    const idle = state('idle');
    expect(idle.querySelector('svg').classList.contains('monster--idle')).toBe(true);
    expect(idle.querySelector('svg').getAttribute('aria-label')).toBe('Dragão');
    expect(idle.querySelectorAll('ellipse[rx="2.4"]')).toHaveLength(2); // pupilas abertas
    const dead = state('defeated');
    expect(dead.querySelector('svg').classList.contains('monster--defeated')).toBe(true);
    expect(dead.innerHTML).toContain('M79 59 L89 69'); // olho em X
    const hurt = state('hurt');
    expect(hurt.querySelectorAll('ellipse[rx="2.4"]')).toHaveLength(0);
    expect(state('hit').querySelector('svg').classList.contains('monster--hit')).toBe(true);
  });
});
