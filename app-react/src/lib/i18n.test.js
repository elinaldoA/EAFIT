import { describe, it, expect, vi, afterEach } from 'vitest';
import en from '../i18n/en';
import { t } from './i18n';

// Guarda: todo t('...') literal no código precisa ter tradução em en, e os
// {placeholders} têm que bater. Evita texto em português vazando no inglês.
const sources = import.meta.glob(['../**/*.{js,jsx}', '!../**/*.test.*', '!../i18n/**'], { query: '?raw', import: 'default', eager: true });

const CALL = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g;
const unescape = s => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');
const holders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

const used = new Map();
for (const [file, src] of Object.entries(sources)) {
  for (const m of src.matchAll(CALL)) {
    const key = unescape(m[1] ?? m[2] ?? m[3]);
    if (!used.has(key)) used.set(key, file);
  }
}

describe('i18n', () => {
  it('t devolve o próprio texto quando não há tradução e interpola placeholders', () => {
    expect(t('Texto sem tradução')).toBe('Texto sem tradução');
    expect(t('Olá {nome}', { nome: 'Ana' })).toBe('Olá Ana');
  });

  it('todo texto usado em t() tem tradução em inglês', () => {
    const missing = [...used].filter(([key]) => !(key in en)).map(([key, file]) => `${file}: ${key}`);
    expect(missing).toEqual([]);
  });

  it('placeholders das traduções batem com os do original', () => {
    const bad = Object.entries(en).filter(([k, v]) => holders(k) !== holders(v)).map(([k]) => k);
    expect(bad).toEqual([]);
  });
});

describe('idioma inglês', () => {
  afterEach(() => { localStorage.clear(); vi.resetModules(); });

  it('traduz, interpola e ajusta o locale quando app_lang=en', async () => {
    localStorage.setItem('app_lang', 'en');
    vi.resetModules();
    const i18n = await import('./i18n');
    expect(i18n.lang).toBe('en');
    expect(i18n.locale).toBe('en-US');
    expect(i18n.t('Treino')).toBe('Workout');
    expect(i18n.t('Série {n}', { n: 2 })).toBe('Set 2');
    expect(i18n.t('Texto sem tradução')).toBe('Texto sem tradução');
  });

  it('padrão é português', async () => {
    vi.resetModules();
    const i18n = await import('./i18n');
    expect(i18n.lang).toBe('pt');
    expect(i18n.t('Treino')).toBe('Treino');
  });

  it('nomes de dia traduzem só na exibição', async () => {
    localStorage.setItem('app_lang', 'en');
    vi.resetModules();
    const { t } = await import('./i18n');
    expect(t('Segunda')).toBe('Monday');
  });
});
