import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));
import { parseDistances, distancesToText, validateEvent, filterEvents, toDraft, EMPTY_EVENT } from './runEvents';

const ok = (over = {}) => ({ ...EMPTY_EVENT, name: 'Corrida Cibien', event_date: '2026-11-20', state: 'es', distances: '5; 10', ...over });

describe('runEvents', () => {
  it('lê distâncias com vírgula decimal e separadores variados', () => {
    expect(parseDistances('5; 10')).toEqual([5, 10]);
    expect(parseDistances('21,1 / 42,195km')).toEqual([21.1, 42.195]);
    expect(parseDistances('')).toEqual([]);
    expect(distancesToText([5, 21.1])).toBe('5; 21,1');
  });

  it('valida e normaliza', () => {
    const r = validateEvent(ok({ city: ' Vila Velha ', lat: '-20,329', lng: '-40,292', url: 'https://x.com/inscricao' }));
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ state: 'ES', city: 'Vila Velha', lat: -20.329, lng: -40.292, distances: [5, 10], url: 'https://x.com/inscricao' });
  });

  it('recusa nome curto, UF inválida, link sem http e coordenada pela metade', () => {
    expect(validateEvent(ok({ name: 'ab' })).errors.name).toBeTruthy();
    expect(validateEvent(ok({ state: 'ESP' })).errors.state).toBeTruthy();
    expect(validateEvent(ok({ url: 'javascript:alert(1)' })).errors.url).toBeTruthy();
    expect(validateEvent(ok({ lat: '-20,3' })).errors.lat).toBeTruthy();
    expect(validateEvent(ok({ lat: '99', lng: '10' })).errors.lat).toBeTruthy();
    expect(validateEvent(ok({ event_date: '' })).errors.event_date).toBeTruthy();
  });

  it('filtra por situação e busca', () => {
    const rows = [
      { name: 'Corrida A', city: 'Vitória', state: 'ES', status: 'draft' },
      { name: 'Night Run', city: 'Serra', state: 'ES', status: 'approved' },
    ];
    expect(filterEvents(rows, { status: 'draft' })).toHaveLength(1);
    expect(filterEvents(rows, { search: 'serra' })).toHaveLength(1);
    expect(filterEvents(rows, {})).toHaveLength(2);
  });

  it('toDraft devolve texto para o formulário', () => {
    expect(toDraft({ name: 'X', distances: [5, 10], lat: -20.3, state: 'ES' })).toMatchObject({ distances: '5; 10', lat: '-20.3' });
  });
});
