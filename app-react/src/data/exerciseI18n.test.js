import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { names, techniques, focos, focoParts } from '../i18n/en/exercises';

// Guarda: tudo que o código ou as migrations semeiam (nomes, técnicas, focos
// dos planos prontos e da biblioteca) precisa ter inglês — senão o app em
// inglês mostra o exercício em português.
const sources = import.meta.glob(
  ['./treinoData.js', './workoutTemplates.js', './workoutAdjustments.js', './exerciseMedia.js', './exerciseVideos.js'],
  { query: '?raw', import: 'default', eager: true },
);

const q = "'((?:[^'\\\\]|\\\\.)*)'";
const field = key => new RegExp(`${key}\\s*:\\s*${q}`, 'g');
const EMOJI_PREFIX = /^[\p{Extended_Pictographic}️‍]+\s*/u;
const strip = s => s.replace(EMOJI_PREFIX, '');

const found = { nome: new Set(), tecnica: new Set(), foco: new Set() };
for (const src of Object.values(sources)) {
  for (const k of ['nome', 'tecnica', 'foco']) {
    for (const m of src.matchAll(field(k))) found[k].add(strip(m[1].replace(/\\'/g, "'")));
  }
  // chaves de exerciseMedia/exerciseVideos: 'Nome do Exercício': '...'
  for (const m of src.matchAll(/^\s*'([^']+)'\s*:\s*'/gm)) {
    if (/[A-Z]/.test(m[1][0]) && !/^[A-Z][a-z]+_/.test(m[1])) found.nome.add(strip(m[1]));
  }
}

// Biblioteca (migrations): ('Nome', 'grupo', 'tipo', equip, 'series', 'reps', 'desc', 'tecnica', ...)
const dir = path.resolve(process.cwd(), '../supabase/migrations');
const sq = "'((?:[^']|'')*)'";
const rowRe = new RegExp(`^\\(${sq},\\s*'[a-z_]+',\\s*'(?:composto|isolado|cardio)',\\s*(?:'(?:[^']|'')*'|null),\\s*${sq},\\s*${sq},\\s*${sq},\\s*${sq}`, 'gm');
const unq = s => s.replace(/''/g, "'");
if (fs.existsSync(dir)) {
  for (const f of fs.readdirSync(dir)) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of sql.matchAll(rowRe)) {
      found.nome.add(strip(unq(m[1])));
      found.tecnica.add(unq(m[5]));
    }
    if (/template|sexta|resistencia/.test(f)) {
      for (const k of ['nome', 'tecnica', 'foco']) {
        for (const m of sql.matchAll(new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'g'))) {
          // ignora o plano alimentar (migrations antigas de dieta)
          if (k === 'nome' && /^[\p{Extended_Pictographic}]/u.test(m[1]) && !/^(🔷|🏃)/u.test(m[1])) continue;
          found[k].add(strip(m[1]));
        }
      }
    }
  }
}

const NOT_EXERCISES = new Set(['remada-barra-t']);
const isFocoTranslated = f => f in focos || f.split(' / ').every(p => p in focoParts);

describe('inglês dos exercícios', () => {
  it('a extração enxerga os dados (evita passar vazio)', () => {
    expect(found.nome.size).toBeGreaterThan(200);
    expect(found.tecnica.size).toBeGreaterThan(200);
    expect(found.foco.size).toBeGreaterThan(10);
  });

  it('todo nome de exercício tem tradução', () => {
    const missing = [...found.nome].filter(n => !(n in names) && !NOT_EXERCISES.has(n) && !/^[a-z-]+$/.test(n));
    expect(missing).toEqual([]);
  });

  it('toda técnica tem tradução', () => {
    expect([...found.tecnica].filter(x => x && !(x in techniques))).toEqual([]);
  });

  it('todo foco tem tradução', () => {
    expect([...found.foco].filter(f => f && !isFocoTranslated(f))).toEqual([]);
  });
});

describe('helpers de exibição', () => {
  afterEach(() => { localStorage.clear(); vi.resetModules(); });

  it('em português devolvem o texto original', async () => {
    vi.resetModules();
    const i = await import('../lib/i18n');
    expect(i.tEx('Supino Reto com Barra')).toBe('Supino Reto com Barra');
    expect(i.tFoco('Peito / Tríceps')).toBe('Peito / Tríceps');
    expect(i.tReps('12 cada lado')).toBe('12 cada lado');
  });

  it('em inglês traduzem, preservam emoji e caem no original sem entrada', async () => {
    localStorage.setItem('app_lang', 'en');
    vi.resetModules();
    const i = await import('../lib/i18n');
    expect(i.tEx('Supino Reto com Barra')).toBe('Barbell Bench Press');
    expect(i.tEx('🔷 Prancha com Peso')).toBe('🔷 Weighted Plank');
    expect(i.tEx('🏃 Cardio — Esteira')).toBe('🏃 Cardio — Treadmill');
    expect(i.tEx('Exercício do personal')).toBe('Exercício do personal');
    expect(i.tTec('Cadência 2-0-2')).toBe('2-0-2 tempo');
    expect(i.tFoco('Peito / Ombro / Tríceps')).toBe('Chest / Shoulders / Triceps');
    expect(i.tFoco('Cardio Leve / Recuperação')).toBe('Light Cardio / Recovery');
    expect(i.tFoco('Foco inventado')).toBe('Foco inventado');
    expect(i.tReps('12 cada lado')).toBe('12 each side');
    expect(i.tReps('até a falha (máx 20)')).toBe('to failure (max 20)');
    expect(i.tReps('15min · 1min corre / 2min caminha')).toBe('15 min · 1 min run / 2 min walk');
    expect(i.tReps('8-10')).toBe('8-10');
  });
});

describe('cópia para as Edge Functions', () => {
  it('supabase/functions/_shared/exerciseI18n.ts espelha i18n/en/exercises.js', () => {
    const file = path.resolve(process.cwd(), '../supabase/functions/_shared/exerciseI18n.ts');
    if (!fs.existsSync(file)) return;
    const src = fs.readFileSync(file, 'utf8');
    const block = (name) => {
      const start = src.indexOf(`export const ${name}: Record<string, string> = `);
      const open = src.indexOf('{', start);
      const close = src.indexOf('\n};', open);
      return JSON.parse(src.slice(open, close + 2));
    };
    expect(block('exerciseNames')).toEqual(names);
    expect(block('focoNames')).toEqual(focos);
    expect(block('focoParts')).toEqual(focoParts);
  });
});
