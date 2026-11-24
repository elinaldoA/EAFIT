import { readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { EXERCISE_GIFS } from './exerciseGifs';

// O servidor diferencia maiúsculas e acentos: cada GIF mapeado precisa existir
// com o nome idêntico em public/gifs (um nome diferente dá 404 no app).
describe('EXERCISE_GIFS', () => {
  it('todo GIF mapeado existe em public/gifs com o nome exato', () => {
    const files = new Set(readdirSync('public/gifs').map(f => f.normalize('NFC')));
    const missing = Object.values(EXERCISE_GIFS).filter(f => !files.has(`${f}.gif`.normalize('NFC')));
    expect(missing).toEqual([]);
  });
});
