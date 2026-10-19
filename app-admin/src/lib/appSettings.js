import { db } from './supabase';

// Recursos que o app de fato lê (isFlagOn em app-react). Chave sem valor =
// ligado. Só entra aqui o que existe no app: uma chave sem leitor no código
// não faria nada.
export const KNOWN_FLAGS = [
  { key: 'fotos_progresso', label: 'Fotos de progresso', hint: 'Card no Dashboard do app.' },
  { key: 'convite_amigos', label: 'Convidar amigos', hint: 'Atalho no Perfil do app.' },
  { key: 'feedback', label: 'Enviar feedback', hint: 'Formulário de sugestão/problema/elogio no Perfil do app.' },
  { key: 'avaliar_app', label: 'Pedir avaliação do app', hint: 'Modal "Está gostando do EAFIT?" ao fechar o resumo do treino. A nota cai na fila de Feedback.' },
  { key: 'desafios', label: 'Desafios', hint: 'Card de desafios em Dashboard → Treinos.' },
  { key: 'amigos', label: 'Amigos e feed', hint: 'Aba Amigos do Dashboard (lista de amigos, ranking semanal e feed).' },
  { key: 'checkin_diario', label: 'Check-in diário', hint: 'Pergunta de energia, sono e humor na tela de Treino e o resumo em Dashboard → Corpo.' },
  { key: 'medidas_corporais', label: 'Medidas corporais', hint: 'Registro de cintura, quadril, peito, braço e coxa em Dashboard → Corpo.' },
];

export const BANNER_LEVELS = [
  { value: 'info', label: 'Informação' },
  { value: 'success', label: 'Novidade' },
  { value: 'warning', label: 'Atenção' },
];

export const DEFAULT_SETTINGS = {
  maintenance: { enabled: false, message: '' },
  banner: { enabled: false, message: '', level: 'info', linkUrl: '', linkLabel: '', startsOn: '', endsOn: '', version: 0 },
  flags: {},
  moved: { enabled: false, url: '' },
  season: { enabled: false, periods: [] },
};

// Temas de temporada que o app e o site sabem desenhar (SEASONS em
// app-react/src/lib/season.js e em public/landing/assets/site.js), na ordem
// do calendário.
export const SEASON_THEMES = [
  { value: 'carnaval', label: '🎭 Carnaval' },
  { value: 'pascoa', label: '🐰 Páscoa' },
  { value: 'namorados', label: '💕 Dia dos Namorados' },
  { value: 'festa_junina', label: '🌽 Festa Junina' },
  { value: 'outubro_rosa', label: '💗 Outubro Rosa' },
  { value: 'halloween', label: '🎃 Dia das Bruxas' },
  { value: 'novembro_azul', label: '💙 Novembro Azul' },
  { value: 'natal', label: '🎄 Natal' },
  { value: 'ano_novo', label: '🎆 Ano Novo' },
];

export const seasonThemeLabel = theme => SEASON_THEMES.find(s => s.value === theme)?.label || theme;

const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Situação do aviso hoje, pelo período (datas YYYY-MM-DD no fuso do app;
// vazio = sem limite). 'agendado' | 'no_ar' | 'encerrado'.
export function bannerWindow(banner, today) {
  if (banner.startsOn && today < banner.startsOn) return 'agendado';
  if (banner.endsOn && today > banner.endsOn) return 'encerrado';
  return 'no_ar';
}

// Mesma leitura de normalizeConfig em app-react/src/lib/appConfig.js (os dois
// apps não compartilham build, então é duplicada). Aqui o banner mantém o
// texto mesmo desligado, pra o admin editar sem perder o rascunho.
export function normalizeSettings(rows) {
  const map = Object.fromEntries((rows || []).map(r => [r.key, r.value && typeof r.value === 'object' ? r.value : {}]));
  const m = map.maintenance || {};
  const b = map.banner || {};
  const mv = map.moved || {};
  const flags = {};
  for (const [k, v] of Object.entries(map.flags || {})) {
    if (typeof v === 'boolean') flags[k] = v;
  }
  return {
    maintenance: { enabled: m.enabled === true, message: String(m.message || '') },
    banner: {
      enabled: b.enabled === true,
      message: String(b.message || ''),
      level: BANNER_LEVELS.some(l => l.value === b.level) ? b.level : 'info',
      linkUrl: String(b.linkUrl || ''),
      linkLabel: String(b.linkLabel || ''),
      startsOn: isDay(b.startsOn) ? b.startsOn : '',
      endsOn: isDay(b.endsOn) ? b.endsOn : '',
      version: Number.isFinite(Number(b.version)) ? Number(b.version) : 0,
    },
    flags,
    moved: { enabled: mv.enabled === true, url: String(mv.url || '') },
    season: normalizeSeason(map.season),
  };
}

// season: { enabled, periods: [{ theme, startsOn, endsOn }] }. Mesma leitura
// de normalizeSeason em app-react/src/lib/season.js, inclusive do formato
// antigo de um tema só ({ enabled, theme, startsOn, endsOn }).
function normalizeSeason(v = {}) {
  const list = Array.isArray(v.periods) ? v.periods : (v.theme ? [v] : []);
  const periods = list
    .filter(p => p && SEASON_THEMES.some(s => s.value === p.theme))
    .map(p => ({ theme: p.theme, startsOn: isDay(p.startsOn) ? p.startsOn : '', endsOn: isDay(p.endsOn) ? p.endsOn : '' }));
  return { enabled: v.enabled === true, periods };
}

// O app só liga o tema com as duas datas, e a final não pode vir antes.
export function isValidSeasonWindow(period) {
  return isDay(period.startsOn) && isDay(period.endsOn) && period.startsOn <= period.endsOn;
}

export function sortPeriods(periods) {
  return [...periods].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

// O que impede salvar a agenda ligada, ou ''. Períodos não podem se sobrepor:
// o app mostraria só o primeiro.
export function seasonScheduleError(season) {
  if (!season.enabled) return '';
  if (!season.periods.length) return 'Adicione pelo menos um período.';
  if (!season.periods.every(isValidSeasonWindow)) return 'Informe as duas datas de cada período, com o fim igual ou depois do começo.';
  const sorted = sortPeriods(season.periods);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startsOn <= sorted[i - 1].endsOn) {
      return `${seasonThemeLabel(sorted[i - 1].theme)} e ${seasonThemeLabel(sorted[i].theme)} se sobrepõem: um tem que terminar antes do outro começar.`;
    }
  }
  return '';
}

