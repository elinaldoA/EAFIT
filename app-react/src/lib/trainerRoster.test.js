import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ rpc: vi.fn(), fetchClients: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: (...a) => h.rpc(...a) } }));
vi.mock('./trainer', async (importActual) => ({ ...(await importActual()), fetchClients: (...a) => h.fetchClients(...a) }));

import {
  initials, normalizeTags, planStatus, adherence, weeklyTarget, recentStrip, buildActionQueue, rosterKpis, allTags,
  sortRoster, filterRoster, weeklyCounts, fetchRoster, setClientTags, fetchClientPlans, friendlyRosterError,
} from './trainerRoster';

const TODAY = '2026-10-07';
const c = over => ({
  id: 'x', name: 'X', email: 'x@x.com', since: '2026-09-01', last_day: TODAY, days7: 0, days30: 0, paused: false,
  weeklyGoal: null, planName: null, planDays: null, planEnd: null, pain7: 0, tags: [], recent: [], ...over,
});

beforeEach(() => { h.rpc.mockReset(); h.fetchClients.mockReset(); });

describe('trainerRoster', () => {
  it('iniciais do nome', () => {
    expect(initials('Ana Paula Souza')).toBe('AS');
    expect(initials('bruno')).toBe('B');
    expect(initials('')).toBe('?');
  });

  it('etiquetas: corta, tira vazias e repetidas (sem diferenciar maiúsculas) e limita a 6', () => {
    expect(normalizeTags([' Online ', 'online', '', 'VIP'])).toEqual(['Online', 'VIP']);
    expect(normalizeTags(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toHaveLength(6);
    expect(normalizeTags(['x'.repeat(30)])[0]).toHaveLength(20);
  });

  it('situação do plano: sem plano, sem prazo, vencido, vencendo e em dia', () => {
    expect(planStatus(c({}), TODAY).level).toBe('none');
    expect(planStatus(c({ planName: 'A' }), TODAY).level).toBe('ok');
    expect(planStatus(c({ planName: 'A', planEnd: '2026-10-05' }), TODAY)).toEqual(expect.objectContaining({ level: 'expired', daysLeft: -2 }));
    expect(planStatus(c({ planName: 'A', planEnd: TODAY }), TODAY).label).toBe('Vence hoje');
    expect(planStatus(c({ planName: 'A', planEnd: '2026-10-14' }), TODAY).level).toBe('ending');
    expect(planStatus(c({ planName: 'A', planEnd: '2026-10-15' }), TODAY).level).toBe('ok');
  });

  it('aderência usa a meta do aluno ou, sem ela, os dias do plano, até 100%', () => {
    expect(weeklyTarget(c({ weeklyGoal: 4, planDays: 3 }))).toBe(4);
    expect(adherence(c({ planDays: 3, days7: 2 }))).toBe(67);
    expect(adherence(c({ weeklyGoal: 2, days7: 5 }))).toBe(100);
    expect(adherence(c({}))).toBeNull();
  });

  it('faixa dos últimos 14 dias termina hoje', () => {
    const strip = recentStrip(c({ recent: ['2026-09-24', TODAY] }), TODAY);
    expect(strip).toHaveLength(14);
    expect(strip[0]).toEqual({ date: '2026-09-24', trained: true });
    expect(strip[13]).toEqual({ date: TODAY, trained: true });
    expect(strip.filter(d => d.trained)).toHaveLength(2);
  });

  it('fila de ação: um item por aluno, motivos juntos e o mais urgente primeiro', () => {
    const roster = [
      c({ id: 'ok', name: 'Ok', planName: 'A' }),
      c({ id: 'dor', name: 'Dor', planName: 'A', pain7: 1 }),
      c({ id: 'sumido', name: 'Sumido', last_day: '2026-09-20', planName: 'A', planEnd: '2026-10-01' }),
      c({ id: 'parado', name: 'Parado', last_day: '2026-10-02', planName: 'A', planEnd: '2026-10-10' }),
      c({ id: 'novo', name: 'Novo', last_day: null, planName: 'A' }),
      c({ id: 'recem', name: 'Recém', last_day: null, since: '2026-10-06', planName: 'A' }),
      c({ id: 'pausa', name: 'Pausa', paused: true, last_day: '2026-09-01' }),
    ];
    const q = buildActionQueue(roster, { replies: { ok: 1 }, today: TODAY });
    expect(q.map(x => x.client.id)).toEqual(['dor', 'sumido', 'ok', 'parado', 'novo']);
    expect(q.find(x => x.client.id === 'sumido').reasons.map(r => r.kind)).toEqual(['sumido', 'plano']);
    expect(q.find(x => x.client.id === 'parado').reasons.map(r => r.kind)).toEqual(['parado', 'plano']);
    expect(q.find(x => x.client.id === 'ok').reasons[0].label).toBe('1 resposta(s) sem ler');
  });

  it('números do painel ignoram quem está em pausa na aderência e nos planos', () => {
    const k = rosterKpis([
      c({ days7: 2, planName: 'A', planDays: 2, planEnd: '2026-10-08' }),
      c({ days7: 0, planDays: 4, planName: 'B' }),
      c({ paused: true, planDays: 3, planName: 'C', planEnd: '2026-01-01' }),
    ], TODAY);
    expect(k).toEqual({ total: 3, active7: 1, sessions7: 2, adherenceAvg: 50, plansDue: 1 });
  });

  it('etiquetas da carteira sem repetir, em ordem alfabética', () => {
    expect(allTags([c({ tags: ['VIP', 'Online'] }), c({ tags: ['online', 'Anual'] })])).toEqual(['Anual', 'Online', 'VIP']);
  });

  it('ordena por nome, último treino e menor aderência', () => {
    const r = [
      c({ id: 'a', name: 'Bia', last_day: '2026-10-01', weeklyGoal: 2, days7: 2 }),
      c({ id: 'b', name: 'Ana', last_day: '2026-10-06', weeklyGoal: 4, days7: 1 }),
      c({ id: 'c', name: 'Caio', last_day: null }),
    ];
    expect(sortRoster(r, 'nome', TODAY).map(x => x.id)).toEqual(['b', 'a', 'c']);
    expect(sortRoster(r, 'recente', TODAY).map(x => x.id)).toEqual(['b', 'a', 'c']);
    expect(sortRoster(r, 'aderencia', TODAY).map(x => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('filtra por situação, busca sem acento e etiqueta', () => {
    const r = [
      c({ id: 'a', name: 'João', tags: ['Online'], planName: 'A' }),
      c({ id: 'b', name: 'Bia', last_day: '2026-09-01', planName: 'A', planEnd: '2026-10-09' }),
      c({ id: 'd', name: 'Duda', pain7: 1, planName: 'A' }),
    ];
    expect(filterRoster(r, { query: 'joao' }, TODAY).map(x => x.id)).toEqual(['a']);
    expect(filterRoster(r, { tag: 'online' }, TODAY).map(x => x.id)).toEqual(['a']);
    expect(filterRoster(r, { filter: 'atencao' }, TODAY).map(x => x.id)).toEqual(['b', 'd']);
    expect(filterRoster(r, { filter: 'plano' }, TODAY).map(x => x.id)).toEqual(['b']);
  });

  it('treinos por semana nas últimas 8 semanas', () => {
    const w = weeklyCounts(['2026-10-07', '2026-10-01', '2026-09-30', '2026-08-01'], TODAY, 8);
    expect(w).toHaveLength(8);
    expect(w[7]).toEqual({ end: TODAY, count: 2 });
    expect(w[6]).toEqual({ end: '2026-09-30', count: 1 });
    expect(w.reduce((n, x) => n + x.count, 0)).toBe(3);
  });

  it('fetchRoster converte as colunas da RPC', async () => {
    h.rpc.mockResolvedValue({ data: [{ rs_id: 'c1', rs_name: 'Ana', rs_days_7: 2, rs_plan_name: 'A', rs_plan_end: '2026-10-10', rs_pain_7: 1, rs_tags: ['VIP'], rs_recent: [TODAY], rs_weekly_goal: 3 }], error: null });
    const [r] = await fetchRoster();
    expect(h.rpc).toHaveBeenCalledWith('trainer_roster');
    expect(r).toEqual(expect.objectContaining({ id: 'c1', days7: 2, planName: 'A', planEnd: '2026-10-10', pain7: 1, tags: ['VIP'], recent: [TODAY], weeklyGoal: 3 }));
  });

  it('fetchRoster sem a migration cai na lista antiga marcada como legacy', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    h.fetchClients.mockResolvedValue([{ id: 'c1', name: 'Ana', days7: 1 }]);
    const [r] = await fetchRoster();
    expect(r).toEqual(expect.objectContaining({ id: 'c1', legacy: true, tags: [], planName: null }));
  });

  it('outros erros sobem', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not_authorized' } });
    await expect(fetchRoster()).rejects.toBeTruthy();
    expect(friendlyRosterError({ message: 'invalid_tags' })).toMatch(/Até 6 etiquetas/);
  });

  it('salvar etiquetas manda a lista limpa', async () => {
    h.rpc.mockResolvedValue({ data: ['VIP'], error: null });
    expect(await setClientTags('c1', [' VIP', 'vip'])).toEqual(['VIP']);
    expect(h.rpc).toHaveBeenCalledWith('trainer_set_client_tags', { p_client: 'c1', p_tags: ['VIP'] });
  });

  it('histórico de planos', async () => {
    h.rpc.mockResolvedValue({ data: [{ pl_id: 'p1', pl_name: 'A', pl_active: true, pl_by_me: true, pl_days: 3, pl_start: '2026-10-01' }], error: null });
    expect(await fetchClientPlans('c1')).toEqual([expect.objectContaining({ id: 'p1', active: true, byMe: true, days: 3, start: '2026-10-01' })]);
    expect(h.rpc).toHaveBeenCalledWith('trainer_client_plans', { p_client: 'c1' });
  });
});
