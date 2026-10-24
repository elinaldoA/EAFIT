import { describe, it, expect } from 'vitest';
import { treinoData } from '../data/treinoData';
import {
  muscleOfName, buildLibraryMap, countSetsByMuscle, volumeLevel, behindMuscles, plannedMuscles, dayMuscles,
} from './muscleVolume';

describe('muscleOfName', () => {
  it('usa a biblioteca quando o exercício está nela', () => {
    const lib = buildLibraryMap([{ nome: 'Pullover com Halter', grupo_muscular: 'peito' }, { nome: 'Alongamento do Pombo', grupo_muscular: 'mobilidade' }]);
    expect(muscleOfName('Pullover com Halter', lib)).toBe('chest');
    expect(muscleOfName('Alongamento do Pombo', lib)).toBeNull();
  });

  it('sem biblioteca, decide pelas palavras do nome', () => {
    expect(muscleOfName('Supino Reto com Barra')).toBe('chest');
    expect(muscleOfName('Crucifixo Invertido')).toBe('shoulders');
    expect(muscleOfName('Elevação Pélvica')).toBe('glutes');
    expect(muscleOfName('Elevação Lateral com Halteres')).toBe('shoulders');
    expect(muscleOfName('Romeno com Barra')).toBe('hamstrings');
    expect(muscleOfName('Remada Curvada com Barra')).toBe('back');
    expect(muscleOfName('Tríceps Testa com Barra W')).toBe('triceps');
    expect(muscleOfName('Rosca Martelo Alternada')).toBe('biceps');
    expect(muscleOfName('Leg Press 45°')).toBe('quads');
    expect(muscleOfName('Panturrilha em Pé')).toBe('calves');
    expect(muscleOfName('🔷 Prancha com Peso')).toBe('abs');
    expect(muscleOfName('🏃 Cardio — Esteira Inclinada')).toBeNull();
  });
});

describe('contagem e níveis', () => {
  it('conta uma série por linha, pelo músculo principal', () => {
    const counts = countSetsByMuscle([
      { exercise_name: 'Supino Reto com Barra' },
      { exercise_name: 'Supino Reto com Barra' },
      { exercise_name: 'Face Pull' },
      { exercise_name: 'Farmer Walk' },
    ]);
    expect(counts.chest).toBe(2);
    expect(counts.shoulders).toBe(1);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('níveis pela faixa de 10–20 séries', () => {
    expect(volumeLevel(0)).toBe('none');
    expect(volumeLevel(6)).toBe('low');
    expect(volumeLevel(10)).toBe('ok');
    expect(volumeLevel(20)).toBe('ok');
    expect(volumeLevel(21)).toBe('high');
  });

  it('ficando para trás: só músculos do plano com menos de 5 séries', () => {
    const counts = { chest: 12, back: 1, shoulders: 3, biceps: 0, triceps: 8, quads: 0, hamstrings: 0, glutes: 0, calves: 0, abs: 0 };
    expect(behindMuscles(counts, new Set(['chest', 'back', 'shoulders', 'triceps']))).toEqual(['back', 'shoulders']);
  });
});

describe('músculos do plano', () => {
  it('cobre os grupos do plano padrão', () => {
    const planned = plannedMuscles(treinoData);
    ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs']
      .forEach(m => expect(planned.has(m)).toBe(true));
  });

  it('músculos de um dia só', () => {
    const quarta = treinoData.find(d => d.dia === 'Quarta');
    const m = dayMuscles(quarta);
    expect(m.has('quads')).toBe(true);
    expect(m.has('chest')).toBe(false);
  });
});
