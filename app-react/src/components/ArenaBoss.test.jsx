// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/tracking', () => ({ trackFeature: vi.fn() }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../lib/arena', async importActual => ({
  ...(await importActual()),
  fetchArenaBoss: (...a) => h.api.fetchArenaBoss(...a),
  claimArenaBoss: (...a) => h.api.claimArenaBoss(...a),
  fetchArena: (...a) => h.api.fetchArena(...a),
}));
vi.mock('../lib/hero', async importActual => ({
  ...(await importActual()),
  fetchHero: (...a) => h.api.fetchHero(...a),
  fetchHeroForm: (...a) => h.api.fetchHeroForm(...a),
}));

import ArenaBoss from './ArenaBoss';

const BOSS = {
  id: 'b1', title: 'O Dragão do Esforço', emoji: '🐉', description: 'Somem XP até derrubar o dragão.', metric: 'xp',
  goal: 750, value: 300, mine: 60, participants: 9, starts_on: '2026-11-30', ends_on: '2099-12-06', reward_xp: 40,
  defeated: false, claimed: false, can_claim: false,
};
const DATA = { enabled: true, run_released: true, boss: BOSS, last: { title: 'O Gigante das Séries', emoji: '🦍', defeated: true } };

beforeEach(() => {
  h.toast.mockReset();
  h.api = {
    fetchArenaBoss: vi.fn(),
    claimArenaBoss: vi.fn().mockResolvedValue({ xp: 40 }),
    fetchArena: vi.fn().mockResolvedValue({ level: 12 }),
    fetchHero: vi.fn().mockResolvedValue(null),
    fetchHeroForm: vi.fn().mockResolvedValue(null),
  };
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ArenaBoss', () => {
  it('some com a Arena desligada, sem chefão ou com erro', async () => {
    h.api.fetchArenaBoss.mockResolvedValue({ enabled: false });
    const a = render(<ArenaBoss sport="gym" />);
    await waitFor(() => expect(h.api.fetchArenaBoss).toHaveBeenCalledTimes(1));
    expect(a.container.innerHTML).toBe('');
    cleanup();
    h.api.fetchArenaBoss.mockResolvedValue({ enabled: true, run_released: true, boss: null });
    const b = render(<ArenaBoss sport="gym" />);
    await waitFor(() => expect(h.api.fetchArenaBoss).toHaveBeenCalledTimes(2));
    expect(b.container.innerHTML).toBe('');
    cleanup();
    h.api.fetchArenaBoss.mockRejectedValue(new Error('rpc'));
    const c = render(<ArenaBoss sport="gym" />);
    await waitFor(() => expect(h.api.fetchArenaBoss).toHaveBeenCalledTimes(3));
    expect(c.container.innerHTML).toBe('');
  });

  it('esconde no Run enquanto o módulo não foi liberado', async () => {
    h.api.fetchArenaBoss.mockResolvedValue({ ...DATA, run_released: false });
    const { container } = render(<ArenaBoss sport="run" />);
    await waitFor(() => expect(h.api.fetchArenaBoss).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('mostra o chefão, a meta, a sua parte e a semana passada', async () => {
    h.api.fetchArenaBoss.mockResolvedValue(DATA);
    render(<ArenaBoss sport="gym" />);
    expect(await screen.findByText('🐉 O Dragão do Esforço')).toBeTruthy();
    expect(screen.getByText(/300 de 750 XP/)).toBeTruthy();
    expect(screen.getByText(/9 pessoas na batalha/)).toBeTruthy();
    expect(screen.getByText('Sua parte: 60 XP')).toBeTruthy();
    expect(screen.getByText('Bata a meta juntos e quem contribuiu leva +40 XP.')).toBeTruthy();
    expect(screen.getByText('Semana passada: 🦍 O Gigante das Séries foi derrotado!')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40');
    expect(screen.queryByText('Resgatar +40 XP')).toBeNull();
  });

  it('resgata o bônus quando derrotado', async () => {
    const won = { ...DATA, boss: { ...BOSS, value: 760, defeated: true, can_claim: true } };
    h.api.fetchArenaBoss.mockResolvedValueOnce(won).mockResolvedValue({ ...won, boss: { ...won.boss, can_claim: false, claimed: true } });
    render(<ArenaBoss sport="gym" />);
    expect(await screen.findByText('🎉 Chefão derrotado!')).toBeTruthy();
    fireEvent.click(screen.getByText('Resgatar +40 XP'));
    await waitFor(() => expect(h.api.claimArenaBoss).toHaveBeenCalledWith('b1'));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('⭐ +40 XP!'));
    expect(await screen.findByText('✅ Bônus resgatado')).toBeTruthy();
  });

  it('explica a quem não contribuiu e avisa quando o resgate falha', async () => {
    const lost = { ...DATA, boss: { ...BOSS, value: 760, mine: 0, defeated: true, can_claim: false } };
    h.api.fetchArenaBoss.mockResolvedValue(lost);
    render(<ArenaBoss sport="gym" />);
    expect(await screen.findByText('Só quem contribuiu resgata o bônus.')).toBeTruthy();
    cleanup();
    const can = { ...DATA, boss: { ...BOSS, value: 760, defeated: true, can_claim: true } };
    h.api.fetchArenaBoss.mockResolvedValue(can);
    h.api.claimArenaBoss.mockRejectedValue(new Error('boss_already_claimed'));
    render(<ArenaBoss sport="gym" />);
    fireEvent.click(await screen.findByText('Resgatar +40 XP'));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Não foi possível resgatar agora. Tente de novo.'));
  });

  it('desenha o monstro do tipo de meta, com a barra de vida', async () => {
    h.api.fetchArenaBoss.mockResolvedValue(DATA);
    const { container } = render(<ArenaBoss sport="gym" />);
    await screen.findByText('🐉 O Dragão do Esforço');
    expect(container.querySelector('svg.monster').getAttribute('data-kind')).toBe('dragon');
    expect(container.querySelector('svg.monster').classList.contains('monster--idle')).toBe(true);
    expect(screen.getByText('Vida 60%')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Seu herói' })).toBeTruthy();
    cleanup();
    localStorage.clear();
    h.api.fetchArenaBoss.mockResolvedValue({ ...DATA, boss: { ...BOSS, metric: 'workouts', goal: 10, value: 7 } });
    const g = render(<ArenaBoss sport="gym" />);
    await screen.findByText(/7 de 10 treinos/);
    expect(g.container.querySelector('svg.monster').getAttribute('data-kind')).toBe('gorilla');
    expect(g.container.querySelector('svg.monster').classList.contains('monster--idle')).toBe(true);
    cleanup();
    localStorage.clear();
    h.api.fetchArenaBoss.mockResolvedValue({ ...DATA, boss: { ...BOSS, metric: 'run_km', goal: 40, value: 36 } });
    const s = render(<ArenaBoss sport="run" />);
    await screen.findByText(/36 de 40 km/);
    expect(s.container.querySelector('svg.monster').getAttribute('data-kind')).toBe('serpent');
    expect(s.container.querySelector('svg.monster').classList.contains('monster--hurt')).toBe(true);
  });

  it('o monstro leva o golpe quando a comunidade avançou desde a última visita', async () => {
    localStorage.setItem('arena_boss_seen_u1', JSON.stringify({ id: 'b1', value: 150, defeated: false }));
    h.api.fetchArenaBoss.mockResolvedValue(DATA);
    const { container } = render(<ArenaBoss sport="gym" />);
    expect(await screen.findByText('−20% de vida')).toBeTruthy();
    expect(container.querySelector('svg.monster').classList.contains('monster--hit')).toBe(true);
    expect(JSON.parse(localStorage.getItem('arena_boss_seen_u1'))).toEqual({ id: 'b1', value: 300, defeated: false });
  });

  it('mostra a derrota e o baú quando o chefão cai', async () => {
    localStorage.setItem('arena_boss_seen_u1', JSON.stringify({ id: 'b1', value: 700, defeated: false }));
    h.api.fetchArenaBoss.mockResolvedValue({ ...DATA, boss: { ...BOSS, value: 760, defeated: true, can_claim: true } });
    const { container } = render(<ArenaBoss sport="gym" />);
    expect(await screen.findByText('Chefão derrotado!')).toBeTruthy();
    expect(container.querySelector('svg.monster').classList.contains('monster--defeated')).toBe(true);
    expect(container.querySelector('.boss-loot')).not.toBeNull();
    expect(screen.getByText('Vida 0%')).toBeTruthy();
  });

  it('não encena nada na primeira visita, em outro chefão ou sem mudança', async () => {
    h.api.fetchArenaBoss.mockResolvedValue(DATA);
    render(<ArenaBoss sport="gym" />);
    await screen.findByText('🐉 O Dragão do Esforço');
    expect(screen.queryByText(/de vida$/)).toBeNull();
    cleanup();
    localStorage.setItem('arena_boss_seen_u1', JSON.stringify({ id: 'outro', value: 10, defeated: false }));
    render(<ArenaBoss sport="gym" />);
    await screen.findByText('🐉 O Dragão do Esforço');
    expect(screen.queryByText(/de vida$/)).toBeNull();
    cleanup();
    localStorage.setItem('arena_boss_seen_u1', JSON.stringify({ id: 'b1', value: 300, defeated: false }));
    render(<ArenaBoss sport="gym" />);
    await screen.findByText('🐉 O Dragão do Esforço');
    expect(screen.queryByText(/de vida$/)).toBeNull();
  });

  it('mostra km e treinos na unidade do chefão', async () => {
    h.api.fetchArenaBoss.mockResolvedValue({ ...DATA, boss: { ...BOSS, metric: 'run_km', goal: 40, value: 12.5, mine: 5 }, last: null });
    render(<ArenaBoss sport="run" />);
    expect(await screen.findByText(/12,5 de 40 km/)).toBeTruthy();
    expect(screen.getByText('Sua parte: 5 km')).toBeTruthy();
    cleanup();
    h.api.fetchArenaBoss.mockResolvedValue({ ...DATA, boss: { ...BOSS, metric: 'workouts', goal: 10, value: 7, mine: 2 }, last: null });
    render(<ArenaBoss sport="gym" />);
    expect(await screen.findByText(/7 de 10 treinos/)).toBeTruthy();
  });
});
