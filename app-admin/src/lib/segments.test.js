import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('./supabase', () => ({ db: { rpc: mockRpc } }));

import { cleanFilters, hasFilters, describeFilters, countSegment, resolveSegment } from './segments';

beforeEach(() => vi.clearAllMocks());

describe('cleanFilters', () => {
  it('descarta filtros vazios e apara a busca', () => {
    expect(cleanFilters({ search: '  ana ', status: '', nivel: 'iniciante', meta: '' }))
      .toEqual({ search: 'ana', nivel: 'iniciante' });
  });

  it('aceita nada', () => {
    expect(cleanFilters()).toEqual({});
    expect(cleanFilters({ search: '   ' })).toEqual({});
  });
});

describe('hasFilters', () => {
  it('só é verdadeiro com algum critério real', () => {
    expect(hasFilters({ status: 'inactive' })).toBe(true);
    expect(hasFilters({ status: '', search: '' })).toBe(false);
  });
});

describe('describeFilters', () => {
  it('descreve os critérios', () => {
    expect(describeFilters({ status: 'inactive', nivel: 'iniciante' })).toBe('Inativos (14+ dias sem treinar) · nível iniciante');
  });

  it('sem critérios é a base inteira', () => {
    expect(describeFilters({})).toBe('todos os usuários');
  });
});

describe('countSegment / resolveSegment', () => {
  it('countSegment pede 1 linha e usa o total', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'u1', total_count: 42 }], error: null });
    expect(await countSegment({ filters: { status: 'inactive' } })).toBe(42);
    expect(mockRpc).toHaveBeenCalledWith('admin_list_users_page', expect.objectContaining({ status_filter: 'inactive', page_size: 1 }));
  });

  it('resolveSegment devolve os ids da base filtrada', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'u1' }, { id: 'u2' }], error: null });
    expect(await resolveSegment({ filters: { nivel: 'avancado' } })).toEqual(['u1', 'u2']);
    expect(mockRpc).toHaveBeenCalledWith('admin_list_users_page', expect.objectContaining({ nivel_filter: 'avancado', page_size: 10000 }));
  });
});
