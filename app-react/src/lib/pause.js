// Modo pausa: quem está viajando/doente pausa o app sem perder a sequência.
//
// Guardado em user_metadata:
//   pausedUntil : 'YYYY-MM-DD' (inclusive) enquanto a pausa está ativa, senão ausente.
//                 É o que o servidor lê (notificações e painel).
//   pauses      : [{ from, to }] histórico das pausas (as últimas 12). Os dias dentro
//                 delas não quebram a sequência (ver calcStreak em utils.js).
// Só aritmética de string/UTC: nada depende do fuso do navegador.

export const PAUSE_OPTIONS = [7, 14, 30];
const MAX_PAUSE_DAYS = 60;
const MAX_HISTORY = 12;

function dayNumber(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function validPauses(pauses) {
  return (Array.isArray(pauses) ? pauses : [])
    .filter(p => p && isDate(p.from) && isDate(p.to) && p.to >= p.from)
    .map(p => ({ from: p.from, to: p.to }));
}

// Todos os dias cobertos pelas pausas (limitado a MAX_PAUSE_DAYS por pausa, pra
// um valor torto no metadata não gerar um intervalo gigante).
export function pausedDaySet(pauses) {
  const days = new Set();
  for (const p of validPauses(pauses)) {
    const span = Math.min(dayNumber(p.to) - dayNumber(p.from) + 1, MAX_PAUSE_DAYS);
    for (let i = 0; i < span; i++) days.add(addDays(p.from, i));
  }
  return days;
}

// Pausa ativa hoje: { from, to } ou null.
export function activePause(meta, today) {
  const until = meta?.pausedUntil;
  if (!isDate(until) || until < today) return null;
  const last = validPauses(meta?.pauses).slice(-1)[0];
  const from = last && last.to === until ? last.from : today;
  return { from, to: until };
}

// Campos de metadata pra iniciar (ou prolongar) a pausa por `days` dias,
// contando hoje. Quem já está pausado mantém o início e só estende o fim.
export function startPauseFields(meta, today, days) {
  const length = Math.min(Math.max(Math.floor(days), 1), MAX_PAUSE_DAYS);
  const current = activePause(meta, today);
  const from = current ? current.from : today;
  const to = addDays(today, length - 1);
  const finalTo = current && current.to > to ? current.to : to;
  const history = validPauses(meta?.pauses).filter(p => !(p.from === from));
  return {
    pausedUntil: finalTo,
    pauses: [...history, { from, to: finalTo }].slice(-MAX_HISTORY),
  };
}

// Campos pra retomar agora: a pausa termina ontem (hoje já conta como dia
// normal); se ela começou hoje, some do histórico.
export function endPauseFields(meta, today) {
  const current = activePause(meta, today);
  if (!current) return { pausedUntil: null, pauses: validPauses(meta?.pauses) };
  const yesterday = addDays(today, -1);
  const rest = validPauses(meta?.pauses).filter(p => p.from !== current.from);
  const pauses = current.from <= yesterday ? [...rest, { from: current.from, to: yesterday }] : rest;
  return { pausedUntil: null, pauses: pauses.slice(-MAX_HISTORY) };
}

export function formatDayBR(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}
