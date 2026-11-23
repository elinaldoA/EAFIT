// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('../../hooks/useBackToClose', () => ({ useBackToClose: () => {} }));
vi.mock('../../lib/modalRoot', () => ({ getModalRoot: () => document.body }));

import RunFlyby from './RunFlyby';
import { flybyCandidates } from './flybyMatch';

afterEach(() => cleanup());

const walk = (n, lon = 0) => [Array.from({ length: n }, (_, i) => [-2355000 + i * 10, -4665000 + lon, i * 10])];
const a = { id: 'a', isMe: true, name: 'Eu', started_at: '2026-11-17T08:00:00Z', route: walk(31) };
const b = { id: 'b', isMe: false, name: 'Bia', started_at: '2026-11-17T08:00:00Z', route: walk(31, 15) };
const c = { id: 'c', isMe: false, name: 'Caio', started_at: '2026-11-17T08:01:00Z', route: walk(31, 10) };

describe('RunFlyby', () => {
  it('mostra quanto tempo correram juntos e deixa arrastar o momento', () => {
    render(<RunFlyby run={a} candidates={flybyCandidates(a, [a, b])} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Flyby' })).toBeTruthy();
    expect(screen.getByText(/Correram juntos \(a menos de 50 m\) por [0-9]+:[0-9][0-9]/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/juntos/);
    fireEvent.change(screen.getByLabelText('Momento da corrida'), { target: { value: '120' } });
    expect(screen.getByRole('status').textContent).toMatch(/^2:00/);
  });
  it('com mais de um corredor em comum, escolhe com quem comparar', () => {
    render(<RunFlyby run={a} candidates={flybyCandidates(a, [a, b, c])} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Bia' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Caio' }));
    expect(screen.getByText(/Você e Caio/)).toBeTruthy();
  });
  it('fecha no ✕', () => {
    const onClose = vi.fn();
    render(<RunFlyby run={a} candidates={flybyCandidates(a, [a, b])} onClose={onClose} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar' })[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
