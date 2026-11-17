import { describe, it, expect, vi } from 'vitest';
import { fetchWeatherAt, weatherAdvice, startPosition, weatherUrl, cleanWeather, parseWeather, fetchWeather, weatherKind, weatherText } from './weather';

const route = [[[-2350123, -4660456, 0], [-2350000, -4660000, 60]]];

describe('clima da corrida', () => {
  it('pega o começo do percurso em graus', () => {
    expect(startPosition(route)).toEqual({ lat: -23.50123, lon: -46.60456 });
    expect(startPosition([])).toBeNull();
    expect(startPosition([[['x', 1]]])).toBeNull();
  });

  it('a consulta leva só a posição arredondada a 0,1°', () => {
    const url = weatherUrl({ lat: -23.50123, lon: -46.60456 });
    expect(url).toContain('latitude=-23.5&longitude=-46.6');
    expect(url).not.toMatch(/23\.50|46\.60/);
  });

  it('só aceita valores plausíveis', () => {
    expect(cleanWeather({ t: 23.6, w: 11.4, h: 61, c: 2 })).toEqual({ t: 24, w: 11, h: 61, c: 2 });
    expect(cleanWeather({ t: 'x' })).toBeNull();
    expect(cleanWeather({ t: 200 })).toBeNull();
    expect(cleanWeather(null)).toBeNull();
    expect(cleanWeather({ t: 20, w: -5, h: 500 })).toEqual({ t: 20, w: null, h: null, c: null });
  });

  it('lê a resposta do Open-Meteo', () => {
    expect(parseWeather({ current: { temperature_2m: 18.2, relative_humidity_2m: 80, weather_code: 61, wind_speed_10m: 7 } })).toEqual({ t: 18, w: 7, h: 80, c: 61 });
    expect(parseWeather({})).toBeNull();
  });

  it('falha de rede, resposta ruim ou sem percurso viram null', async () => {
    expect(await fetchWeather(route, vi.fn().mockRejectedValue(new Error('offline')))).toBeNull();
    expect(await fetchWeather(route, vi.fn().mockResolvedValue({ ok: false }))).toBeNull();
    expect(await fetchWeather([], vi.fn())).toBeNull();
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ current: { temperature_2m: 25, weather_code: 0 } }) });
    expect(await fetchWeather(route, ok)).toEqual({ t: 25, w: null, h: null, c: 0 });
    expect(ok.mock.calls[0][0]).toContain('latitude=-23.5');
  });

  it('agrupa os códigos WMO e monta o texto', () => {
    expect(['0', '1', '3', '45', '63', '73', '81', '96'].map(c => weatherKind(Number(c)))).toEqual(['clear', 'partly', 'cloudy', 'fog', 'rain', 'snow', 'rain', 'storm']);
    expect(weatherText({ t: 24, w: 12, h: 60, c: 0 })).toBe('☀️ 24°C · Céu limpo · vento 12 km/h · umidade 60%');
    expect(weatherText(null)).toBe('');
  });

  it('busca o clima de uma posição solta, sem percurso', async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ current: { temperature_2m: 30, weather_code: 1 } }) });
    expect(await fetchWeatherAt({ lat: -23.5012, lon: -46.6045 }, ok)).toEqual({ t: 30, w: null, h: null, c: 1 });
    expect(ok.mock.calls[0][0]).toContain('latitude=-23.5&longitude=-46.6');
    expect(await fetchWeatherAt(null, ok)).toBeNull();
    expect(await fetchWeatherAt({ lat: NaN, lon: 1 }, ok)).toBeNull();
  });

  it('dá a dica certa para o clima, e nenhuma quando está bom', () => {
    expect(weatherAdvice({ t: 22, w: 10, c: 0 })).toBe('');
    expect(weatherAdvice(null)).toBe('');
    expect(weatherAdvice({ t: 29, c: 0 })).toMatch(/Calor/);
    expect(weatherAdvice({ t: 33, c: 0 })).toMatch(/Muito quente/);
    expect(weatherAdvice({ t: 20, c: 95 })).toMatch(/Tempestade/);
    expect(weatherAdvice({ t: 20, c: 63 })).toMatch(/Chuva/);
    expect(weatherAdvice({ t: 20, w: 40, c: 0 })).toMatch(/Vento forte/);
    expect(weatherAdvice({ t: 5, c: 0 })).toMatch(/Frio/);
  });
});
