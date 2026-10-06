import { db } from './supabase';

// Jobs que o sistema precisa ter agendados (nomes definidos nas migrations de
// cron). Faltar um deles é problema, mesmo que nenhum job apareça com erro.
export const EXPECTED_JOBS = [
  { name: 'send-reminders-every-minute', label: 'Lembretes (água, sequência, resumo)' },
  { name: 'send-scheduled-broadcasts-every-minute', label: 'Notificações agendadas' },
  { name: 'send-engagement-hourly', label: 'Notificações automáticas de engajamento' },
];

// Atraso máximo aceitável desde a última execução, deduzido do cron.
// Só cobre os formatos que usamos; outros não são avaliados quanto a atraso.
export function maxAgeMinutes(schedule) {
  const s = String(schedule || '').trim();
  if (s === '* * * * *') return 10;
  if (/^\d+ \* \* \* \*$/.test(s)) return 180;
  return null;
}

// Estado de cada job esperado: 'ok' | 'warn' | 'bad', com o motivo.
export function evaluateJobs(jobs, now = new Date()) {
  const byName = new Map((jobs || []).map(j => [j.jobname, j]));
  return EXPECTED_JOBS.map(expected => {
    const job = byName.get(expected.name);
    if (!job) return { ...expected, job: null, state: 'bad', reason: 'não está agendado' };
    if (!job.active) return { ...expected, job, state: 'warn', reason: 'pausado' };
    if (job.last_status === 'failed' || Number(job.failures_24h) > 0) {
      return { ...expected, job, state: 'bad', reason: `${job.failures_24h} falha(s) nas últimas 24h` };
    }
    if (!job.last_run_at) return { ...expected, job, state: 'warn', reason: 'ainda não executou' };
    const limit = maxAgeMinutes(job.schedule);
    const ageMin = (now.getTime() - new Date(job.last_run_at).getTime()) / 60000;
    if (limit !== null && ageMin > limit) {
      return { ...expected, job, state: 'bad', reason: `parado há ${Math.round(ageMin)} min` };
    }
    return { ...expected, job, state: 'ok', reason: 'executando normalmente' };
  });
}

// Resume as respostas HTTP das Edge Functions: o que não é 2xx merece atenção.
export function summarizeHttp(rows) {
  const total = (rows || []).reduce((a, r) => a + Number(r.total), 0);
  const ok = (rows || []).filter(r => r.status_group === '2xx').reduce((a, r) => a + Number(r.total), 0);
  const failed = total - ok;
  return { total, ok, failed, state: total === 0 ? 'warn' : failed > 0 ? 'bad' : 'ok' };
}

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  const n = Number(bytes);
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}

// Cada bloco é independente: falha de um (ex.: extensão indisponível) não
// derruba os outros. Devolve { data } ou { error } por chave.
export async function fetchHealth() {
  const calls = {
    cron: () => db.rpc('admin_cron_status'),
    http: () => db.rpc('admin_http_health'),
    push: () => db.rpc('admin_push_health'),
    notifications: () => db.rpc('admin_notification_activity'),
    usage: () => db.rpc('admin_db_usage'),
    overdue: () => db.from('scheduled_broadcasts').select('id', { count: 'exact', head: true })
      .is('sent_at', null).lt('scheduled_at', new Date(Date.now() - 10 * 60000).toISOString()),
  };
  const entries = await Promise.all(Object.entries(calls).map(async ([key, call]) => {
    try {
      const res = await call();
      if (res.error) return [key, { error: res.error.message }];
      return [key, { data: key === 'overdue' ? res.count || 0 : res.data || [] }];
    } catch (err) {
      return [key, { error: err.message }];
    }
  }));
  return Object.fromEntries(entries);
}
