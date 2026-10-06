import { describe, it, expect, vi } from 'vitest';
import { mergeHistory, filterHistory } from './broadcastHistory';

vi.mock('./supabase', () => ({ db: {} }));

const audit = [
  { id: 1, created_at: '2026-10-01T10:00:00Z', details: { title: 'Olá', body: 'Todos', targetCount: 5, sent: 4 } },
  { id: 2, created_at: '2026-10-03T10:00:00Z', details: { title: 'Agendada', body: 'x', targetCount: 2, sent: 2, scheduled: true } },
];
const auto = [
  { id: 9, user_id: 'u1', kind: 'comeback', title: 'Volta', body: 'y', created_at: '2026-10-02T10:00:00Z' },
];

describe('mergeHistory', () => {
  const items = mergeHistory(audit, auto, { u1: 'naldo@x.com' });

  it('ordena do mais recente para o mais antigo', () => {
    expect(items.map(i => i.id)).toEqual(['a-2', 'n-9', 'a-1']);
  });

  it('classifica a origem e traz o destinatário dos automáticos', () => {
    expect(items.map(i => i.origin)).toEqual(['scheduled', 'auto', 'manual']);
    expect(items[1].to).toBe('naldo@x.com');
    expect(items[2]).toMatchObject({ recipients: 5, delivered: 4 });
  });

  it('aceita listas vazias', () => {
    expect(mergeHistory(null, undefined)).toEqual([]);
  });
});

describe('filterHistory', () => {
  const items = mergeHistory(audit, auto);
  it('filtra por origem', () => {
    expect(filterHistory(items, 'auto')).toHaveLength(1);
    expect(filterHistory(items, 'manual')).toHaveLength(1);
    expect(filterHistory(items, 'all')).toHaveLength(3);
  });
});
