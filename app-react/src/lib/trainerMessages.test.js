import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { groupSent, unreadCount, recipientsLabel, friendlyMessageError } from './trainerMessages';

describe('groupSent', () => {
  it('agrupa o mesmo envio e ordena do mais recente ao mais antigo', () => {
    const rows = [
      { at: '2026-10-01T10:00:00Z', body: 'Oi turma', kind: 'recado', name: 'Ana', read: '2026-10-01T11:00:00Z' },
      { at: '2026-10-01T10:00:00Z', body: 'Oi turma', kind: 'recado', name: 'Bia', read: null },
      { at: '2026-10-02T09:00:00Z', body: 'Treino novo', kind: 'treino', name: 'Ana', read: null },
    ];
    const g = groupSent(rows);
    expect(g).toHaveLength(2);
    expect(g[0].body).toBe('Treino novo');
    expect(g[1].recipients).toEqual([{ name: 'Ana', read: true }, { name: 'Bia', read: false }]);
  });

  it('mesmo texto em instantes diferentes não se mistura', () => {
    const g = groupSent([
      { at: 'a', body: 'x', name: 'Ana' },
      { at: 'b', body: 'x', name: 'Ana' },
    ]);
    expect(g).toHaveLength(2);
  });
});

describe('textos auxiliares', () => {
  it('conta não lidas', () => {
    expect(unreadCount([{ read: null }, { read: 'x' }, { read: null }])).toBe(2);
    expect(unreadCount([])).toBe(0);
  });
  it('descreve os destinatários', () => {
    expect(recipientsLabel([{ name: 'Ana' }])).toBe('Para Ana');
    expect(recipientsLabel([{ name: 'Ana' }, { name: 'Bia' }])).toBe('Para Ana e Bia');
    expect(recipientsLabel([{}, {}, {}])).toBe('Para 3 alunos');
  });
  it('traduz erros', () => {
    expect(friendlyMessageError({ message: 'no_recipients' })).toMatch(/Nenhum aluno/);
    expect(friendlyMessageError({ message: 'zzz' })).toMatch(/Tente de novo/);
  });
});
