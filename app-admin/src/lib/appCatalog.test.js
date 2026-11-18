import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as catalog from './appCatalog';

describe('appCatalog (ponte com o app-react)', () => {
  it('expõe tudo o que o painel usa do catálogo do app', () => {
    expect(Object.keys(catalog.EXERCISE_MEDIA).length).toBeGreaterThan(0);
    expect(Object.keys(catalog.EXERCISE_VIDEOS).length).toBeGreaterThan(0);
    expect(Object.keys(catalog.EXERCISE_YOUTUBE).length).toBeGreaterThan(0);
    for (const fn of ['normalizeExerciseName', 'getExerciseMedia', 'videoCredit', 'youtubeEmbedUrl', 'matchCatalogExercise']) {
      expect(typeof catalog[fn], fn).toBe('function');
    }
  });

  it('nenhum outro arquivo do painel importa direto do app-react', () => {
    const root = path.resolve(__dirname, '..');
    const offenders = [];
    const walk = dir => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(jsx?|mjs)$/.test(e.name) && !/appCatalog/.test(e.name)
          && /^\s*(import|export)[^\n]*from\s+['"][^'"]*app-react/m.test(fs.readFileSync(p, 'utf8'))) {
          offenders.push(path.relative(root, p));
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
