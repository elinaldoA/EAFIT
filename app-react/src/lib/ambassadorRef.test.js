// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { captureRef, pendingRef, clearRef } from './ambassadorRef';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

beforeEach(() => { localStorage.clear(); });

describe('link de embaixador', () => {
  it('guarda o código e o canal do link', () => {
    captureRef('?ref=AnaFit&origem=instagram', '', NOW);
    expect(pendingRef(NOW)).toEqual({ code: 'anafit', source: 'instagram' });
  });

  it('sem canal no link usa o referrer', () => {
    captureRef('?ref=anafit', 'https://l.instagram.com/?u=x', NOW);
    expect(pendingRef(NOW).source).toBe('instagram');
  });

  it('ignora código fora do formato', () => {
    captureRef('?ref=a', '', NOW);
    captureRef('?ref=nome com espaço', '', NOW);
    expect(pendingRef(NOW)).toBeNull();
  });

  it('o primeiro link vale por 30 dias', () => {
    captureRef('?ref=primeiro', '', NOW);
    captureRef('?ref=segundo', '', NOW + DAY);
    expect(pendingRef(NOW + DAY).code).toBe('primeiro');
    expect(pendingRef(NOW + 31 * DAY)).toBeNull();
    captureRef('?ref=segundo', '', NOW + 31 * DAY);
    expect(pendingRef(NOW + 31 * DAY).code).toBe('segundo');
  });

  it('clearRef apaga e valor corrompido é ignorado', () => {
    captureRef('?ref=anafit', '', NOW);
    clearRef();
    expect(pendingRef(NOW)).toBeNull();
    localStorage.setItem('eafit_ref', '{quebrado');
    expect(pendingRef(NOW)).toBeNull();
  });
});
