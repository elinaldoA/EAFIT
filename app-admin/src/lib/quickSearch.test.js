// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { normalize, pageIndex, searchPages, readRecent, pushRecent } from './quickSearch';

beforeEach(() => localStorage.clear());

const tos = list => list.map(p => p.to);

describe('normalize', () => {
  it('tira acento e caixa', () => {
    expect(normalize('  Comissões ')).toBe('comissoes');
  });
});

describe('searchPages', () => {
  const pages = pageIndex([]);

  it('acha pelo nome sem acento', () => {
    expect(tos(searchPages('comissoes', pages))[0]).toBe('/comissoes');
    expect(tos(searchPages('saude', pages))[0]).toBe('/saude');
  });

  it('prefere o começo do nome', () => {
    expect(tos(searchPages('us', pages))[0]).toBe('/users');
  });

  it('acha por sinônimo', () => {
    expect(tos(searchPages('nps', pages))).toContain('/pesquisas');
    expect(tos(searchPages('push', pages))).toContain('/notificacoes');
    expect(tos(searchPages('lesao', pages))).toEqual(['/seguranca']);
  });

  it('exige que todos os termos casem', () => {
    expect(tos(searchPages('verificacao cref', pages))).toEqual(['/verificacao-cref']);
    expect(searchPages('cref xyzzy', pages)).toEqual([]);
  });

  it('vazio não retorna nada', () => {
    expect(searchPages('   ', pages)).toEqual([]);
  });

  it('não mostra telas ocultas para o admin', () => {
    expect(tos(searchPages('custos', pageIndex(['/custos'])))).toEqual([]);
  });
});

describe('recentes', () => {
  it('guarda as últimas 5, sem repetir e sem o Dashboard', () => {
    ['/a', '/b', '/a', '/', '/c', '/d', '/e', '/f'].forEach(pushRecent);
    expect(readRecent()).toEqual(['/f', '/e', '/d', '/c', '/a']);
  });

  it('storage corrompido vira lista vazia', () => {
    localStorage.setItem('quickSearchRecent', '{oops');
    expect(readRecent()).toEqual([]);
  });
});
