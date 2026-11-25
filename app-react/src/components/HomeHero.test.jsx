// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ goTo: vi.fn() }));
vi.mock('../lib/appNav', () => ({ goTo: h.goTo }));
vi.mock('../lib/tracking', () => ({ trackFeature: vi.fn() }));
vi.mock('../lib/coach', () => ({ greeting: () => 'Boa noite' }));
vi.mock('../data/treinoData', async importOriginal => ({
  ...(await importOriginal()), todayName: () => 'Terça', todayDate: () => '2026-10-06',
}));

import HomeHero from './HomeHero';

const DAYS = ['Segunda', 'Terça', 'Quarta'].map(dia => ({ dia, foco: 'Peito' }));
const base = {
  user: { email: 'ana@x.com', user_metadata: { nome: 'Ana Souza' } },
  workDays: DAYS, isDayDone: d => d === 'Segunda', missedSet: new Set(['Quarta']),
};

afterEach(() => { cleanup(); h.goTo.mockReset(); });

describe('HomeHero', () => {
  it('cumprimenta pelo primeiro nome e mostra a sequência', () => {
    render(<HomeHero {...base} streak={3} />);
    expect(screen.getByRole('heading', { name: 'Boa noite, Ana' })).toBeTruthy();
    expect(screen.getByText('🔥 Sequência de 3 dias')).toBeTruthy();
  });

  it('sem nome (só e-mail) não chama a pessoa pelo e-mail, e sem sequência não mostra o chip', () => {
    render(<HomeHero {...base} user={{ email: 'ana@x.com', user_metadata: {} }} streak={0} />);
    expect(screen.getByRole('heading', { name: 'Boa noite' })).toBeTruthy();
    expect(screen.queryByText(/Sequência/)).toBeNull();
  });

  it('semana em dias: feito, hoje e atrasado', () => {
    const { container } = render(<HomeHero {...base} />);
    expect(container.querySelectorAll('.week-strip__day')).toHaveLength(3);
    expect(container.querySelector('.week-strip__day--done')).toBeTruthy();
    expect(container.querySelector('.week-strip__day--today')).toBeTruthy();
    expect(container.querySelector('.week-strip__day--missed')).toBeTruthy();
  });

  it('atalhos levam à tela certa; Recuperação some com o recurso desligado', () => {
    const { rerender } = render(<HomeHero {...base} />);
    fireEvent.click(screen.getByRole('button', { name: /Evolução/ }));
    expect(h.goTo).toHaveBeenCalledWith({ tab: 'dash', dashTab: 'treinos' });
    fireEvent.click(screen.getByRole('button', { name: /Histórico/ }));
    expect(h.goTo).toHaveBeenCalledWith({ tab: 'dash', dashTab: 'historico' });
    expect(screen.getByRole('button', { name: /Recuperação/ })).toBeTruthy();
    rerender(<HomeHero {...base} flagOn={f => f !== 'recuperacao_muscular'} />);
    expect(screen.queryByRole('button', { name: /Recuperação/ })).toBeNull();
  });
});
