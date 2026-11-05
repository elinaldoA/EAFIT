// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import RouteDrawing from './RouteDrawing';

afterEach(cleanup);
const route = [Array.from({ length: 30 }, (_, i) => [-2358740, -4665760 + i * 20, i * 4])];

describe('RouteDrawing', () => {
  it('sem percurso não mostra nada', () => {
    const { container } = render(<RouteDrawing route={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('tocar no mapa abre a tela cheia, com zoom, e o ✕ fecha', () => {
    render(<RouteDrawing route={route} />);
    fireEvent.click(screen.getByRole('button', { name: /tela cheia/ }));
    const dialog = screen.getByRole('dialog', { name: 'Mapa do percurso' });
    expect(dialog).toBeTruthy();
    const tilesBefore = dialog.querySelectorAll('.run-map__tiles img')[0]?.getAttribute('src');
    fireEvent.click(screen.getByRole('button', { name: 'Aproximar' }));
    const tilesAfter = dialog.querySelectorAll('.run-map__tiles img')[0]?.getAttribute('src');
    expect(tilesAfter).not.toBe(tilesBefore);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar mapa' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
