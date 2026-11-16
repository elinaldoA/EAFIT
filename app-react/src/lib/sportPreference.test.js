import { describe, it, expect, beforeEach } from 'vitest';
import { captureSportPref, preferredSport, clearSportPref, normalizeSport } from './sportPreference';

beforeEach(() => { localStorage.clear(); });

describe('esporte do link de divulgação', () => {
  it('guarda o esporte de ?esporte= e devolve depois', () => {
    expect(preferredSport()).toBeNull();
    captureSportPref('?esporte=corrida');
    expect(preferredSport()).toBe('corrida');
  });

  it('ignora link sem esporte ou com valor inválido', () => {
    captureSportPref('?ref=ABC');
    captureSportPref('?esporte=');
    captureSportPref('?esporte=<script>');
    captureSportPref('?esporte=a');
    expect(preferredSport()).toBeNull();
  });

  it('o link mais recente vale e maiúsculas não importam', () => {
    captureSportPref('?esporte=corrida');
    captureSportPref('?esporte=Musculacao');
    expect(preferredSport()).toBe('musculacao');
  });

  it('expira depois de 30 dias e dá para limpar', () => {
    const day = 24 * 60 * 60 * 1000;
    captureSportPref('?esporte=corrida', 1000);
    expect(preferredSport(1000 + 29 * day)).toBe('corrida');
    expect(preferredSport(1000 + 31 * day)).toBeNull();
    captureSportPref('?esporte=corrida');
    clearSportPref();
    expect(preferredSport()).toBeNull();
  });

  it('valor corrompido no armazenamento vira null', () => {
    localStorage.setItem('eafit_sport_pref', '{nao e json');
    expect(preferredSport()).toBeNull();
    expect(normalizeSport(null)).toBeNull();
  });
});
