import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EXERCISE_MEDIA, getExerciseMedia, normalizeExerciseName } from './exerciseMedia';
import { EXERCISE_VIDEOS } from './exerciseVideos';
import { EXERCISE_YOUTUBE, youtubeEmbedUrl } from './exerciseYoutube';

const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));

describe('normalizeExerciseName', () => {
  it('tira o emoji de prefixo dos exercícios de pós-treino', () => {
    expect(normalizeExerciseName('🔷 Abdominal Polia (Corda)')).toBe('Abdominal Polia (Corda)');
    expect(normalizeExerciseName('🏃 Cardio — Escada')).toBe('Cardio — Escada');
    expect(normalizeExerciseName('Supino Reto com Barra')).toBe('Supino Reto com Barra');
  });
});

describe('getExerciseMedia', () => {
  it('os 2 quadros de reserva saem do base do app', () => {
    expect(getExerciseMedia('Esteira — Caminhada Inclinada', '/EAFIT/').fallback).toEqual({
      id: 'Walking_Treadmill',
      frames: [
        '/EAFIT/exercicios/Walking_Treadmill/0.webp',
        '/EAFIT/exercicios/Walking_Treadmill/1.webp',
      ],
    });
  });

  it('YouTube vem depois do vídeo próprio, com crédito do canal e os quadros de reserva', () => {
    expect(getExerciseMedia('Remada Curvada com Barra (pegada supinada)', '/EAFIT/')).toEqual({
      type: 'youtube',
      youtube: EXERCISE_YOUTUBE['Remada Curvada com Barra (pegada supinada)'],
      credit: `Vídeo: ${EXERCISE_YOUTUBE['Remada Curvada com Barra (pegada supinada)'].canal} · YouTube`,
      fallback: {
        id: 'Reverse_Grip_Bent-Over_Rows',
        frames: [
          '/EAFIT/exercicios/Reverse_Grip_Bent-Over_Rows/0.webp',
          '/EAFIT/exercicios/Reverse_Grip_Bent-Over_Rows/1.webp',
        ],
      },
    });
  });

  it('vídeo curto tem prioridade sobre os quadros', () => {
    expect(getExerciseMedia('🔷 Supino Reto com Barra', '/EAFIT/')).toEqual({
      stock: true, type: 'video', url: '/EAFIT/videos/supino-reto-barra.mp4',
      credit: 'Vídeo: Goulart · wger.de · CC BY-SA 4.0',
    });
  });

  it('acha exercício de pós-treino com emoji no nome', () => {
    expect(getExerciseMedia('🔷 Abdominal Polia (Corda)', '/')?.fallback?.id).toBe('Cable_Crunch');
    expect(getExerciseMedia('🏃 Cardio — Esteira Inclinada', '/')?.fallback?.id).toBe('Walking_Treadmill');
  });

  it('sem equivalente seguro, não tem quadros', () => {
    // "Air Bike" no Free Exercise DB é o abdominal bicicleta, não a bike de academia
    expect(getExerciseMedia('Air Bike (Assault Bike)', '/')?.fallback).toBeNull();
    expect(getExerciseMedia('', '/')).toBeNull();
  });

  it('mídia própria do admin tem prioridade sobre a padrão', () => {
    const custom = { 'Supino Reto com Barra': { url: 'https://x/supino.mp4', type: 'video' } };
    expect(getExerciseMedia('Supino Reto com Barra', '/', custom)).toEqual({ custom: true, type: 'video', url: 'https://x/supino.mp4' });
    // e também vale pra exercício sem demonstração padrão
    expect(getExerciseMedia('🔷 Burpee', '/', { Burpee: { url: 'u', type: 'imagem' } })?.custom).toBe(true);
    expect(getExerciseMedia('Burpee', '/')?.credit).toMatch(/Taco Fleur/);
    expect(getExerciseMedia('Remada Curvada com Barra (pegada supinada)', '/', custom)?.type).toBe('youtube');
  });

  it('todo id mapeado tem os 2 quadros em public/exercicios', () => {
    const missing = [...new Set(Object.values(EXERCISE_MEDIA))]
      .filter(id => ![0, 1].every(n => existsSync(`${PUBLIC_DIR}exercicios/${id}/${n}.webp`)));
    expect(missing).toEqual([]);
  });

  it('todo vídeo mapeado existe em public/videos', () => {
    const missing = [...new Set(Object.values(EXERCISE_VIDEOS))]
      .filter(slug => !existsSync(`${PUBLIC_DIR}videos/${slug}.mp4`));
    expect(missing).toEqual([]);
  });
});

describe('EXERCISE_YOUTUBE', () => {
  it('cada entrada tem ID válido, canal e trecho coerente', () => {
    for (const [nome, v] of Object.entries(EXERCISE_YOUTUBE)) {
      expect(v.id, nome).toMatch(/^[\w-]{11}$/);
      expect(v.canal, nome).toBeTruthy();
      if (v.end) expect(v.end, nome).toBeGreaterThan(v.start || 0);
    }
  });

  it('não repete exercício que já tem vídeo próprio', () => {
    expect(Object.keys(EXERCISE_YOUTUBE).filter(n => EXERCISE_VIDEOS[n])).toEqual([]);
  });

  it('monta a URL sem cookie, muda e em loop', () => {
    const u = new URL(youtubeEmbedUrl({ id: 'abcdefghijk', start: 3, end: 9 }, { autoplay: false }));
    expect(u.origin + u.pathname).toBe('https://www.youtube-nocookie.com/embed/abcdefghijk');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ autoplay: '0', mute: '1', loop: '1', playlist: 'abcdefghijk', start: '3', end: '9' });
    expect(new URL(youtubeEmbedUrl({ id: 'abcdefghijk' })).searchParams.has('end')).toBe(false);
  });
});
