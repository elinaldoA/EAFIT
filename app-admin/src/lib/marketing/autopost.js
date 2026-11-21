// Publicação automática: pistas, temporadas e agenda. (parte de lib/marketing.js, que reexporta tudo).
import { db } from '../supabase';

// ---------- publicação automática ----------
// Fila de conteúdo pronto que o cron publica sozinho (migration
// 20261230010000_marketing_autopost.sql; horários ajustados em
// 20270106010000_marketing_horarios_pico.sql): horários por faixa em AUTOPOST_LANES (Brasília).

// Quantos já publicados vêm para a tela: a lista cresce todo dia e só os mais
// recentes aparecem (o total sai de uma contagem à parte). Para o intervalo
// mínimo entre temas bastam os últimos dias.
export const POSTED_SHOWN = 60;

export async function fetchAutopost() {
  const columns = 'id, position, key, format, caption, media, posted_at, skipped_at, post_id';
  // Sem as migrations dos horários de refeição (`slot`) ou da temporada
  // (`season`, 20270111010000) a coluna não existe: tenta com ela e cai para menos.
  const attempts = [`${columns}, slot, season, hide_when_module, requires_module`, `${columns}, slot, season`, `${columns}, slot`, columns];
  const base = cols => db.from('marketing_autopost_queue').select(cols);
  let open = null;
  let recent = null;
  for (const cols of attempts) {
    [open, recent] = await Promise.all([
      base(cols).is('posted_at', null).order('position'),
      base(cols).not('posted_at', 'is', null).order('posted_at', { ascending: false }).limit(POSTED_SHOWN),
    ]);
    if (!open.error && !recent.error) break;
  }
  // `focus_module` (foco total numa campanha) só existe com a migration 20270227050000.
  let settings = await db.from('marketing_autopost_settings').select('enabled, focus_module').eq('id', true).maybeSingle();
  if (settings.error) settings = await db.from('marketing_autopost_settings').select('enabled').eq('id', true).maybeSingle();
  const [count, seasonRow, modulesRow] = await Promise.all([
    db.from('marketing_autopost_queue').select('id', { count: 'exact', head: true }).not('posted_at', 'is', null),
    db.from('app_settings').select('value').eq('key', 'season').maybeSingle(),
    db.from('app_settings').select('value').eq('key', 'modules').maybeSingle(),
  ]);
  if (settings.error) throw settings.error;
  if (open.error) throw open.error;
  if (recent.error) throw recent.error;
  const pendingAndSkipped = open.data || [];
  const posted = recent.data || [];
  const items = [...pendingAndSkipped, ...posted];
  return {
    enabled: settings.data?.enabled !== false,
    items,
    pending: pendingAndSkipped.filter(i => !i.skipped_at),
    skipped: pendingAndSkipped.filter(i => i.skipped_at),
    posted: count.error ? posted.length : (count.count ?? posted.length),
    // Temporadas do app (app_settings "season"): decidem quando sai cada item de temporada.
    season: seasonRow?.error ? null : (seasonRow?.data?.value || null),
    // Regras de módulo de marketing_autopost_run: o que de fato pode sair agora.
    rules: {
      focus: settings.data?.focus_module || null,
      modulesOn: Array.isArray(modulesRow?.data?.value?.enabled) ? modulesRow.data.value.enabled : [],
    },
  };
}

// Itens que o autopost pode publicar agora, pelas mesmas regras de módulo de marketing_autopost_run:
//  - requires_module: só com o módulo ligado (app_settings "modules".enabled);
//  - hide_when_module ("Em breve"): some quando o módulo liga;
//  - focus_module: com o foco numa campanha, só saem os itens dela (requires/hide desse módulo);
//  - campanha de módulo ligado: enquanto houver item dela pendente no formato, só ele sai.
// A agenda do painel usa isto; sem `rules` (ou com banco antigo) nada é filtrado.
export function publishableNow(pending, rules) {
  if (!rules) return pending;
  const { focus = null, modulesOn = [] } = rules;
  const on = m => modulesOn.includes(m);
  const campaignFormats = new Set(pending.filter(i => i.requires_module && on(i.requires_module)).map(i => i.format));
  return pending.filter(i => (
    (!i.requires_module || on(i.requires_module))
    && (!focus || i.requires_module === focus || i.hide_when_module === focus)
    && (!i.hide_when_module || !on(i.hide_when_module))
    && (i.requires_module || !campaignFormats.has(i.format))
  ));
}

export async function setAutopostEnabled(enabled) {
  const { error } = await db.rpc('marketing_autopost_set_enabled', { p_enabled: enabled });
  if (error) throw error;
}

