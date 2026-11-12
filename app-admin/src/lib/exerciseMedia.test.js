import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { validateMediaFile, storagePathFor, mediaKindFor, buildRows, normalizeName, defaultDemoFor, MAX_BYTES } from './exerciseMedia';

const file = (type, size = 1000) => ({ type, size });

describe('validateMediaFile', () => {
  it('aceita só vídeo curto', () => {
    ['video/mp4', 'video/webm'].forEach(t => expect(validateMediaFile(file(t))).toBeNull());
  });

  it('recusa GIF e imagem', () => {
    ['image/gif', 'image/webp', 'image/png', 'image/jpeg']
      .forEach(t => expect(validateMediaFile(file(t))).toMatch(/Formato não aceito/));
  });

  it('recusa formato desconhecido, arquivo grande demais ou ausente', () => {
    expect(validateMediaFile(file('video/quicktime'))).toMatch(/Formato não aceito/);
    expect(validateMediaFile(file('video/mp4', MAX_BYTES + 1))).toMatch(/limite é 15MB/);
    expect(validateMediaFile(null)).toMatch(/Nenhum arquivo/);
  });
});

describe('storagePathFor', () => {
  it('gera nome sem acento/espaço, com sufixo de tempo e a extensão do tipo', () => {
    expect(storagePathFor('🔷 Elevação Pélvica (Máquina)', file('video/mp4'), 123)).toBe('elevacao-pelvica-maquina-123.mp4');
    expect(storagePathFor('Leg Press 45°', file('video/webm'), 9)).toBe('leg-press-45-9.webm');
    expect(storagePathFor('!!!', file('video/mp4'), 1)).toBe('exercicio-1.mp4');
  });
});

describe('mediaKindFor / normalizeName', () => {
  it('classifica vídeo e recusa o resto', () => {
    expect(mediaKindFor(file('video/webm'))).toBe('video');
    expect(mediaKindFor(file('image/gif'))).toBeNull();
    expect(mediaKindFor(file('text/plain'))).toBeNull();
  });

  it('tira o emoji de prefixo como o app', () => {
    expect(normalizeName('🏃 Cardio — Escada')).toBe('Cardio — Escada');
  });
});

describe('defaultDemoFor', () => {
  it('diz o que o app mostra sem mídia própria', () => {
    expect(defaultDemoFor('Afundo Estático')).toBe('video');
    expect(defaultDemoFor('🔷 Burpee')).toBe('video');
    expect(defaultDemoFor('Crucifixo Reto com Halteres')).toBe('youtube');
    expect(defaultDemoFor('Esteira — Caminhada Inclinada')).toBe('youtube');
    expect(defaultDemoFor('Exercício que não existe')).toBeNull();
  });
});

describe('buildRows', () => {
  it('junta biblioteca e mídias, incluindo nomes fora da biblioteca, em ordem alfabética', () => {
    const rows = buildRows(
      [{ nome: 'Supino Reto com Barra', grupo_muscular: 'peito' }, { nome: 'Crucifixo Reto com Halteres', grupo_muscular: 'peito' }],
      [{ nome: 'Supino Reto com Barra', storage_path: 's.mp4' }, { nome: 'Afundo Búlgaro (foco glúteo)', storage_path: 'a.gif' }],
    );
    expect(rows.map(r => [r.nome, r.grupo, r.media?.storage_path ?? null, r.padrao])).toEqual([
      ['Afundo Búlgaro (foco glúteo)', null, 'a.gif', 'video'],
      ['Crucifixo Reto com Halteres', 'peito', null, 'youtube'],
      ['Supino Reto com Barra', 'peito', 's.mp4', 'youtube'],
    ]);
  });
});
