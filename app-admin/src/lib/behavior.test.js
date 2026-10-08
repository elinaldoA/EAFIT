import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc } }));

import {
  fetchVisitBreakdown, fetchWorkoutCompletion, fetchUserClient,
  groupDimension, hourSeries, weekdaySeries, peakOf, buildSignup, buildUserEvents,
  buildInstallRetention, buildCompletion, formatDuration, describeClient, authErrorLabel,
  BROWSER_LABELS, FEATURE_LABELS,
} from './behavior';

beforeEach(() => { mockRpc.mockReset(); });

describe('consultas', () => {
  it('passam o período e devolvem lista vazia sem dados', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchVisitBreakdown(7)).toEqual([]);
    expect(mockRpc).toHaveBeenCalledWith('admin_visit_breakdown', { days_back: 7 });
  });

  it('as de linha única devolvem a linha ou null', async () => {
    mockRpc.mockResolvedValue({ data: [{ started: 3 }], error: null });
    expect(await fetchWorkoutCompletion(30)).toEqual({ started: 3 });
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchUserClient('u1')).toBeNull();
    expect(mockRpc).toHaveBeenLastCalledWith('admin_user_client', { target: 'u1' });
  });

  it('erro do banco sobe pra tela tratar', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('função não existe') });
    await expect(fetchVisitBreakdown(30)).rejects.toThrow('função não existe');
  });
});

describe('groupDimension', () => {
  const rows = [
    { dimension: 'browser', value: 'safari', visits: '6' },
    { dimension: 'browser', value: 'chrome', visits: 14 },
    { dimension: 'device', value: 'celular', visits: 20 },
    { dimension: 'os', value: 'ios', users: 3 },
  ];

  it('filtra a dimensão, rotula, ordena e calcula %', () => {
    expect(groupDimension(rows, 'browser', BROWSER_LABELS)).toEqual([
      { value: 'chrome', label: 'Chrome', total: 14, pct: 70 },
      { value: 'safari', label: 'Safari', total: 6, pct: 30 },
    ]);
  });

  it('aceita outra coluna de contagem e valor sem rótulo', () => {
    expect(groupDimension(rows, 'os', {}, 'users')).toEqual([{ value: 'ios', label: 'ios', total: 3, pct: 100 }]);
    expect(groupDimension(null, 'os')).toEqual([]);
  });
});

describe('séries de horário e dia', () => {
  const rows = [
    { dimension: 'hour', value: '07', visits: 2 }, { dimension: 'hour', value: '19', visits: '9' },
    { dimension: 'weekday', value: '1', visits: 5 }, { dimension: 'weekday', value: '6', visits: 1 },
  ];

  it('preenche as 24 horas e os 7 dias com zero onde não houve visita', () => {
    const hours = hourSeries(rows);
    expect(hours).toHaveLength(24);
    expect(hours[19]).toEqual({ hour: 19, label: '19h', total: 9 });
    expect(hours[0].total).toBe(0);
    expect(weekdaySeries(rows).map(d => d.total)).toEqual([0, 5, 0, 0, 0, 0, 1]);
  });

  it('acha o pico, ou null sem visitas', () => {
    expect(peakOf(hourSeries(rows)).label).toBe('19h');
    expect(peakOf(weekdaySeries(rows)).label).toBe('Seg');
    expect(peakOf(hourSeries([]))).toBeNull();
  });
});

describe('buildSignup', () => {
  it('monta as etapas e separa erros de cadastro e de login', () => {
    const out = buildSignup([
      { event: 'signup_start', detail: '', total: '40' },
      { event: 'signup_submit', detail: '', total: 30 },
      { event: 'signup_ok', detail: '', total: 12 },
      { event: 'signup_error', detail: 'termos', total: 9 },
      { event: 'signup_error', detail: 'weak_password', total: 4 },
      { event: 'login_error', detail: 'invalid_credentials', total: 7 },
    ]);
    expect(out.steps.map(s => [s.count, s.pctOfStart, s.pctOfPrev])).toEqual([[40, 100, null], [30, 75, 75], [12, 30, 40]]);
    expect(out.signupErrors.map(e => e.label)).toEqual(['Não aceitou os Termos de Uso', 'Senha fraca (recusada pelo servidor)']);
    expect(out.loginErrors).toEqual([{ detail: 'invalid_credentials', label: 'E-mail ou senha errados', total: 7 }]);
  });

  it('motivo desconhecido aparece como veio', () => {
    expect(authErrorLabel('captcha_failed')).toBe('captcha_failed');
    expect(authErrorLabel('')).toBe('Outro erro');
  });
});