// Faixas da publicação automática: cada uma publica um item por dia no seu horário
// (cron em UTC; Brasília é UTC-3, sem horário de verão). Story pode ter um horário
// de refeição (`slot`): só café e hidratação têm conteúdo de nutrição. Os stories das
// 12h30 e das 19h30 são gerais, para o fluxo não ficar repetindo comida e água
// (migration 20270122010000_marketing_stories_diversos.sql).
// `utc`/`time` valem de segunda a sexta; `weekendUtc`/`weekendTime`, quando há, no
// sábado e no domingo (migration 20270113010000_marketing_horarios_rendimento.sql).
// Formatos espaçados para não competirem entre si: feed no pico do almoço, Reel no
// pico da noite, stories distribuídos pelo dia.
export const SLOT_LABEL = { bomdia: 'Bom dia', cafe: 'Café da manhã', conta: 'Criar conta', agua: 'Hidratação', treino: 'Hora do treino' };
// Faixas de nutrição (o resto das faixas com `slot` é de engajamento: bom dia, treino e criar conta).
export const NUTRI_SLOTS = ['cafe', 'agua'];
export const AUTOPOST_LANES = [
  // Volume reduzido (migration 20270201010000): pouco retorno com 9 stories + feed + Reel por dia.
  // `days` = dias da semana (0 = dom) em que a faixa sai; sem `days`, todo dia.
  { key: 'story:bomdia', format: 'story', slot: 'bomdia', utc: [10, 30], time: '7h30', weekendUtc: [11, 0], weekendTime: '8h', label: 'Story · Bom dia' },
  { key: 'story:conta', format: 'story', slot: 'conta', utc: [13, 0], time: '10h', label: 'Story · Criar conta' },
  { key: 'feed', format: 'feed', slot: null, utc: [14, 30], time: '11h30', days: [1, 3, 5], label: 'Feed' },
  { key: 'story:treino', format: 'story', slot: 'treino', utc: [19, 30], time: '16h30', label: 'Story · Hora do treino' },
  // Faixa geral: o cron publica um story às 12h30, da mesma fila.
  { key: 'story', format: 'story', slot: null, utc: [15, 30], time: '12h30', label: 'Story' },
  { key: 'reel', format: 'reel', slot: null, utc: [23, 45], time: '20h45', weekendUtc: [21, 30], weekendTime: '18h30', days: [2, 4, 6], label: 'Reel' },
  // Faixas desligadas (sem cron): itens que sobraram nelas ficam parados na fila.
  { key: 'story:cafe', format: 'story', slot: 'cafe', off: true, utc: [9, 30], time: '6h30', label: 'Story · Café da manhã (desligado)' },
  { key: 'story:agua', format: 'story', slot: 'agua', off: true, utc: [18, 0], time: '15h', label: 'Story · Hidratação (desligado)' },
];

const DAY_NAMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// Quando a faixa sai, para mostrar no painel: "todo dia às 15h" ou
// "seg a sex às 6h30, sáb e dom às 9h".
export function laneWhen(lane) {
  if (lane.off) return 'desligado';
  if (lane.days) {
    const names = lane.days.map(d => DAY_NAMES[d]);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0];
    return lane.weekendTime ? `${list} (sáb às ${lane.weekendTime}, demais às ${lane.time})` : `${list} às ${lane.time}`;
  }
  return lane.weekendTime ? `seg a sex às ${lane.time}, sáb e dom às ${lane.weekendTime}` : `todo dia às ${lane.time}`;
}

// Horário (UTC) da faixa num dia de Brasília (AAAA-MM-DD).
export function laneAt(lane, day) {
  const [y, m, d] = day.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const [h, min] = (dow === 0 || dow === 6) && lane.weekendUtc ? lane.weekendUtc : lane.utc;
  return new Date(Date.UTC(y, m - 1, d, h, min));
}
// Todas as saídas da faixa no dia: o horário principal e os extras (`extra`).
export function laneRuns(lane, day) {
  const [y, m, d] = day.split('-').map(Number);
  if (lane.off || (lane.days && !lane.days.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay()))) return [];
  return [laneAt(lane, day), ...(lane.extra || []).map(([h, min]) => new Date(Date.UTC(y, m - 1, d, h, min)))];
}
const BRT_OFFSET_MS = 3 * 3600 * 1000;

// Faixa de um item da fila: o formato, mais o horário de refeição quando é story de nutrição.
export function laneKey(item) {
  return item.format === 'story' && item.slot ? `story:${item.slot}` : item.format;
}

export function laneLabel(item) {
  const label = AUTOPOST_LANES.find(l => l.key === laneKey(item))?.label || item.format;
  return item.season ? `${label} · ${seasonTag(item.season)}` : label;
}

// Temporadas do app (app-react/src/lib/season.js). Um item da fila com `season`
// só sai enquanto esse tema estiver no ar no app e, nesse período, passa na
// frente dos itens comuns (migration 20270111010000, marketing_autopost_run).
export const SEASON_LABEL = {
  carnaval: 'Carnaval', pascoa: 'Páscoa', namorados: 'Namorados', festa_junina: 'Festa Junina', outubro_rosa: 'Outubro Rosa',
  halloween: 'Dia das Bruxas', novembro_azul: 'Novembro Azul', natal: 'Natal', ano_novo: 'Ano Novo',
};
const SEASON_EMOJI = {
  carnaval: '🎭', pascoa: '🐰', namorados: '💕', festa_junina: '🌽', outubro_rosa: '💗', halloween: '🎃', novembro_azul: '💙', natal: '🎄', ano_novo: '🎆',
};

