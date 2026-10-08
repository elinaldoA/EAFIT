import { db } from './supabase';

// Leitura e formatação das métricas de comportamento (Análises →
// Comportamento). RPCs em supabase/migrations/20261027010000_behavior_tracking.sql;
// quem grava é app-react/src/lib/tracking.js e o <script> da landing.

async function rpcRows(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data || [];
}

export const fetchVisitBreakdown = (days = 30) => rpcRows('admin_visit_breakdown', { days_back: days });
export const fetchAuthEvents = (days = 30) => rpcRows('admin_auth_events', { days_back: days });
export const fetchUserEvents = (days = 30) => rpcRows('admin_user_events', { days_back: days });
export const fetchClientBreakdown = (days = 30) => rpcRows('admin_client_breakdown', { days_back: days });
export const fetchInstallRetention = () => rpcRows('admin_install_retention');
export const fetchWorkoutDropoff = (days = 30, maxRows = 10) => rpcRows('admin_workout_dropoff', { days_back: days, max_rows: maxRows });

export async function fetchWorkoutCompletion(days = 30) {
  return (await rpcRows('admin_workout_completion', { days_back: days }))[0] || null;
}

export async function fetchUserClient(userId) {
  return (await rpcRows('admin_user_client', { target: userId }))[0] || null;
}

