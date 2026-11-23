// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('../../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../lib/tracking', () => ({ trackFeature: vi.fn() }));
const downloadText = vi.fn();
vi.mock('./gpx', () => ({ downloadText: (...a) => downloadText(...a) }));

import RoutePlanner from './RoutePlanner';

beforeEach(() => {
  // jsdom não tem layout: o mapa ocupa 340×340 na tela.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 340, height: 340, right: 340, bottom: 340 });
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); downloadText.mockClear(); });

const map = () => screen.getByRole('application');
function tap(x, y) {
  fireEvent.pointerDown(map(), { pointerId: 1, clientX: x, clientY: y });
  fireEvent.pointerUp(map(), { pointerId: 1, clientX: x, clientY: y });
}

describe('RoutePlanner', () => {
  it('começa vazio e soma a distância a cada toque', () => {
    render(<RoutePlanner onClose={() => {}} />);
    expect(screen.getByText('0,00 km')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Baixar GPX/ }).disabled).toBe(true);
    tap(100, 100);
    tap(240, 100);
    expect(screen.queryByText('0,00 km')).toBeNull();
    expect(screen.getByRole('button', { name: /Baixar GPX/ }).disabled).toBe(false);
  });

  it('arrastar move o mapa e não marca ponto', () => {
    render(<RoutePlanner onClose={() => {}} />);
    fireEvent.pointerDown(map(), { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(map(), { pointerId: 1, clientX: 160, clientY: 100 });
    fireEvent.pointerUp(map(), { pointerId: 1, clientX: 160, clientY: 100 });
    expect(screen.getByRole('button', { name: /Desfazer/ }).disabled).toBe(true);
  });

  it('desfaz, fecha o circuito e limpa', () => {
    render(<RoutePlanner onClose={() => {}} />);
    tap(100, 100); tap(240, 100); tap(240, 240);
    const dist = () => screen.getByText(/ km$/).textContent;
    const open = dist();
    fireEvent.click(screen.getByRole('button', { name: /Fechar circuito/ }));
    expect(dist()).not.toBe(open);
    fireEvent.click(screen.getByRole('button', { name: /Desfazer/ }));
    expect(dist()).toBe(open);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(dist()).toBe('0,00 km');
  });

  it('baixa o GPX com os pontos marcados', () => {
    render(<RoutePlanner onClose={() => {}} />);
    tap(100, 100); tap(240, 100);
    fireEvent.click(screen.getByRole('button', { name: /Baixar GPX/ }));
    expect(downloadText).toHaveBeenCalledTimes(1);
    const [name, text] = downloadText.mock.calls[0];
    expect(name).toBe('eafit-rota.gpx');
    expect(text.match(/<rtept /g)).toHaveLength(2);
  });

  it('mostra o ritmo das corridas salvas para estimar o tempo', () => {
    localStorage.setItem('eafit_runs_cache', JSON.stringify({ userId: 'u1', runs: [{ gps: true, distance_m: 5000, duration_s: 1500 }] }));
    render(<RoutePlanner onClose={() => {}} />);
    expect(screen.getByText('no seu ritmo de 5:00/km')).toBeTruthy();
  });

  it('fecha no botão', () => {
    const onClose = vi.fn();
    render(<RoutePlanner onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalled();
  });
});