export function seasonTag(theme) {
  return `${SEASON_EMOJI[theme] || ''} ${SEASON_LABEL[theme] || theme}`.trim();
}

const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Tema no ar num dia (AAAA-MM-DD) pela configuração de temporada do app
// ({ enabled, periods: [{ theme, startsOn, endsOn }] } ou o formato antigo de um
// tema só), igual a marketing_active_season no banco.
export function seasonOnDay(season, day) {
  if (!season || season.enabled !== true) return null;
  const list = Array.isArray(season.periods) ? season.periods : [season];
  return list.find(p => p?.theme && isDay(p.startsOn) && isDay(p.endsOn) && day >= p.startsOn && day <= p.endsOn)?.theme || null;
}

// Dia de Brasília (AAAA-MM-DD) de um instante.
export function brtDay(date) {
  return new Date(new Date(date).getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

// Até quantos dias à frente a agenda procura a temporada de um item.
const SEASON_HORIZON_DAYS = 400;

// Tema de um item da fila: "treino-feed" → "treino" (igual a marketing_autopost_theme).
export function autopostTheme(key) {
  return String(key || '').replace(/-(feed|reel|story)$/, '');
}

// Tema que saiu em qualquer formato há menos disso fica para depois.
export const THEME_GAP_DAYS = 3;
const THEME_GAP_MS = THEME_GAP_DAYS * 24 * 3600 * 1000;

// Agenda da fila: cada item pendente no seu horário. O cron publica um item de
// cada faixa por dia, na ordem da fila, com as regras de marketing_autopost_run:
// item cujo tema saiu (em qualquer formato) nos últimos THEME_GAP_DAYS dias vai
// para o fim da vez; item de temporada (`season`) só sai nos dias em que o tema
// está no ar no app (`season` = app_settings "season") e, nesses dias, passa na
// frente; fora deles espera. `posted` são os itens já publicados (key, posted_at).
// Item cuja temporada não cai nos próximos SEASON_HORIZON_DAYS dias fica fora.
export function autopostSchedule(pending, now = new Date(), season = null, posted = []) {
  const out = [];
  const last = new Map();
  const mark = (key, ms) => { if (key && !(last.get(autopostTheme(key)) >= ms)) last.set(autopostTheme(key), ms); };
  for (const p of posted) if (p.posted_at) mark(p.key, new Date(p.posted_at).getTime());
  const queues = new Map(AUTOPOST_LANES.map(l => [l.key, pending.filter(i => laneKey(i) === l.key)]));
  const today = brtDay(now);
  const [ty, tm, td] = today.split('-').map(Number);
  for (let d = 0; d <= SEASON_HORIZON_DAYS; d += 1) {
    const left = [...queues.values()].flat();
    if (left.length === 0 || (season?.enabled !== true && !left.some(i => !i.season))) break;
    const day = new Date(Date.UTC(ty, tm - 1, td + d)).toISOString().slice(0, 10);
    const runs = AUTOPOST_LANES.flatMap(lane => laneRuns(lane, day).map(at => ({ lane, at })))
      .filter(r => r.at > now && queues.get(r.lane.key).length > 0)
      .sort((a, b) => a.at - b.at);
    for (const { lane, at } of runs) {
      const queue = queues.get(lane.key);
      const theme = seasonOnDay(season, day);
      const recent = i => {
        const t = i.key ? last.get(autopostTheme(i.key)) : undefined;
        return t !== undefined && at.getTime() - t < THEME_GAP_MS;
      };
      // Mesma ordem do banco: tema fora dos últimos dias, depois temporada, depois posição.
      const rank = i => (recent(i) ? 2 : 0) + (i.season ? 0 : 1);
      let best = null;
      for (const i of queue) {
        if (i.season && i.season !== theme) continue;
        if (!best || rank(i) < rank(best)) best = i;
      }
      if (!best) continue;
      queue.splice(queue.indexOf(best), 1);
      mark(best.key, at.getTime());
      out.push({ item: best, format: lane.format, lane: lane.key, at, today: brtDay(at) === brtDay(now) });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// Próxima saída de cada faixa.
export function nextAutopostSlots(pending, now = new Date()) {
  const seen = new Set();
  return autopostSchedule(pending, now).filter(s => (seen.has(s.lane) ? false : seen.add(s.lane)));
}

// Separa as hashtags do fim da legenda do texto.
export function splitCaption(caption) {
  const text = String(caption || '');
  const tags = text.match(/#[\p{L}\p{N}_]+/gu) || [];
  const body = text.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { body, tags };
}