// Domingo de Páscoa (algoritmo gregoriano anônimo), em YYYY-MM-DD. Mesma conta
// de app-react/src/lib/easter.js (os dois apps não compartilham build).
export function easterDay(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftDay(day, n) {
  const dt = new Date(`${day}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// Agenda sugerida de um ano, cobrindo as janelas das conquistas de cada tema
// (SEASON_CHALLENGES em app-react/src/lib/season.js): Carnaval de sexta à
// Quarta de Cinzas, Páscoa da segunda da Semana Santa ao domingo seguinte e o
// Ano Novo de 27/12 a 07/01.
export function defaultSeasonPeriods(year) {
  const e = easterDay(year);
  return [
    { theme: 'carnaval', startsOn: shiftDay(e, -51), endsOn: shiftDay(e, -46) },
    { theme: 'pascoa', startsOn: shiftDay(e, -6), endsOn: shiftDay(e, 7) },
    { theme: 'namorados', startsOn: `${year}-06-05`, endsOn: `${year}-06-12` },
    { theme: 'festa_junina', startsOn: `${year}-06-13`, endsOn: `${year}-06-30` },
    { theme: 'outubro_rosa', startsOn: `${year}-10-01`, endsOn: `${year}-10-23` },
    { theme: 'halloween', startsOn: `${year}-10-24`, endsOn: `${year}-11-02` },
    { theme: 'novembro_azul', startsOn: `${year}-11-03`, endsOn: `${year}-11-30` },
    { theme: 'natal', startsOn: `${year}-12-01`, endsOn: `${year}-12-26` },
    { theme: 'ano_novo', startsOn: `${year}-12-27`, endsOn: `${year + 1}-01-07` },
  ];
}

// Soma a agenda sugerida do ano à atual: entra só o que ainda não terminou e
// não bate com nenhum período já agendado (que fica como o admin deixou).
export function withDefaultPeriods(periods, year, today) {
  const overlaps = (a, b) => isValidSeasonWindow(b) && a.startsOn <= b.endsOn && b.startsOn <= a.endsOn;
  const added = defaultSeasonPeriods(year).filter(p => p.endsOn >= today && !periods.some(q => overlaps(p, q)));
  return { periods: sortPeriods([...periods, ...added]), added: added.length };
}

// Situação da agenda hoje: 'desligado', 'no_ar' (com o tema), 'agendado'
// (nada no ar, mas há período por vir) ou 'encerrado'.
export function seasonStatus(season, today) {
  if (!season.enabled) return { key: 'desligado' };
  const valid = season.periods.filter(isValidSeasonWindow);
  const live = valid.find(p => today >= p.startsOn && today <= p.endsOn);
  if (live) return { key: 'no_ar', theme: live.theme };
  return { key: valid.some(p => p.startsOn > today) ? 'agendado' : 'encerrado' };
}

// O app só aceita endereço novo absoluto em https (ver movedTarget em app-react).
export function isValidMovedUrl(url) {
  return /^https:\/\/\S+$/i.test(String(url || '').trim());
}

// O app só abre link http(s) ou caminho relativo; avisa o admin antes de salvar.
export function isValidLink(url) {
  const u = String(url || '').trim();
  return u === '' || /^(https?:\/\/|\/)/i.test(u);
}

// Banner novo/editado muda de "versão": quem já fechou o aviso anterior volta a vê-lo.
export function nextBannerVersion(current, next) {
  // Mudar só o período não reabre o aviso para quem já fechou.
  const same = ['enabled', 'message', 'level', 'linkUrl', 'linkLabel'].every(k => current[k] === next[k]);
  return same ? current.version : current.version + 1;
}

export async function fetchSettings() {
  const { data, error } = await db.from('app_settings').select('key, value');
  if (error) throw error;
  return normalizeSettings(data);
}

// Grava a chave e registra no log de auditoria (quem mudou o quê).
export async function saveSetting(key, value, adminId) {
  const { error } = await db.from('app_settings').upsert({
    key, value, updated_at: new Date().toISOString(), updated_by: adminId,
  });
  if (error) throw error;
  const { error: auditError } = await db.from('admin_audit_log').insert({
    admin_id: adminId, target_user_id: null, action: 'updateAppSettings', details: { key, value },
  });
  if (auditError) console.error('audit log:', auditError.message);
}
