import { describe, it, expect } from 'vitest';
import {
  buildRunProgram, effectiveGoal, goalWeeks, programFromMetadata, programToday, mondayOf,
  maintenanceWeek, describeSession, isRunSession,
} from './program';

describe('buildRunProgram', () => {
  it('5K tem 8 semanas de 7 dias e termina no dia da prova', () => {
    const p = buildRunProgram({ goal: '5k', nivel: 'intermediario' });
    expect(p.weeks).toHaveLength(8);
    p.weeks.forEach(w => expect(w.days).toHaveLength(7));
    expect(p.weeks[7].days[5]).toMatchObject({ type: 'prova', km: 5 });
  });

  it('iniciante começa no corre/caminha e passa a correr direto depois da tabela', () => {
    const p = buildRunProgram({ goal: '10k', nivel: 'iniciante' });
    expect(p.weeks[0].days[0]).toMatchObject({ type: 'corre_caminha', run: 1, walk: 2 });
    expect(p.weeks[7].days[0].type).toBe('leve');
  });

  it('o longão cresce até o pico e alivia na semana antes da prova', () => {
    const p = buildRunProgram({ goal: 'meia', nivel: 'avancado' });
    const longs = p.weeks.slice(0, -1).map(w => w.days[5].minutes);
    const build = longs.slice(0, -1);
    expect(build).toEqual([...build].sort((a, b) => a - b));
    expect(longs.at(-1)).toBeLessThan(Math.max(...build));
    expect(p.weeks.at(-1).days[5]).toMatchObject({ type: 'prova', km: 21.1 });
  });

  it('iniciante não faz meia: cai no 10K; objetivo desconhecido vira corrida livre', () => {
    expect(effectiveGoal('meia', 'iniciante')).toBe('10k');
    expect(effectiveGoal('ultra', 'avancado')).toBe('livre');
    expect(goalWeeks('livre')).toBe(0);
    expect(buildRunProgram({ goal: 'livre' }).weeks).toEqual([]);
  });
});

describe('programa na conta e semana de hoje', () => {
  it('lê o programa salvo e normaliza o início para a segunda-feira', () => {
    expect(programFromMetadata({})).toBeNull();
    expect(programFromMetadata({ runGoal: '5k', runNivel: 'x', runStart: '2026-11-05' }))
      .toEqual({ goal: '5k', nivel: 'intermediario', start: '2026-11-02', raceDate: null });
  });

  it('acha a semana e o dia de hoje', () => {
    const program = { goal: '5k', nivel: 'intermediario', start: '2026-11-02' };
    const today = programToday(program, '2026-11-12'); // quinta da 2ª semana
    expect(today).toMatchObject({ week: 2, weeks: 8, dayIndex: 3, maintenance: false });
    expect(today.days).toHaveLength(7);
  });

  it('depois do fim vira manutenção, marcada como concluída', () => {
    const t = programToday({ goal: '5k', nivel: 'iniciante', start: '2026-01-05' }, '2026-11-05');
    expect(t).toMatchObject({ week: 0, finished: true, maintenance: true });
    expect(t.days).toEqual(maintenanceWeek('iniciante'));
  });

  it('corrida livre fica sempre na manutenção, sem "concluído"', () => {
    expect(programToday({ goal: 'livre', nivel: 'avancado', start: '2026-11-02' }, '2026-11-05'))
      .toMatchObject({ week: 0, finished: false, maintenance: true });
  });

  it('mondayOf volta para a segunda (domingo é o fim da semana)', () => {
    expect(mondayOf('2026-11-08')).toBe('2026-11-02');
    expect(mondayOf('2026-11-02')).toBe('2026-11-02');
  });
});

describe('textos das sessões', () => {
  it('descreve cada tipo e separa corrida de descanso', () => {
    expect(describeSession({ type: 'leve', minutes: 30 })).toBe('30 min · ritmo de conversa');
    expect(describeSession({ type: 'prova', km: 21.1 })).toContain('21,1 km');
    expect(isRunSession({ type: 'descanso' })).toBe(false);
    expect(isRunSession({ type: 'cross' })).toBe(false);
    expect(isRunSession({ type: 'longao' })).toBe(true);
  });
});

describe('dias de corrida (espelho de run_day_planned no banco)', () => {
  // supabase/migrations/20270206010000_eafit_run_today_push.sql: se estes dias
  // mudarem aqui, a função SQL e o lembrete de "hoje é dia de correr" mudam junto.
  const mask = days => days.map(d => (isRunSession(d) ? '1' : '0')).join('');
  const EXPECTED = { iniciante: '1010010', intermediario: '1010110', avancado: '1101110' };

  it('todas as semanas de cada nível têm os mesmos dias de corrida', () => {
    for (const goal of ['5k', '10k', 'meia']) {
      for (const nivel of Object.keys(EXPECTED)) {
        const { weeks } = buildRunProgram({ goal, nivel });
        for (const w of weeks) expect(mask(w.days)).toBe(EXPECTED[nivel]);
      }
    }
  });

  it('a semana de manutenção corre seg, qua e sáb em qualquer nível', () => {
    for (const nivel of Object.keys(EXPECTED)) expect(mask(maintenanceWeek(nivel))).toBe('1010010');
  });
});

describe('dia da prova no programa', () => {
  const base = { goal: '5k', nivel: 'intermediario', start: '2026-11-02' };
  const last = p => buildRunProgram(p).weeks.at(-1).days;
  it('sem prova marcada, o dia da prova fica no sábado', () => {
    expect(last(base)[5].type).toBe('prova');
  });
  it('prova no domingo da última semana: o dia da prova vai para o domingo', () => {
    const days = last({ ...base, raceDate: '2026-12-27' });
    expect(days[6].type).toBe('prova');
    expect(days[5].type).not.toBe('prova');
  });
  it('prova fora da última semana não muda nada', () => {
    expect(last({ ...base, raceDate: '2027-02-06' })[5].type).toBe('prova');
  });
  it('lê a data da prova da conta', () => {
    const p = programFromMetadata({ runGoal: '5k', runStart: '2026-11-02', runRace: { date: '2026-12-27', km: 5 } });
    expect(p.raceDate).toBe('2026-12-27');
  });
});