describe('buildUserEvents', () => {
  const rows = [
    { event: '__active__', detail: '', users: '10', days: 80 },
    { event: 'page', detail: 'treino', users: 9, days: 40 },
    { event: 'page', detail: 'dash', users: 4, days: 6 },
    { event: 'feature', detail: 'live_mode', users: 5, days: 12 },
    { event: 'onboarding', detail: 'view', users: 8, days: 8 },
    { event: 'onboarding', detail: 'peso', users: 6, days: 6 },
    { event: 'onboarding', detail: 'done', users: 4, days: 4 },
    { event: 'onboarding', detail: 'erro_peso', users: 2, days: 2 },
    { event: 'push', detail: 'open', users: 3, days: 5 },
  ];

  it('calcula % sobre os usuários ativos e ordena pelo uso', () => {
    const out = buildUserEvents(rows);
    expect(out.active).toBe(10);
    expect(out.pages.map(p => [p.label, p.users, p.pct])).toEqual([['Treino', 9, 90], ['Evolução', 4, 40]]);
    expect(out.features[0]).toMatchObject({ key: 'live_mode', label: 'Modo treino ao vivo', users: 5, pct: 50 });
    expect(out.pushOpens).toEqual({ users: 3, pct: 30 });
  });

  it('lista também as funcionalidades que ninguém usou', () => {
    const out = buildUserEvents(rows);
    expect(out.features).toHaveLength(Object.keys(FEATURE_LABELS).length);
    expect(out.features.find(f => f.key === 'water')).toMatchObject({ users: 0, pct: 0 });
  });

  it('monta o onboarding na ordem do formulário, com os erros', () => {
    const out = buildUserEvents(rows);
    expect(out.onboarding.map(s => s.key)).toEqual(['view', 'sexo', 'idade', 'peso', 'altura', 'submit', 'done']);
    expect(out.onboarding.find(s => s.key === 'done')).toMatchObject({ count: 4, pctOfStart: 50 });
    expect(out.onboardingErrors).toEqual([{ key: 'erro_peso', label: 'Peso inválido', users: 2 }]);
  });

  it('sem linhas não quebra', () => {
    const out = buildUserEvents(null);
    expect(out.active).toBe(0);
    expect(out.pages).toEqual([]);
    expect(out.features.every(f => f.pct === null)).toBe(true);
  });
});

describe('treinos e instalação', () => {
  it('resume iniciados × concluídos', () => {
    expect(buildCompletion({ started: '20', completed: 15, avg_duration_seconds: 2700, median_duration_seconds: 4500 }))
      .toEqual({ started: 20, completed: 15, abandoned: 5, pct: 75, avg: '45 min', median: '1h15' });
    expect(buildCompletion(null)).toMatchObject({ started: 0, pct: null, avg: '—' });
  });

  it('formata duração', () => {
    expect(formatDuration(59)).toBe('1 min');
    expect(formatDuration(3600)).toBe('1h00');
    expect(formatDuration(0)).toBe('—');
  });

  it('compara app instalado com navegador', () => {
    expect(buildInstallRetention([{ display_mode: 'standalone', users: '8', trained_7d: 6 }])).toEqual([
      { mode: 'standalone', label: 'App instalado', users: 8, trained: 6, pct: 75 },
      { mode: 'browser', label: 'Pelo navegador', users: 0, trained: 0, pct: null },
    ]);
  });
});

describe('describeClient', () => {
  it('traduz o retrato do último acesso', () => {
    const pairs = describeClient({
      os: 'ios', browser: 'safari', device: 'celular', display_mode: 'standalone',
      app_version: '1.4.2', lang: 'pt', push_permission: 'denied', last_seen: '2026-10-07',
    });
    expect(Object.fromEntries(pairs)).toEqual({
      Sistema: 'iOS (iPhone/iPad)', Navegador: 'Safari', Aparelho: 'Celular', Modo: 'App instalado',
      'Versão do app': '1.4.2', Idioma: 'Português', Notificações: 'Bloqueou', 'Último acesso': '07/10/2026',
    });
    expect(describeClient(null)).toEqual([]);
  });
});
