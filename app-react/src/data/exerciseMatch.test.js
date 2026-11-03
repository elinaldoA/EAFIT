import { describe, it, expect } from 'vitest';
import { exerciseTokens, matchCatalogExercise } from './exerciseMatch';
import { EXERCISE_MEDIA, getExerciseMedia } from './exerciseMedia';
import { EXERCISE_VIDEOS } from './exerciseVideos';
import { EXERCISE_YOUTUBE } from './exerciseYoutube';

const CATALOG = [...new Set([...Object.keys(EXERCISE_VIDEOS), ...Object.keys(EXERCISE_YOUTUBE), ...Object.keys(EXERCISE_MEDIA)])];
const match = nome => matchCatalogExercise(nome, CATALOG);

describe('exerciseTokens', () => {
  it('ignora acento, caixa, abreviação de ficha, carga e séries que sobraram no nome', () => {
    expect([...exerciseTokens('Supino reto c/ barra 20kg 4x10')].sort()).toEqual(['barra', 'reto', 'supino']);
    expect([...exerciseTokens('Rosca Alternada com HALTERES')].sort()).toEqual(['alternado', 'halter', 'rosca']);
    expect([...exerciseTokens('Bench Press (Barbell)')].sort()).toEqual(['barra', 'bench', 'press']);
  });
});

describe('matchCatalogExercise', () => {
  it('acha o nome do catálogo para a ficha escrita de outro jeito', () => {
    expect(match('supino reto c/ barra')).toBe('Supino Reto com Barra');
    expect(match('Supino inclinado halteres')).toBe('Supino Inclinado com Halteres');
    expect(match('Elevacao lateral c/ halteres')).toBe('Elevação Lateral com Halteres');
    expect(match('Leg press 45º 4x12')).toBe('Leg Press 45°');
    expect(match('Agachamento smith')).toBe('Agachamento no Smith');
    expect(match('Panturrilha em pé')).toBe('Panturrilha em Pé');
  });

  it('nome genérico completa com o padrão de academia', () => {
    expect(match('Supino reto')).toBe('Supino Reto com Barra');
    expect(match('Supino')).toBe('Supino Reto com Barra');
    expect(match('Rosca direta')).toBe('Rosca Direta com Barra');
    expect(match('Remada baixa')).toBe('Remada Baixa na Polia');
    expect(match('Abdominal supra')).toBe('Abdominal Supra no Solo');
    expect(match('Barra fixa')).toBe('Barra Fixa (peso corporal)');
  });

  it('nomes do Strong/Hevy em inglês, pela tradução do catálogo', () => {
    expect(match('Bench Press (Barbell)')).toBe('Supino Reto com Barra');
    expect(match('Squat (Barbell)')).toBe('Agachamento Livre');
    expect(match('Deadlift (Barbell)')).toBe('Levantamento Terra');
    expect(match('Romanian Deadlift (Barbell)')).toBe('Romeno com Barra');
    expect(match('Lateral Raise (Dumbbell)')).toBe('Elevação Lateral com Halteres');
    expect(match('Seated Row (Cable)')).toBe('Remada Baixa na Polia');
  });

  it('apelidos de academia e o nome sem o parêntese do catálogo', () => {
    expect(match('Agachamento búlgaro')).toBe('Afundo Búlgaro');
    expect(match('Serrote')).toBe('Remada Unilateral com Halter');
    expect(match('Peck deck')).toBe('Crucifixo Máquina');
    expect(match('Barra fixa supinada')).toBe('Barra Fixa Supinada (Chin-Up)');
  });

  it('na dúvida não mostra: movimento diferente, equipamento trocado ou empate', () => {
    expect(match('Rosca martelo invertida')).toBeNull(); // palavra do movimento que o catálogo não tem
    expect(match('Bicep Curl (Dumbbell)')).not.toBe('Rosca Direta na Máquina'); // halter x máquina
    expect(match('Curl (Machine)')).toBeNull(); // não vira "Rosca 21"
    expect(match('Deadlift (Barbell)')).not.toBe('Romeno com Barra');
    expect(match('Paralelas')).toBeNull(); // peito ou tríceps
    expect(match('Exercício que não existe')).toBeNull();
    expect(match('')).toBeNull();
  });
});

describe('getExerciseMedia com nome de fora do catálogo', () => {
  it('usa a demonstração do exercício casado', () => {
    expect(getExerciseMedia('supino reto c/ barra', '/')).toEqual(getExerciseMedia('Supino Reto com Barra', '/'));
    expect(getExerciseMedia('Bench Press (Barbell)', '/')).toEqual(getExerciseMedia('Supino Reto com Barra', '/'));
  });

  it('nome exato continua indo direto, e a mídia própria do admin também casa', () => {
    expect(getExerciseMedia('Supino Reto com Barra', '/')).toBeTruthy();
    const custom = { 'Meu Exercício Especial': { type: 'video', url: 'https://x/v.mp4' } };
    expect(getExerciseMedia('meu exercicio especial', '/', custom)).toEqual({ custom: true, type: 'video', url: 'https://x/v.mp4' });
  });
});
