import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc } }));

import {
  fetchInstallSummary, fetchInstallDaily, fetchPushStaleRecent,
  buildInstallSummary, buildByOs, activeDays, formatDay, buildFunnel, buildRetention, buildByOrigin, buildByBrowser, buildDevices, buildInstallCompare,
} from './installs';

beforeEach(() => { mockRpc.mockReset(); });

describe('consultas', () => {
  it('passam o período e aguentam resposta vazia', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchInstallSummary(7)).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('admin_install_summary', { days_back: 7 });
    expect(await fetchInstallDaily(90)).toEqual([]);
    expect(mockRpc).toHaveBeenCalledWith('admin_install_daily', { days_back: 90 });
    await fetchPushStaleRecent(5);
    expect(mockRpc).toHaveBeenCalledWith('admin_push_stale_recent', { max_rows: 5 });
  });

  it('propagam o erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    await expect(fetchInstallSummary()).rejects.toThrow('not_authorized');
  });
});

describe('buildInstallSummary', () => {
  it('converte números e calcula a taxa de aceite do botão', () => {
    const s = buildInstallSummary({
      screen_shown: '10', prompt_accepted: 3, prompt_dismissed: 1, installs: 5, installs_prompt: 3,
      installs_browser: 1, installs_icon: 1, first_opens: 4, installed_total: 9, active_30d: 6, inactive_30d: 2, push_stale: 1,
    });
    expect(s).toMatchObject({ installs: 5, firstOpens: 4, installedTotal: 9, active30: 6, inactive30: 2, pushStale: 1 });
    expect(s.screen).toEqual({ shown: 10, accepted: 3, dismissed: 1, acceptedPct: 75 });
    expect(s.sources.map(x => x.total)).toEqual([3, 1, 1]);
  });

  it('sem resposta ao botão não inventa taxa', () => {
    expect(buildInstallSummary({ screen_shown: 2 }).screen.acceptedPct).toBeNull();
    expect(buildInstallSummary(null)).toBeNull();
  });
});

describe('por sistema e por dia', () => {
  it('rótulo do sistema', () => {
    expect(buildByOs([{ os: 'ios', installed_total: 2, installs: 1, active_30d: 1, push_stale: 0 }])[0])
      .toMatchObject({ label: 'iOS (iPhone/iPad)', installedTotal: 2, installs: 1 });
  });

  it('activeDays mantém só dias com movimento, do mais recente pro mais antigo', () => {
    expect(activeDays([
      { day: '2026-10-13', installs: 0, push_stale: 0 },
      { day: '2026-10-14', installs: 2, push_stale: 0 },
      { day: '2026-10-15', installs: 0, push_stale: 1 },
    ]).map(d => d.day)).toEqual(['2026-10-15', '2026-10-14']);
  });

  it('formatDay aceita data e data/hora no fuso de Brasília', () => {
    expect(formatDay('2026-10-15')).toBe('15/10/2026');
    expect(formatDay('2026-10-16T01:30:00+00:00')).toBe('15/10/2026');
    expect(formatDay(null)).toBe('—');
  });
});

describe('funil, retenção e origem', () => {
  const summary = buildInstallSummary({
    screen_shown: 100, prompt_accepted: 20, prompt_dismissed: 5, installs: 10, first_opens: 8, installed_total: 12,
    active_30d: 6, inactive_30d: 2, push_stale: 1,
  });

  it('calcula cada etapa sobre a anterior e usa a idade nas de retenção', () => {
    const retention = buildRetention([
      { kind: 'return', bucket: 7, total: 3, base: 6 }, { kind: 'return', bucket: 30, total: 0, base: 0 },
    ]);
    const f = buildFunnel(summary, retention);
    expect(f.map(x => [x.key, x.total, x.pct])).toEqual([
      ['shown', 100, null], ['accepted', 20, 20], ['installs', 10, 50], ['opened', 8, 80], ['r7', 3, 50],
    ]);
    expect(buildFunnel(null, retention)).toEqual([]);
  });

  it('retenção: retorno por idade e distribuição dos dias', () => {
    const r = buildRetention([
      { kind: 'return', bucket: 1, total: '3', base: '4' },
      { kind: 'days', bucket: 0, total: 1, base: 4 }, { kind: 'days', bucket: 8, total: 3, base: 4 },
    ]);
    expect(r.returns).toEqual([{ days: 1, total: 3, base: 4, pct: 75 }]);
    expect(r.distribution.map(d => [d.label, d.pct])).toEqual([['Nunca abriu pelo ícone', 25], ['8 a 15 dias', 75]]);
    expect(r.hasData).toBe(true);
    expect(buildRetention(null).hasData).toBe(false);
  });

  it('origem com %, navegador, comparação e aparelhos', () => {
    expect(buildByOrigin([{ source: 'sem_conta', installs: 1, active_30d: 0 }, { source: 'instagram', installs: 3, active_30d: 2 }])
      .map(o => [o.label, o.pct])).toEqual([['Aparelho sem conta', 25], ['instagram', 75]]);
    expect(buildByBrowser([{ browser: 'safari', installed_total: 2, installs: 1, active_30d: 1 }])[0]).toMatchObject({ label: 'Safari', installedTotal: 2 });
    expect(buildInstallCompare(null)).toBeNull();
    expect(buildInstallCompare({ installs: 2, push_stale: 3 })).toMatchObject({ installs: 2, pushStale: 3 });
    expect(buildDevices([{ installed_at: 'x', os: 'ios', browser: 'safari', install_source: 'icon', open_days: 2, user_id: null }])[0])
      .toMatchObject({ os: 'iOS (iPhone/iPad)', source: 'Pelo ícone', name: null });
  });

  it('indícios ÷ instalados por sistema', () => {
    expect(buildByOs([{ os: 'android', installed_total: 4, installs: 1, active_30d: 1, push_stale: 1 }])[0].stalePct).toBe(25);
  });
});
