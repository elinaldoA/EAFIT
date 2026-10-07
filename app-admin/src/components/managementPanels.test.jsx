// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockRpc, mockDownload } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockDownload: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc } }));
vi.mock('../lib/csv', async orig => ({ ...(await orig()), downloadCsv: mockDownload }));

import KpiPanel from './KpiPanel';
import AudienceInsights from './AudienceInsights';

const kpis = {
  active_cur: 20, active_prev: 10, sessions_cur: 50, sessions_prev: 100, signups_cur: 4, signups_prev: 0,
  rating_cur: 4.5, rating_prev: 4.5, duration_min_cur: null, duration_min_prev: 40,
  dau: 5, wau: 10, mau: 20, never_trained: 7, total_users: 100,
};

const activity = [
  { day: '2026-03-01', sessions: 3, active_users: 2, signups: 1 },
  { day: '2026-03-02', sessions: 0, active_users: 0, signups: 0 },
];

function mockKpiRpc({ k = kpis, a = activity } = {}) {
  mockRpc.mockImplementation(async name => {
    if (name === 'admin_kpis') return { data: [k], error: null };
    if (name === 'admin_activity_by_day') return { data: a, error: null };
    return { data: [], error: null };
  });
}

beforeEach(() => vi.clearAllMocks());

describe('KpiPanel', () => {
  it('mostra os indicadores, variações e razões de uso', async () => {
    mockKpiRpc();
    render(<KpiPanel />);
    expect(await screen.findByText('Usuários ativos · treinaram no período')).toBeTruthy();
    expect(screen.getByText(/▲ 100% vs\. período anterior/)).toBeTruthy();
    expect(screen.getByText(/▼ 50% vs\. período anterior/)).toBeTruthy();
    expect(screen.getByText('novo')).toBeTruthy();
    expect(screen.getByText('4.5 / 5')).toBeTruthy();
    expect(screen.getByText('5 · 10 · 20')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText('Nunca treinaram (de 100 usuários)')).toBeTruthy();
  });

  it('duração nula vira travessão', async () => {
    mockKpiRpc();
    render(<KpiPanel />);
    await screen.findByText('Duração média · por treino');
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('troca o período e refaz a consulta', async () => {
    mockKpiRpc();
    render(<KpiPanel />);
    await screen.findByText('Visão gerencial');
    await screen.findByText('Usuários ativos · treinaram no período');
    fireEvent.click(screen.getByRole('button', { name: '7 dias' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_kpis', { days_back: 7 }));
    expect(mockRpc).toHaveBeenCalledWith('admin_activity_by_day', { days_back: 7 });
  });

  it('troca a série do gráfico', async () => {
    mockKpiRpc();
    render(<KpiPanel />);
    await screen.findByRole('img', { name: /Treinos por dia/ });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastros' }));
    expect(screen.getByRole('img', { name: /Cadastros por dia/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cadastros' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('exporta a atividade em CSV', async () => {
    mockKpiRpc();
    render(<KpiPanel />);
    await screen.findByText('Exportar CSV');
    fireEvent.click(screen.getByText('Exportar CSV'));
    expect(mockDownload).toHaveBeenCalledTimes(1);
    const [name, csv] = mockDownload.mock.calls[0];
    expect(name).toBe('atividade_30d.csv');
    expect(csv.split('\n')[0]).toBe('Dia,Treinos,UsuariosAtivos,Cadastros');
    expect(csv).toContain('2026-03-01,3,2,1');
  });

  it('desabilita exportação sem atividade', async () => {
    mockKpiRpc({ a: [] });
    render(<KpiPanel />);
    await screen.findByText('Exportar CSV');
    expect(screen.getByText('Exportar CSV').disabled).toBe(true);
  });

  it('mostra erro da consulta', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    render(<KpiPanel />);
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });
});

describe('AudienceInsights', () => {
  const distribution = [
    { dimension: 'meta', value: 'massa', total: '30' },
    { dimension: 'meta', value: 'forca', total: '10' },
    { dimension: 'nivel', value: 'iniciante', total: '5' },
  ];
  const exercises = [
    { exercise_name: 'Supino', sets_done: 100, users_count: 12, avg_carga: 60 },
    { exercise_name: 'Prancha', sets_done: 20, users_count: 5, avg_carga: null },
  ];

  function mockAudienceRpc(ex = exercises, dist = distribution) {
    mockRpc.mockImplementation(async name => ({
      data: name === 'admin_top_exercises' ? ex : dist, error: null,
    }));
  }

  it('mostra distribuição ordenada com percentuais e "Sem dados" para dimensões vazias', async () => {
    mockAudienceRpc();
    render(<AudienceInsights />);
    expect(await screen.findByText('massa')).toBeTruthy();
    expect(screen.getByText('30 · 75%')).toBeTruthy();
    expect(screen.getByText('10 · 25%')).toBeTruthy();
    expect(screen.getByText('5 · 100%')).toBeTruthy();
    expect(screen.getByText('Sem dados.')).toBeTruthy();
  });

  it('lista exercícios com carga média ou travessão', async () => {
    mockAudienceRpc();
    render(<AudienceInsights />);
    expect(await screen.findByText('Supino')).toBeTruthy();
    expect(screen.getByText('60 kg')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('admin_top_exercises', { days_back: 30, max_rows: 10 });
  });

  it('troca o período dos exercícios', async () => {
    mockAudienceRpc();
    render(<AudienceInsights />);
    await screen.findByText('Supino');
    fireEvent.click(screen.getByRole('button', { name: '90 dias' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_top_exercises', { days_back: 90, max_rows: 10 }));
  });

  it('mostra mensagem sem séries concluídas', async () => {
    mockAudienceRpc([], distribution);
    render(<AudienceInsights />);
    expect(await screen.findByText('Nenhuma série concluída no período.')).toBeTruthy();
  });

  it('mostra erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('negado') });
    render(<AudienceInsights />);
    expect(await screen.findByText('negado')).toBeTruthy();
  });
});
