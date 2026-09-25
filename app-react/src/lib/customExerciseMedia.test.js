import { describe, it, expect, vi } from 'vitest';

// Mesmo motivo do mock em records.test.js: lib/supabase.js cria o client no import.
vi.mock('./supabase', () => ({ db: {} }));

import { toCustomMediaMap } from './customExerciseMedia';

describe('toCustomMediaMap', () => {
  const url = path => `https://cdn/exercise-media/${path}`;

  it('indexa pelo nome normalizado e monta a URL pública', () => {
    expect(toCustomMediaMap([
      { nome: '🔷 Prancha Frontal Estática', storage_path: 'prancha-1.gif', media_type: 'imagem' },
      { nome: 'Supino Reto com Barra', storage_path: 'supino-2.mp4', media_type: 'video' },
    ], url)).toEqual({
      'Prancha Frontal Estática': { url: 'https://cdn/exercise-media/prancha-1.gif', type: 'imagem' },
      'Supino Reto com Barra': { url: 'https://cdn/exercise-media/supino-2.mp4', type: 'video' },
    });
  });

  it('ignora linhas incompletas e trata tipo desconhecido como imagem', () => {
    expect(toCustomMediaMap([
      { nome: '', storage_path: 'a.gif', media_type: 'imagem' },
      { nome: 'Remada', storage_path: null, media_type: 'video' },
      { nome: 'Rosca', storage_path: 'r.webp', media_type: 'outro' },
    ], url)).toEqual({ Rosca: { url: 'https://cdn/exercise-media/r.webp', type: 'imagem' } });
    expect(toCustomMediaMap(null, url)).toEqual({});
  });
});
