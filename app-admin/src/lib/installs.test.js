import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc } }));

import {
  fetchInstallSummary, fetchInstallDaily, fetchPushStaleRecent,
  buildInstallSummary, buildByOs, activeDays, formatDay,
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
