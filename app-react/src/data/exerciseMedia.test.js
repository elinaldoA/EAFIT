import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EXERCISE_MEDIA, getExerciseMedia, normalizeExerciseName } from './exerciseMedia';

const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));

describe('normalizeExerciseName', () => {
  it('tira o emoji de prefixo dos exercícios de pós-treino', () => {
    expect(normalizeExerciseName('🔷 Abdominal Polia (Corda)')).toBe('Abdominal Polia (Corda)');
    expect(normalizeExerciseName('🏃 Cardio — Escada')).toBe('Cardio — Escada');
    expect(normalizeExerciseName('Supino Reto com Barra')).toBe('Supino Reto com Barra');
  });
});

describe('getExerciseMedia', () => {
  it('monta os 2 quadros a partir do base do app', () => {
    expect(getExerciseMedia('Supino Reto com Barra', '/EAFIT/')).toEqual({
      id: 'Barbell_Bench_Press_-_Medium_Grip',
      frames: [
        '/EAFIT/exercicios/Barbell_Bench_Press_-_Medium_Grip/0.webp',
        '/EAFIT/exercicios/Barbell_Bench_Press_-_Medium_Grip/1.webp',
      ],
    });
  });

  it('acha exercício de pós-treino com emoji no nome', () => {
    expect(getExerciseMedia('🔷 Prancha Frontal Estática', '/')?.id).toBe('Plank');
  });

  it('sem equivalente seguro, não tem demonstração', () => {
    expect(getExerciseMedia('Burpee', '/')).toBeNull();
    // "Air Bike" no Free Exercise DB é o abdominal bicicleta, não a bike de academia
    expect(getExerciseMedia('Air Bike (Assault Bike)', '/')).toBeNull();
    expect(getExerciseMedia('', '/')).toBeNull();
  });

  it('mídia própria do admin tem prioridade sobre a padrão', () => {
    const custom = { 'Supino Reto com Barra': { url: 'https://x/supino.mp4', type: 'video' } };
    expect(getExerciseMedia('Supino Reto com Barra', '/', custom)).toEqual({ custom: true, type: 'video', url: 'https://x/supino.mp4' });
    // e também vale pra exercício sem demonstração padrão
    expect(getExerciseMedia('🔷 Burpee', '/', { Burpee: { url: 'u', type: 'imagem' } })?.custom).toBe(true);
    expect(getExerciseMedia('Supino Reto com Halteres', '/', custom)?.id).toBe('Dumbbell_Bench_Press');
  });

  it('todo id mapeado tem os 2 quadros em public/exercicios', () => {
    const missing = [...new Set(Object.values(EXERCISE_MEDIA))]
      .filter(id => ![0, 1].every(n => existsSync(`${PUBLIC_DIR}exercicios/${id}/${n}.webp`)));
    expect(missing).toEqual([]);
  });
});
