// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/tracking', () => ({ trackFeature: vi.fn() }));

import HeroAvatar from './HeroAvatar';

afterEach(cleanup);

const hero = { body: 2, skin: 2, hair_style: 1, hair_color: 2, outfit: 1 };
const q = (container, sel) => container.querySelector(sel);

describe('HeroAvatar', () => {
  it('desenha o herói com a faixa de nível e o humor pedidos', () => {
    const { container } = render(<HeroAvatar hero={hero} level={1} label="Meu herói" />);
    const svg = q(container, 'svg');
    expect(svg.getAttribute('data-tier')).toBe('1');
    expect(svg.getAttribute('aria-label')).toBe('Meu herói');
    expect(svg.classList.contains('hero--idle')).toBe(true);
  });

  it('acrescenta equipamento a cada faixa de nível', () => {
    const at = level => render(<HeroAvatar hero={hero} level={level} />).container;
    const t1 = at(1);
    expect(q(t1, '.hero__cape')).toBeNull();
    expect(q(t1, '.hero__aura')).toBeNull();
    expect(q(t1, '.hero__halo')).toBeNull();
    const t5 = at(20);
    expect(q(t5, '.hero__cape')).not.toBeNull();
    expect(q(t5, '.hero__aura')).not.toBeNull();
    expect(q(t5, '.hero__halo')).toBeNull();
    const t6 = at(30);
    expect(q(t6, '.hero__halo')).not.toBeNull();
    // mais equipamento = mais peças desenhadas
    expect(q(at(15), 'svg').querySelectorAll('ellipse').length).toBeGreaterThan(q(at(5), 'svg').querySelectorAll('ellipse').length);
  });

  it('usa as escolhas da pessoa e aceita dado inválido sem quebrar', () => {
    const { container } = render(<HeroAvatar hero={{ ...hero, outfit: 2, skin: 5 }} level={1} />);
    expect(container.innerHTML).toContain('#EF4444'); // roupa 2
    expect(container.innerHTML).toContain('#8D5524'); // pele 5
    cleanup();
    const bad = render(<HeroAvatar hero={{ body: 99, skin: 'x' }} level="abc" />).container;
    expect(q(bad, 'svg').getAttribute('data-tier')).toBe('1');
  });

  it('mostra só a cabeça no recorte e troca o humor', () => {
    const head = render(<HeroAvatar hero={hero} crop="head" mood="still" />).container;
    expect(q(head, 'svg').getAttribute('viewBox')).toBe('58 28 84 84');
    expect(q(head, '.hero__arm')).toBeNull();
    cleanup();
    const cheer = render(<HeroAvatar hero={hero} mood="cheer" />).container;
    expect(q(cheer, 'svg').classList.contains('hero--cheer')).toBe(true);
    expect(cheer.querySelectorAll('.hero__arm')).toHaveLength(2);
  });

  it('desenha os seis estilos de cabelo', () => {
    const shapes = [1, 2, 3, 4, 5, 6].map(s => render(<HeroAvatar hero={{ ...hero, hair_style: s }} crop="head" />).container.innerHTML);
    expect(new Set(shapes).size).toBe(6);
  });
});
