import { db } from './supabase';
import { fetchSettings, seasonThemeLabel } from './appSettings';
import { fetchChallenges, todayStr } from './community';

// Calendário editorial (Comunicação → Calendário): tudo o que tem data e
// aparece para os usuários — temas de temporada, aviso do app, envios
// agendados, desafios oficiais, pesquisas e experimentos — num mês só.

export const TYPES = {
  tema: { label: 'Tema de temporada', icon: '🎨', to: '/configuracoes' },
  aviso: { label: 'Aviso no app', icon: '📢', to: '/configuracoes' },
  envio: { label: 'Envio agendado', icon: '🔔', to: '/notificacoes' },
  desafio: { label: 'Desafio oficial', icon: '🏁', to: '/desafios' },
  pesquisa: { label: 'Pesquisa', icon: '🗳️', to: '/pesquisas' },
  experimento: { label: 'Experimento', icon: '🧪', to: '/experimentos' },
};

const dayOf = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
const FAR = '9999-12-31';

export function buildEvents({ settings, broadcasts, challenges, surveys, experiments }, today = todayStr()) {
  const out = [];
  if (settings?.season?.enabled) {
    for (const p of settings.season.periods || []) {
      if (p.startsOn && p.endsOn) out.push({ type: 'tema', title: seasonThemeLabel(p.theme), start: p.startsOn, end: p.endsOn });
    }
  }
  const b = settings?.banner;
  if (b?.enabled && b.message) {
    out.push({ type: 'aviso', title: b.message, start: b.startsOn || today, end: b.endsOn || FAR });
  }
  for (const s of broadcasts || []) {
    const d = dayOf(s.scheduled_at);
    out.push({ type: 'envio', title: s.title, start: d, end: d, time: new Date(s.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }), done: !!s.sent_at });
  }
  for (const c of challenges || []) {
    if (c.official) out.push({ type: 'desafio', title: c.title, start: c.start, end: c.end });
  }
  for (const s of surveys || []) {
    if (s.active) out.push({ type: 'pesquisa', title: s.question, start: s.starts_on || dayOf(s.created_at), end: s.ends_on || FAR });
  }
  for (const e of experiments || []) {
    if (e.status === 'rodando' || e.status === 'encerrado') {
      out.push({ type: 'experimento', title: e.name, start: dayOf(e.started_at), end: e.ended_at ? dayOf(e.ended_at) : FAR });
    }
  }
  return out.sort((a, b2) => a.start.localeCompare(b2.start) || a.type.localeCompare(b2.type));
}

const pad = n => String(n).padStart(2, '0');

// Semanas (domingo a sábado) do mês, com os eventos de cada dia.
export function monthGrid(year, month, events) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < first.getUTCDay(); i++) cells.push(null);
  for (let d = 1; d <= days; d++) {
    const date = `${year}-${pad(month)}-${pad(d)}`;
    cells.push({ date, day: d, events: events.filter(e => e.start <= date && e.end >= date) });
  }
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Eventos que tocam o mês (para a lista abaixo da grade).
export function eventsInMonth(year, month, events) {
  const start = `${year}-${pad(month)}-01`;
  const end = `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
  return events.filter(e => e.start <= end && e.end >= start);
}

// Dias com mais de um tema ou envio juntos (conflitos a revisar).
export function busyDays(weeks) {
  return weeks.flat().filter(c => c && (c.events.filter(e => e.type === 'tema').length > 1 || c.events.filter(e => e.type === 'envio').length > 1))
    .map(c => c.date);
}

export async function fetchCalendar() {
  const [settings, broadcasts, challenges, surveys, experiments] = await Promise.all([
    fetchSettings(),
    db.from('scheduled_broadcasts').select('id, title, scheduled_at, sent_at').order('scheduled_at', { ascending: true }).limit(500),
    fetchChallenges().catch(() => []),
    db.from('surveys').select('id, question, active, starts_on, ends_on, created_at'),
    db.from('experiments').select('key, name, status, started_at, ended_at'),
  ]);
  if (broadcasts.error) throw broadcasts.error;
  return {
    settings,
    broadcasts: broadcasts.data || [],
    challenges,
    // Pesquisas e experimentos são de migrations novas: sem a tabela, o calendário segue sem eles.
    surveys: surveys.error ? [] : surveys.data || [],
    experiments: experiments.error ? [] : experiments.data || [],
  };
}
