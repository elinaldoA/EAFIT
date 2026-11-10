import { t, lang } from '../../lib/i18n';
// Clima da corrida (Open-Meteo, sem chave): temperatura, vento, umidade e
// condição do tempo na hora de salvar a corrida (logo depois de ela acabar),
// para o começo do percurso, guardados em runs.weather = { t, w, h, c }
//   t = °C inteiro, w = vento km/h inteiro, h = umidade %, c = código WMO.
// Privacidade: só vai ao serviço a posição do começo da corrida arredondada a
// 0,1° (~11 km) e nenhum identificador. Falhou ou sem internet: a corrida
// salva normalmente, só sem clima.

const URL_BASE = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 4000;
const SCALE = 1e5; // route.js guarda graus em inteiros de 1e-5

// Posição do começo do percurso (graus), ou null.
export function startPosition(route) {
  const p = Array.isArray(route) ? route.find(seg => Array.isArray(seg) && seg.length)?.[0] : null;
  if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  const lat = p[0] / SCALE;
  const lon = p[1] / SCALE;
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

const coarse = deg => (Math.round(deg * 10) / 10).toFixed(1);

export function weatherUrl({ lat, lon }) {
  return `${URL_BASE}?latitude=${coarse(lat)}&longitude=${coarse(lon)}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
}

// Aceita só o formato esperado (dado do banco, do aparelho ou da internet).
export function cleanWeather(w) {
  if (!w || typeof w !== 'object') return null;
  const temp = Number(w.t);
  if (w.t == null || !Number.isFinite(temp) || temp < -90 || temp > 70) return null;
  const num = (v, min, max) => (v != null && Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Math.round(Number(v)) : null);
  return { t: Math.round(temp), w: num(w.w, 0, 400), h: num(w.h, 0, 100), c: num(w.c, 0, 99) };
}

export function parseWeather(json) {
  const c = json?.current;
  return c ? cleanWeather({ t: c.temperature_2m, w: c.wind_speed_10m, h: c.relative_humidity_2m, c: c.weather_code }) : null;
}

// null em qualquer falha (sem internet, tempo esgotado, resposta estranha).
export async function fetchWeather(route, fetcher = globalThis.fetch) {
  const pos = startPosition(route);
  if (!pos || typeof fetcher !== 'function') return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetcher(weatherUrl(pos), { signal: ctrl.signal });
    return res.ok ? parseWeather(await res.json()) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Condição pelo código WMO.
export function weatherKind(code) {
  if (code == null) return null;
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'rain';
  if (code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return null;
}

const LABEL = {
  clear: ['☀️', () => t('Céu limpo')],
  partly: ['⛅', () => t('Parcialmente nublado')],
  cloudy: ['☁️', () => t('Nublado')],
  fog: ['🌫️', () => t('Neblina')],
  rain: ['🌧️', () => t('Chuva')],
  snow: ['❄️', () => t('Neve')],
  storm: ['⛈️', () => t('Tempestade')],
};

// "☀️ 24°C · Céu limpo · vento 12 km/h · umidade 60%"; '' sem clima.
export function weatherText(weather) {
  const w = cleanWeather(weather);
  if (!w) return '';
  const kind = LABEL[weatherKind(w.c)];
  const unit = lang === 'en' ? `${Math.round(w.t * 9 / 5 + 32)}°F` : `${w.t}°C`;
  const parts = [`${kind ? `${kind[0]} ` : '🌡️ '}${unit}`];
  if (kind) parts.push(kind[1]());
  if (w.w != null) parts.push(t('vento {v1} km/h', { v1: w.w }));
  if (w.h != null) parts.push(t('umidade {v1}%', { v1: w.h }));
  return parts.join(' · ');
}