function pct(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export const OS_LABELS = { android: 'Android', ios: 'iOS (iPhone/iPad)', windows: 'Windows', mac: 'Mac', linux: 'Linux', outro: 'Outro', desconhecido: 'Não registrado' };
export const BROWSER_LABELS = { chrome: 'Chrome', safari: 'Safari', firefox: 'Firefox', edge: 'Edge', samsung: 'Samsung Internet', opera: 'Opera', outro: 'Outro', desconhecido: 'Não registrado' };
export const DEVICE_LABELS = { celular: 'Celular', tablet: 'Tablet', desktop: 'Desktop', desconhecido: 'Não registrado' };
export const LANG_LABELS = { pt: 'Português', en: 'Inglês', outro: 'Outro', desconhecido: 'Não registrado' };
export const MODE_LABELS = { standalone: 'App instalado', browser: 'Pelo navegador' };
export const PUSH_LABELS = { granted: 'Permitiu', denied: 'Bloqueou', default: 'Ainda não respondeu', unsupported: 'Aparelho sem suporte' };

// Linhas (dimension, value, <countKey>) de uma dimensão → barras ordenadas
// pelo total, com rótulo legível e % do total da dimensão.
export function groupDimension(rows, dimension, labels = {}, countKey = 'visits') {
  const items = (rows || [])
    .filter(r => r.dimension === dimension)
    .map(r => ({ value: r.value, label: labels[r.value] || r.value || '—', total: Number(r[countKey]) || 0 }));
  const sum = items.reduce((t, i) => t + i.total, 0);
  return items
    .map(i => ({ ...i, pct: pct(i.total, sum) }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

// 24 colunas (00h–23h, Brasília), com zero onde não houve visita.
export function hourSeries(rows) {
  const byHour = new Map((rows || []).filter(r => r.dimension === 'hour').map(r => [Number(r.value), Number(r.visits) || 0]));
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${String(h).padStart(2, '0')}h`, total: byHour.get(h) || 0 }));
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function weekdaySeries(rows) {
  const byDay = new Map((rows || []).filter(r => r.dimension === 'weekday').map(r => [Number(r.value), Number(r.visits) || 0]));
  return WEEKDAYS.map((label, d) => ({ day: d, label, total: byDay.get(d) || 0 }));
}

// Maior valor de uma série, pra destacar o pico ("melhor horário").
export function peakOf(series) {
  const top = (series || []).reduce((best, s) => (s.total > (best?.total ?? 0) ? s : best), null);
  return top && top.total > 0 ? top : null;
}

const SIGNUP_STEPS = [
  { key: 'signup_start', label: 'Começaram a preencher' },
  { key: 'signup_submit', label: 'Tentaram enviar' },
  { key: 'signup_ok', label: 'Criaram a conta' },
];

// Motivo gravado pelo app (lib/tracking.js) ou o code do Supabase Auth.
const AUTH_ERROR_LABELS = {
  termos: 'Não aceitou os Termos de Uso',
  sem_email: 'Enviou sem e-mail',
  sem_senha: 'Enviou sem senha',
  senha_curta: 'Senha com menos de 6 caracteres',
  weak_password: 'Senha fraca (recusada pelo servidor)',
  user_already_exists: 'E-mail já tem conta',
  email_exists: 'E-mail já tem conta',
  email_address_invalid: 'E-mail inválido',
  validation_failed: 'E-mail ou senha em formato inválido',
  over_email_send_rate_limit: 'Limite de e-mails atingido',
  over_request_rate_limit: 'Muitas tentativas seguidas',
  signup_disabled: 'Cadastros desativados',
  invalid_credentials: 'E-mail ou senha errados',
  email_not_confirmed: 'E-mail ainda não confirmado',
  user_banned: 'Conta suspensa',
  conta_admin: 'Conta de administrador',
  outro: 'Outro erro (rede, servidor)',
};

export function authErrorLabel(detail) {
  return AUTH_ERROR_LABELS[detail] || detail || 'Outro erro';
}

// Linhas (event, detail, total) → etapas do cadastro (% da 1ª etapa e da
// anterior), erros de cadastro e erros de login, do mais comum pro mais raro.
export function buildSignup(rows) {
  const total = event => (rows || []).filter(r => r.event === event).reduce((t, r) => t + (Number(r.total) || 0), 0);
  const counts = SIGNUP_STEPS.map(s => total(s.key));
  const steps = SIGNUP_STEPS.map((s, i) => ({
    ...s, count: counts[i], pctOfStart: pct(counts[i], counts[0]), pctOfPrev: i === 0 ? null : pct(counts[i], counts[i - 1]),
  }));
  const errorsOf = event => (rows || [])
    .filter(r => r.event === event)
    .map(r => ({ detail: r.detail, label: authErrorLabel(r.detail), total: Number(r.total) || 0 }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  return { steps, signupErrors: errorsOf('signup_error'), loginErrors: errorsOf('login_error') };
}

const ONBOARDING_STEPS = [
  { key: 'view', label: 'Abriram o formulário' },
  { key: 'sexo', label: 'Informaram o sexo' },
  { key: 'idade', label: 'Informaram a idade' },
  { key: 'peso', label: 'Informaram o peso' },
  { key: 'altura', label: 'Informaram a altura' },
  { key: 'submit', label: 'Clicaram em "Gerar meu treino"' },
  { key: 'done', label: 'Plano gerado' },
];
const ONBOARDING_ERRORS = {
  erro_idade: 'Sexo ou idade inválidos',
  erro_peso: 'Peso inválido',
  erro_altura: 'Altura inválida',
  erro_plano: 'Falha ao gerar o plano',
};

export const PAGE_LABELS = { treino: 'Treino', historico: 'Histórico', hidratacao: 'Hidratação', dash: 'Evolução', perfil: 'Perfil', personal: 'Modo Personal' };
export const FEATURE_LABELS = {
  live_mode: 'Modo treino ao vivo',
  voice_coach: 'Treinador por voz',
  rest_timer: 'Timer de descanso',
  exercise_demo: 'Demonstração de exercício',
  plan_editor: 'Editor de treino',
  water: 'Registro de água',
  checkin: 'Check-in diário',
  measurements: 'Medidas corporais',
  photos: 'Fotos de progresso',
  discomfort: 'Registro de desconforto',
  challenges: 'Desafios',
  friends: 'Amigos e feed',
  share_card: 'Compartilhar card de treino',
  invite: 'Convidar amigo',
  export: 'Exportar dados',
  feedback: 'Enviar feedback',
};

// Linhas (event, detail, users, days) → o que a página de Comportamento
// mostra sobre usuários logados. `pct` é sempre sobre os usuários com
// qualquer evento no período (linha '__active__').
export function buildUserEvents(rows) {
  const list = rows || [];
  const active = Number(list.find(r => r.event === '__active__')?.users) || 0;
  const of = (event, labels) => list
    .filter(r => r.event === event)
    .map(r => ({ key: r.detail, label: labels[r.detail] || r.detail, users: Number(r.users) || 0, days: Number(r.days) || 0 }))
    .map(i => ({ ...i, pct: pct(i.users, active) }))
    .sort((a, b) => b.users - a.users || a.label.localeCompare(b.label));

  const usersOf = (event, detail) => Number(list.find(r => r.event === event && r.detail === detail)?.users) || 0;
  const onbCounts = ONBOARDING_STEPS.map(s => usersOf('onboarding', s.key));
  const onboarding = ONBOARDING_STEPS.map((s, i) => ({ ...s, count: onbCounts[i], pctOfStart: pct(onbCounts[i], onbCounts[0]) }));
  const onboardingErrors = Object.entries(ONBOARDING_ERRORS)
    .map(([key, label]) => ({ key, label, users: usersOf('onboarding', key) }))
    .filter(e => e.users > 0)
    .sort((a, b) => b.users - a.users);

  // Features conhecidas que ninguém usou também aparecem (com zero): saber o
  // que não é usado é metade do valor desta tela.
  const used = of('feature', FEATURE_LABELS);
  const unused = Object.entries(FEATURE_LABELS)
    .filter(([key]) => !used.some(u => u.key === key))
    .map(([key, label]) => ({ key, label, users: 0, days: 0, pct: active > 0 ? 0 : null }));

  return {
    active,
    pages: of('page', PAGE_LABELS),
    features: [...used, ...unused],
    onboarding,
    onboardingErrors,
    pushOpens: { users: usersOf('push', 'open'), pct: pct(usersOf('push', 'open'), active) },
  };
}

// App instalado × navegador: usuários em cada modo e % que treinou em 7 dias.
export function buildInstallRetention(rows) {
  return ['standalone', 'browser'].map(mode => {
    const row = (rows || []).find(r => r.display_mode === mode);
    const users = Number(row?.users) || 0;
    const trained = Number(row?.trained_7d) || 0;
    return { mode, label: MODE_LABELS[mode], users, trained, pct: pct(trained, users) };
  });
}

export function buildCompletion(row) {
  const started = Number(row?.started) || 0;
  const completed = Number(row?.completed) || 0;
  return {
    started,
    completed,
    abandoned: Math.max(0, started - completed),
    pct: pct(completed, started),
    avg: formatDuration(row?.avg_duration_seconds),
    median: formatDuration(row?.median_duration_seconds),
  };
}

export function formatDuration(seconds) {
  const s = Number(seconds);
  if (!s || s <= 0) return '—';
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

// Retrato do último acesso de um usuário → pares rótulo/valor pra ficha.
export function describeClient(c) {
  if (!c) return [];
  return [
    ['Sistema', OS_LABELS[c.os] || c.os],
    ['Navegador', BROWSER_LABELS[c.browser] || c.browser],
    ['Aparelho', DEVICE_LABELS[c.device] || c.device],
    ['Modo', MODE_LABELS[c.display_mode] || c.display_mode],
    ['Versão do app', c.app_version || '—'],
    ['Idioma', LANG_LABELS[c.lang] || c.lang],
    ['Notificações', PUSH_LABELS[c.push_permission] || c.push_permission],
    ['Último acesso', c.last_seen ? c.last_seen.split('-').reverse().join('/') : '—'],
  ];
}
