// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ db: {} }));

import { toEvent, haversineKm, nearbyEvents, raceFromEvent, formatEventKm, readLocation, writeLocation } from './events';

const ev = (over = {}) => toEvent({
  id: 'a', name: 'Corrida Teste', event_date: '2026-12-06', city: 'Vila Velha', state: 'ES',
  lat: -20.329, lng: -40.292, distances: ['10', '5'], url: 'https://x.com', ...over,
});

describe('events', () => {
  it('toEvent ordena as distâncias e tolera campos vazios', () => {
    expect(ev().distances).toEqual([5, 10]);
    const e = toEvent({ id: 'b', name: 'Sem local', event_date: '2026-12-06', state: 'ES', lat: null, lng: null, distances: null });
    expect(e.lat).toBeNull();
    expect(e.distances).toEqual([]);
  });

  it('haversine: Vitória a Vila Velha fica perto', () => {
    const d = haversineKm({ lat: -20.3155, lon: -40.3128 }, { lat: -20.329, lon: -40.292 });
    expect(d).toBeGreaterThan(1);
    expect(d).toBeLessThan(5);
  });

  it('com posição: só dentro do raio, ordenado por data, com a distância', () => {
    const near = ev({ id: '1', event_date: '2026-12-13' });
    const sooner = ev({ id: '2', event_date: '2026-12-06', lat: -20.35, lng: -40.3 });
    const far = ev({ id: '3', lat: -22.9, lng: -43.2 });
    const noCoords = ev({ id: '4', lat: null, lng: null });
    const r = nearbyEvents([near, far, noCoords, sooner], { loc: { lat: -20.3155, lon: -40.3128 }, radius: 50 });
    expect(r.map(e => e.id)).toEqual(['2', '1']);
    expect(r[0].km).toBeGreaterThan(0);
  });

  it('com estado escolhido: filtra pelo estado, inclusive sem coordenadas', () => {
    const r = nearbyEvents([ev({ id: '1' }), ev({ id: '2', state: 'MG' }), ev({ id: '3', lat: null, lng: null })], { loc: { uf: 'ES' } });
    expect(r.map(e => e.id)).toEqual(['1', '3']);
  });

  it('filtro de distância usa faixas (6 km conta como 5K)', () => {
    const list = [ev({ id: '1', distances: ['6'] }), ev({ id: '2', distances: ['10', '5'] }), ev({ id: '3', distances: ['42.195'] })];
    expect(nearbyEvents(list, { band: '5' }).map(e => e.id)).toEqual(['1', '2']);
    expect(nearbyEvents(list, { band: '42' }).map(e => e.id)).toEqual(['3']);
    expect(nearbyEvents(list, { band: '21' })).toEqual([]);
  });

  it('raceFromEvent monta a prova com a distância escolhida', () => {
    expect(raceFromEvent(ev({ name: 'X'.repeat(80) }), 10)).toEqual({ name: 'X'.repeat(60), date: '2026-12-06', km: 10 });
  });

  it('formata km com vírgula', () => {
    expect(formatEventKm(12.34)).toBe('12,3 km');
    expect(formatEventKm(5)).toBe('5 km');
  });

  it('a posição é guardada arredondada a 0,1° e o estado também', () => {
    writeLocation({ lat: -20.3155, lon: -40.3128 });
    expect(readLocation()).toEqual({ lat: -20.3, lon: -40.3 });
    writeLocation({ uf: 'ES' });
    expect(readLocation()).toEqual({ uf: 'ES' });
    writeLocation(null);
    expect(readLocation()).toBeNull();
  });
});
