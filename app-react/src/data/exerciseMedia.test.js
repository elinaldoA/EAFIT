import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EXERCISE_MEDIA, getExerciseMedia, normalizeExerciseName } from './exerciseMedia';
import { EXERCISE_VIDEOS } from './exerciseVideos';

const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));

describe('normalizeExerciseName', () => {
  it('tira o emoji de prefixo dos exercícios de pós-treino', () => {
    expect(normalizeExerciseName('🔷 Abdominal Polia (Corda)')).toBe('Abdominal Polia (Corda)');
    expect(normalizeExerciseName('🏃 Cardio — Escada')).toBe('Cardio — Escada');
    expect(normalizeExerciseName('Supino Reto com Barra')).toBe('Supino Reto com Barra');
  });
});

describe('getExerciseMedia', () => {
  it('sem vídeo, monta os 2 quadros a partir do base do app', () => {
    expect(getExerciseMedia('Remada Curvada com Barra', '/EAFIT/')).toEqual({
      id: 'Bent_Over_Barbell_Row',
      frames: [
        '/EAFIT/exercicios/Bent_Over_Barbell_Row/0.webp',
        '/EAFIT/exercicios/Bent_Over_Barbell_Row/1.webp',
      ],
    });
  });

  it('vídeo curto tem prioridade sobre os quadros', () => {
    expect(getExerciseMedia('🔷 Supino Reto com Barra', '/EAFIT/')).toEqual({
      stock: true, type: 'video', url: '/EAFIT/videos/supino-reto-barra.mp4',
      credit: 'Vídeo: Goulart · wger.de · CC BY-SA 4.0',
    });
  });

  it('acha exercício de pós-treino com emoji no nome', () => {
    expect(getExerciseMedia('🔷 Prancha Frontal Estática', '/')?.id).toBe('Plank');
  });

  it('sem equivalente seguro, não tem demonstração', () => {
    // "Air Bike" no Free Exercise DB é o abdominal bicicleta, não a bike de academia
    expect(getExerciseMedia('Air Bike (Assault Bike)', '/')).toBeNull();
    expect(getExerciseMedia('', '/')).toBeNull();
  });

  it('mídia própria do admin tem prioridade sobre a padrão', () => {
    const custom = { 'Supino Reto com Barra': { url: 'https://x/supino.mp4', type: 'video' } };
    expect(getExerciseMedia('Supino Reto com Barra', '/', custom)).toEqual({ custom: true, type: 'video', url: 'https://x/supino.mp4' });
    // e também vale pra exercício sem demonstração padrão
    expect(getExerciseMedia('🔷 Burpee', '/', { Burpee: { url: 'u', type: 'imagem' } })?.custom).toBe(true);
    expect(getExerciseMedia('Burpee', '/')?.credit).toMatch(/Taco Fleur/);
    expect(getExerciseMedia('Remada Curvada com Barra', '/', custom)?.id).toBe('Bent_Over_Barbell_Row');
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
