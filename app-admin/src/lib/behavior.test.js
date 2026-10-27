import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc } }));

import {
  fetchVisitBreakdown, fetchWorkoutCompletion, fetchUserClient, buildEmailStats, buildSessionStats, formatSeconds,
  groupDimension, hourSeries, weekdaySeries, peakOf, buildSignup, buildUserEvents,
  buildInstallRetention, buildCompletion, formatDuration, describeClient, authErrorLabel,
  BROWSER_LABELS, FEATURE_LABELS, bucketLabel, bucketFullLabel, buildAccessTimeline, timelineBuckets,
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
      IP: '—', Local: '—',
    });
    expect(describeClient(null)).toEqual([]);
  });

  it('mostra IP e local do último acesso', () => {
    const place = c => Object.fromEntries(describeClient({ os: 'android', ...c }));
    expect(place({ ip: '200.1.2.3', country: 'BR', uf: 'SP', city: 'Campinas' })).toMatchObject({ IP: '200.1.2.3', Local: 'Campinas · SP · Brasil' });
    expect(place({ ip: '200.1.2.3', country: 'PT', region: 'Lisbon' }).Local).toBe('Lisbon · Portugal');
    expect(place({ ip: '200.1.2.3' }).Local).toBe('Aguardando localização');
  });
});

describe('linha do tempo de acessos', () => {
  const rows = [
    { bucket_at: '2026-10-26T14:04:00', site_visits: 0, app_accesses: 0, app_users: 0 },
    { bucket_at: '2026-10-26T14:05:00', site_visits: 2, app_accesses: 3, app_users: 2 },
    { bucket_at: '2026-10-26T14:06:00', site_visits: 1, app_accesses: 0, app_users: 0 },
  ];

  it('rotula por minuto, hora e dia sem deslocar o fuso', () => {
    expect(bucketLabel(rows[1].bucket_at, 'minuto')).toBe('14:05');
    expect(bucketLabel(rows[1].bucket_at, 'hora')).toBe('14h');
    expect(bucketLabel(rows[1].bucket_at, 'dia')).toBe('26/10');
    expect(bucketFullLabel(rows[1].bucket_at, 'minuto')).toBe('26/10/2026 14:05');
    expect(bucketLabel(null, 'dia')).toBe('—');
  });

  it('soma, acha o pico e lista só intervalos com acesso (mais recente primeiro)', () => {
    const t = buildAccessTimeline(rows, 'minuto');
    expect(t).toMatchObject({ site: 3, app: 3 });
    expect(t.peak).toMatchObject({ label: '14:05', total: 5 });
    expect(t.active.map(s => s.label)).toEqual(['14:06', '14:05']);
    expect(buildAccessTimeline([], 'dia').peak).toBeNull();
  });

  it('quantos intervalos pedir', () => {
    expect(timelineBuckets('dia', 7)).toBe(7);
    expect(timelineBuckets('dia', 0)).toBe(90);
    expect(timelineBuckets('hora', 7)).toBe(48);
    expect(timelineBuckets('minuto', 30)).toBe(120);
  });
});

describe('buildEmailStats', () => {
  it('agrupa por tipo, separa descadastros e soma os de hoje', () => {
    const out = buildEmailStats([
      { kind: 'resumo', status: 'sent', total: '90', today: '30' },
      { kind: 'resumo', status: 'error', total: '10', today: '0' },
      { kind: 'boas-vindas', status: 'sent', total: 5, today: 2 },
      { kind: 'descadastro', status: 'unsubscribed', total: 4, today: 1 },
    ]);
    expect(out.kinds.map(k => [k.label, k.sent, k.error])).toEqual([['Resumo semanal', 90, 10], ['Boas-vindas', 5, 0]]);
    expect(out).toMatchObject({ sent: 95, error: 10, sentToday: 32, unsubscribed: 4, errorPct: 10 });
  });

  it('sem registros: zeros e sem porcentagem', () => {
    expect(buildEmailStats([])).toMatchObject({ kinds: [], sent: 0, errorPct: null });
  });
});

describe('buildSessionStats', () => {
  it('resume sessões, mediana, telas, aparelhos e preenche todas as faixas', () => {
    const out = buildSessionStats([
      { dimension: 'total', value: 'sessions', n: '30' },
      { dimension: 'total', value: 'users', n: '10' },
      { dimension: 'total', value: 'multi_device_users', n: '2' },
      { dimension: 'median_s', value: '', n: '95' },
      { dimension: 'avg_screens', value: '', n: '27' },
      { dimension: 'duration', value: '1-5min', n: '12' },
      { dimension: 'duration', value: '<10s', n: '3' },
      { dimension: 'per_user', value: '2-3', n: '10' },
    ]);
    expect(out).toMatchObject({ sessions: 30, users: 10, perUser: 3, medianSeconds: 95, avgScreens: 2.7, multiDeviceUsers: 2, multiDevicePct: 20 });
    expect(out.durations.map(d => d.value)).toEqual(['<10s', '10-60s', '1-5min', '5-15min', '15min+']);
    expect(out.durations.find(d => d.value === '1-5min')).toMatchObject({ total: 12, pct: 80 });
    expect(out.perUserBands.find(b => b.value === '8+').total).toBe(0);
  });

  it('sem sessões: sem médias', () => {
    expect(buildSessionStats([])).toMatchObject({ sessions: 0, perUser: null, medianSeconds: null, avgScreens: null });
  });

  it('formatSeconds', () => {
    expect([formatSeconds(8), formatSeconds(60), formatSeconds(95)]).toEqual(['8s', '1min', '1min 35s']);
  });
});
