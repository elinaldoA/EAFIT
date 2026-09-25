import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { validateMediaFile, storagePathFor, mediaKindFor, buildRows, normalizeName, MAX_BYTES } from './exerciseMedia';

const file = (type, size = 1000) => ({ type, size });

describe('validateMediaFile', () => {
  it('aceita GIF, imagens e vídeo curto', () => {
    ['image/gif', 'image/webp', 'image/png', 'image/jpeg', 'video/mp4', 'video/webm']
      .forEach(t => expect(validateMediaFile(file(t))).toBeNull());
  });

  it('recusa formato desconhecido, arquivo grande demais ou ausente', () => {
    expect(validateMediaFile(file('video/quicktime'))).toMatch(/Formato não aceito/);
    expect(validateMediaFile(file('image/gif', MAX_BYTES + 1))).toMatch(/limite é 15MB/);
    expect(validateMediaFile(null)).toMatch(/Nenhum arquivo/);
  });
});

describe('storagePathFor', () => {
  it('gera nome sem acento/espaço, com sufixo de tempo e a extensão do tipo', () => {
    expect(storagePathFor('🔷 Elevação Pélvica (Máquina)', file('video/mp4'), 123)).toBe('elevacao-pelvica-maquina-123.mp4');
    expect(storagePathFor('Leg Press 45°', file('image/jpeg'), 9)).toBe('leg-press-45-9.jpg');
    expect(storagePathFor('!!!', file('image/gif'), 1)).toBe('exercicio-1.gif');
  });
});

describe('mediaKindFor / normalizeName', () => {
  it('classifica vídeo e imagem', () => {
    expect(mediaKindFor(file('video/webm'))).toBe('video');
    expect(mediaKindFor(file('image/gif'))).toBe('imagem');
    expect(mediaKindFor(file('text/plain'))).toBeNull();
  });

  it('tira o emoji de prefixo como o app', () => {
    expect(normalizeName('🏃 Cardio — Escada')).toBe('Cardio — Escada');
  });
});

describe('buildRows', () => {
  it('junta biblioteca e mídias, incluindo nomes fora da biblioteca, em ordem alfabética', () => {
    const rows = buildRows(
      [{ nome: 'Supino Reto com Barra', grupo_muscular: 'peito' }, { nome: 'Agachamento Livre', grupo_muscular: 'quadriceps' }],
      [{ nome: 'Supino Reto com Barra', storage_path: 's.mp4' }, { nome: 'Afundo Búlgaro (foco glúteo)', storage_path: 'a.gif' }],
    );
    expect(rows.map(r => [r.nome, r.grupo, r.media?.storage_path ?? null])).toEqual([
      ['Afundo Búlgaro (foco glúteo)', null, 'a.gif'],
      ['Agachamento Livre', 'quadriceps', null],
      ['Supino Reto com Barra', 'peito', 's.mp4'],
    ]);
  });
});
