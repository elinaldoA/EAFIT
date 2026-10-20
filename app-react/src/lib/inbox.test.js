import { describe, it, expect, vi } from 'vitest';
import { timeAgo, inboxTarget, fetchInbox, fetchInfluencerMessages } from './inbox';

const q = vi.hoisted(() => {
  const query = { calls: [] };
  for (const m of ['select', 'is', 'neq', 'eq', 'order', 'limit']) {
    query[m] = (...args) => { query.calls.push([m, ...args]); return m === 'limit' ? Promise.resolve({ data: [], error: null }) : query; };
  }
  return query;
});
vi.mock('./supabase', () => ({ db: { from: () => q } }));

describe('fetchInbox', () => {
  it('o sino busca só os não lidos; a exportação busca todos', async () => {
    q.calls = [];
    await fetchInbox(30);
    expect(q.calls).toContainEqual(['is', 'read_at', null]);
    expect(q.calls).toContainEqual(['neq', 'kind', 'influenciador']);
    q.calls = [];
    await fetchInbox(1000, { unreadOnly: false });
    expect(q.calls.some(c => c[0] === 'is' || c[0] === 'neq')).toBe(false);
  });

  it('recados do influenciador: só o kind dele, lidos e não lidos', async () => {
    q.calls = [];
    await fetchInfluencerMessages();
    expect(q.calls).toContainEqual(['eq', 'kind', 'influenciador']);
    expect(q.calls.some(c => c[0] === 'is')).toBe(false);
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-10-10T12:00:00Z').getTime();
  const ago = ms => new Date(now - ms).toISOString();

  it('formata por faixa', () => {
    expect(timeAgo(ago(10_000), now)).toBe('agora');
    expect(timeAgo(ago(5 * 60_000), now)).toBe('há 5 min');
    expect(timeAgo(ago(3 * 3600_000), now)).toBe('há 3 h');
    expect(timeAgo(ago(30 * 3600_000), now)).toBe('ontem');
    expect(timeAgo(ago(3 * 86400_000), now)).toBe('há 3 dias');
  });

  it('não quebra com horário no futuro', () => {
    expect(timeAgo(new Date(now + 60_000).toISOString(), now)).toBe('agora');
  });
});

describe('inboxTarget', () => {
  it('lembretes de treino levam à tela de treino', () => {
    for (const kind of ['workout_today', 'plan_expiring', 'comeback', 'no_plan']) {
      expect(inboxTarget({ kind, title: 'x' })).toMatchObject({ tab: 'treino' });
    }
  });

  it('convite de amigos leva à aba Amigos e resposta de feedback ao Perfil', () => {
    expect(inboxTarget({ kind: 'invite_friends', title: 'x' })).toMatchObject({ tab: 'dash', dashTab: 'amigos' });
    expect(inboxTarget({ kind: 'aviso', title: '💬 Resposta ao seu feedback' })).toMatchObject({ tab: 'perfil', profileCard: 'feedback' });
  });

  it('comunicado comum ou tipo desconhecido não leva a lugar nenhum', () => {
    expect(inboxTarget({ kind: 'aviso', title: 'Novidade no app' })).toBeNull();
    expect(inboxTarget({ kind: 'outro', title: 'x' })).toBeNull();
    expect(inboxTarget(null)).toBeNull();
  });
});
