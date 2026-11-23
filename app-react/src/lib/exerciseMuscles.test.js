import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { mergeCustomMuscles, muscleKey } from './exerciseMuscles';
import { muscleOfName } from './muscleVolume';

describe('mergeCustomMuscles', () => {
  it('a biblioteca manda, inclusive quando diz "sem músculo"', () => {
    const lib = new Map([['supino reto', 'chest'], ['alongamento', null]]);
    const out = mergeCustomMuscles(lib, new Map([['supino reto', 'back'], ['alongamento', 'abs'], ['meu exercício', 'glutes']]));
    expect(out.get('supino reto')).toBe('chest');
    expect(out.get('alongamento')).toBeNull();
    expect(out.get('meu exercício')).toBe('glutes');
  });
  it('a escolha da pessoa vale mais que as palavras-chave do nome', () => {
    const map = mergeCustomMuscles(new Map(), new Map([[muscleKey('🔷 Prancha Bizarra'), 'shoulders']]));
    expect(muscleOfName('Prancha Bizarra', map)).toBe('shoulders');
    expect(muscleOfName('Prancha Bizarra', new Map())).toBe('abs');
  });
});
