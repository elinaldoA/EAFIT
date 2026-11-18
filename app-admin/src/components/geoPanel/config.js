// Painel de localização: modos, períodos, chaves de cache, carregadores e preferências.
import { fetchAppGeo, fetchGeoCompare, fetchUserGeo, fetchUserGeoCompare, fetchUserGeoRetention, fetchVisitGeo } from '../../lib/geo';

export const VIEWS = [
  { key: 'brasil', label: 'Brasil' },
  { key: 'mundo', label: 'Mundo' },
];

export const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
];

export const MODES = [
  { key: 'tudo', label: 'Tudo', unit: 'acessos', note: 'Visitas ao site e acessos ao app (1 por navegador ou conta por dia).' },
  { key: 'site', label: 'Site', unit: 'visitas', note: 'Visitas à página de apresentação (1 por navegador por dia).' },
  { key: 'app', label: 'App', unit: 'acessos', note: 'Tela de login de quem chega sem sessão e dias de uso de quem está logado (1 por navegador ou conta por dia).' },
  { key: 'contas', label: 'Contas', unit: 'contas', note: 'Contas que abriram o app no período, pelo último acesso. A seta compara com os dias anteriores pelos dias de uso (uma conta conta uma vez por lugar).' },
  { key: 'retencao', label: 'Retenção', unit: 'estados', note: 'Por estado, pelo último acesso de cada conta: contas, novas no período, ativas no período e retenção (das contas criadas antes do período, quantas voltaram a abrir o app nele).' },
  { key: 'conversao', label: 'Conversão', unit: 'estados', note: 'Por estado: visitas ao site (1 por navegador por dia) × contas que abriram o app no período. Não é taxa de cadastro: mede contas ativas a cada 100 visitas, e as duas contagens não são da mesma coorte.' },
];

export const CITIES_PREVIEW = 10;
export const CITIES_MAX = 200; // "Ver todas" não despeja milhares de linhas; a busca acha o resto
export const STATES_PREVIEW = 8;

// Busca sem diferenciar maiúsculas nem acentos ("sao paulo" acha "São Paulo").
export const fold = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Chaves do cache: Tudo, Site e App saem das mesmas consultas (visitas + app),
// então trocar entre eles não consulta de novo. `round` muda no "Atualizar".
// Período na chave do cache: "30" (termina hoje) ou "30@2026-10-31".
export const spanKey = (days, end) => (end ? `${days}@${end}` : String(days));
// Modos que olham o último acesso de cada conta: só valem para períodos até hoje.
export const TODAY_ONLY = ['contas', 'conversao', 'retencao'];
export const dataKey = (round, mode, days) => `${round}:${mode === 'contas' || mode === 'conversao' || mode === 'retencao' ? mode : 'acessos'}:${days}`;
export const compareKey = (round, days, kind = 'acessos') => `${round}:comparar:${kind}:${days}`;
// Retenção é só uma tabela por estado: não tem comparação nem gráficos.
export const kindOf = mode => (mode === 'retencao' ? null : mode === 'contas' || mode === 'conversao' ? mode : 'acessos');
export const isTableMode = mode => mode === 'conversao' || mode === 'retencao';
export const dailyKey = (round, days) => `${round}:diario:${days}`;
export const audienceKey = (round, days) => `${round}:origem:${days}`;
export const hoursKey = (round, days) => `${round}:horas:${days}`;

export async function loadAccess(days, end) {
  const [visits, app] = await Promise.all([fetchVisitGeo(days, end), fetchAppGeo(days, end)]);
  return { visits, app };
}

export async function loadConversion(days) {
  const [visits, users] = await Promise.all([fetchVisitGeo(days), fetchUserGeo(days)]);
  return { visits, users };
}

// Comparação com o período anterior de cada modo.
export const loadCompare = (mode, days, end) => {
  if (mode === 'contas') return fetchUserGeoCompare(days);
  if (mode === 'conversao') return Promise.all([fetchGeoCompare(days), fetchUserGeoCompare(days)]).then(([visits, users]) => ({ visits, users }));
  return fetchGeoCompare(days, end);
};

export const loadFor = (mode, days, end) => {
  if (mode === 'contas') return fetchUserGeo(days);
  if (mode === 'conversao') return loadConversion(days);
  if (mode === 'retencao') return fetchUserGeoRetention(days);
  return loadAccess(days, end);
};

// Lembra modo, período e visão entre visitas ao painel (só conveniência: se o
// armazenamento falhar ou vier algo estranho, volta ao padrão).
export const PREFS_KEY = 'admin.geo.prefs';
export function readPrefs() {
  const out = { days: 30, mode: 'tudo', view: 'brasil' };
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (Number.isInteger(p.days) && p.days >= 1 && p.days <= 366) out.days = p.days;
    if (MODES.some(m => m.key === p.mode)) out.mode = p.mode;
    if (VIEWS.some(v => v.key === p.view)) out.view = p.view;
  } catch { /* sem armazenamento: usa o padrão */ }
  return out;
}

export const fmtFull = day => day.split('-').reverse().join('/');
export const fmtDay = day => day.split('-').reverse().slice(0, 2).join('/');
