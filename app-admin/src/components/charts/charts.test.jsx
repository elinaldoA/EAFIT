// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { chartTicks, donutSlices, heatLevels } from './chartMath';
import LineChart from './LineChart';
import HeatStrip from './HeatStrip';
import Donut from './Donut';

describe('chartTicks', () => {
  it('topo redondo logo acima do máximo', () => {
    expect(chartTicks(0)).toEqual([0, 1]);
    expect(chartTicks(2)).toEqual([0, 1, 2]);
    expect(chartTicks(7)).toEqual([0, 5, 10]);
    expect(chartTicks(45)).toEqual([0, 25, 50]);
    expect(chartTicks(130)).toEqual([0, 100, 200]);
  });
});

describe('donutSlices', () => {
  const rows = n => Array.from({ length: n }, (_, i) => ({ value: `c${i}`, label: `C${i}`, total: n - i }));

  it('ignora zeros e calcula % sobre o que sobrou', () => {
    const { sum, slices } = donutSlices([{ value: 'a', label: 'A', total: 3 }, { value: 'b', label: 'B', total: 1 }, { value: 'z', label: 'Z', total: 0 }]);
    expect(sum).toBe(4);
    expect(slices.map(s => [s.key, s.pct])).toEqual([['a', 75], ['b', 25]]);
  });

  it('passando de 6, junta o resto em Outros', () => {
    const { slices } = donutSlices(rows(9));
    expect(slices).toHaveLength(6);
    expect(slices[5]).toMatchObject({ key: '__outros__', label: 'Outros (4)', total: 4 + 3 + 2 + 1, other: true });
  });

  it('ordered mantém a ordem das faixas', () => {
    const { slices } = donutSlices([{ key: 'a', label: '<10s', total: 1 }, { key: 'b', label: '10-60s', total: 5 }], { ordered: true });
    expect(slices.map(s => s.key)).toEqual(['a', 'b']);
  });
});

describe('heatLevels', () => {
  it('normaliza pelo máximo e zero fica 0', () => {
    expect(heatLevels([0, 5, 10])).toEqual([0, 0.5, 1]);
    expect(heatLevels([0, 0])).toEqual([0, 0]);
  });
});

describe('LineChart', () => {
  const points = [{ day: '01', v: 2 }, { day: '02', v: 8 }, { day: '03', v: 4 }];

  it('mostra a dica do ponto com as setas', () => {
    render(<LineChart points={points} series={[{ key: 'v', label: 'Treinos' }]} label={p => p.day} ariaLabel="Treinos por dia" extra={p => `dia ${p.day}`} />);
    const plot = screen.getByRole('img', { name: 'Treinos por dia' });
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    const tip = screen.getByRole('status');
    expect(tip.textContent).toContain('02');
    expect(tip.textContent).toContain('Treinos: 8');
    expect(tip.textContent).toContain('dia 02');
  });

  it('legenda só com 2+ séries', () => {
    const { container, rerender } = render(<LineChart points={points} series={[{ key: 'v', label: 'A' }]} ariaLabel="x" />);
    expect(container.querySelector('.chart-legend')).toBeNull();
    rerender(<LineChart points={points.map(p => ({ ...p, w: 1 }))} series={[{ key: 'v', label: 'A' }, { key: 'w', label: 'B' }]} ariaLabel="x" />);
    expect(container.querySelector('.chart-legend').textContent).toBe('AB');
  });

  it('tem tabela acessível com os valores', () => {
    const { container } = render(<LineChart points={points} series={[{ key: 'v', label: 'Treinos' }]} label={p => p.day} ariaLabel="x" />);
    expect(container.querySelectorAll('.sr-only table tbody tr')).toHaveLength(3);
  });
});

describe('HeatStrip', () => {
  const cells = [{ key: 0, label: 'Dom', total: 0 }, { key: 1, label: 'Seg', total: 9 }, { key: 2, label: 'Ter', total: 3 }];

  it('marca o pico e mostra a dica no foco', () => {
    const { container } = render(<HeatStrip cells={cells} unit="treinos" ariaLabel="Por dia" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Por dia; pico de 9 treinos em Seg');
    expect(container.querySelector('.heat__cell--peak').getAttribute('aria-label')).toBe('Seg: 9');
    expect(container.querySelector('.heat__cell--zero').getAttribute('aria-label')).toBe('Dom: 0');
    fireEvent.focus(screen.getByLabelText('Ter: 3'));
    expect(screen.getByRole('status').textContent).toBe('Ter3 treinos');
  });

  it('sem nenhum valor não desenha', () => {
    const { container } = render(<HeatStrip cells={[{ key: 0, label: 'x', total: 0 }]} ariaLabel="x" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('Donut', () => {
  it('3+ categorias viram rosca com legenda de número e %', () => {
    const { container } = render(<Donut rows={[{ value: 'm', label: 'Celular', total: 6 }, { value: 'd', label: 'Computador', total: 3 }, { value: 't', label: 'Tablet', total: 1 }]} />);
    expect(container.querySelectorAll('.donut circle')).toHaveLength(4); // trilho + 3 fatias
    expect(screen.getByText('Celular').nextSibling.textContent).toBe('6 · 60%');
    expect(container.querySelector('.donut__center').textContent).toBe('10Total');
    fireEvent.pointerEnter(screen.getByText('Tablet').closest('li'));
    expect(container.querySelector('.donut__center').textContent).toBe('10%Tablet');
  });

  it('2 categorias viram faixa dividida', () => {
    const { container } = render(<Donut rows={[{ value: 'f', label: 'Feminino', total: 1 }, { value: 'm', label: 'Masculino', total: 3 }]} />);
    expect(container.querySelector('.donut')).toBeNull();
    expect(container.querySelectorAll('.split__track span')).toHaveLength(2);
    expect(screen.getByText('Masculino').nextSibling.textContent).toBe('3 · 75%');
  });

  it('vazio mostra o aviso', () => {
    render(<Donut rows={[]} empty="Nada aqui." />);
    expect(screen.getByText('Nada aqui.')).toBeTruthy();
  });
});
