import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { evaluateJobs, maxAgeMinutes, summarizeHttp, formatBytes, EXPECTED_JOBS } from './health';

const now = new Date('2026-10-10T12:00:00Z');
const minutesAgo = (m) => new Date(now.getTime() - m * 60000).toISOString();

function jobsAllOk() {
  return [
    { jobname: 'send-reminders-every-minute', schedule: '* * * * *', active: true, last_run_at: minutesAgo(1), last_status: 'succeeded', failures_24h: 0 },
    { jobname: 'send-scheduled-broadcasts-every-minute', schedule: '* * * * *', active: true, last_run_at: minutesAgo(1), last_status: 'succeeded', failures_24h: 0 },
    { jobname: 'send-engagement-hourly', schedule: '0 * * * *', active: true, last_run_at: minutesAgo(30), last_status: 'succeeded', failures_24h: 0 },
  ];
}

describe('maxAgeMinutes', () => {
  it('deduz o atraso aceitável do cron', () => {
    expect(maxAgeMinutes('* * * * *')).toBe(10);
    expect(maxAgeMinutes('0 * * * *')).toBe(180);
    expect(maxAgeMinutes('*/5 * * * *')).toBeNull();
  });
});

describe('evaluateJobs', () => {
  it('marca tudo ok quando os jobs rodam em dia', () => {
    expect(evaluateJobs(jobsAllOk(), now).map(j => j.state)).toEqual(['ok', 'ok', 'ok']);
  });

  it('job esperado ausente é problema', () => {
    const result = evaluateJobs(jobsAllOk().slice(0, 2), now);
    expect(result[2]).toMatchObject({ name: 'send-engagement-hourly', state: 'bad', reason: 'não está agendado' });
  });

  it('falha recente é problema', () => {
    const jobs = jobsAllOk();
    jobs[0].failures_24h = 3;
    expect(evaluateJobs(jobs, now)[0]).toMatchObject({ state: 'bad' });
  });

  it('job parado além do limite é problema', () => {
    const jobs = jobsAllOk();
    jobs[1].last_run_at = minutesAgo(45);
    expect(evaluateJobs(jobs, now)[1]).toMatchObject({ state: 'bad', reason: 'parado há 45 min' });
  });

  it('job pausado ou que nunca rodou é só aviso', () => {
    const jobs = jobsAllOk();
    jobs[0].active = false;
    jobs[2].last_run_at = null;
    const result = evaluateJobs(jobs, now);
    expect(result[0].state).toBe('warn');
    expect(result[2].state).toBe('warn');
  });

  it('cobre todos os jobs esperados', () => {
    expect(evaluateJobs([], now)).toHaveLength(EXPECTED_JOBS.length);
  });
});

describe('summarizeHttp', () => {
  it('ok quando tudo é 2xx', () => {
    expect(summarizeHttp([{ status_group: '2xx', total: '10' }])).toEqual({ total: 10, ok: 10, failed: 0, state: 'ok' });
  });

  it('bad quando há 401/5xx', () => {
    const r = summarizeHttp([{ status_group: '2xx', total: 8 }, { status_group: '401', total: 2 }]);
    expect(r).toMatchObject({ failed: 2, state: 'bad' });
  });

  it('warn sem nenhuma resposta registrada', () => {
    expect(summarizeHttp([]).state).toBe('warn');
  });
});

describe('formatBytes', () => {
  it('formata tamanhos', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(null)).toBe('—');
  });
});
