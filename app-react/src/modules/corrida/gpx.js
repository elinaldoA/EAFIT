import { haversineM, MAX_SPEED_MS } from './geoTrack';
import { addPoint, cleanRoute, privateRoute } from './route';
import { addAltitude, emptyElevation, elevationGain } from './elevation';
import { splitsOf } from './liveRun';
import { defaultRunTitle } from './runs';
import { t } from '../../lib/i18n';

// GPX do EAFIT Run: exportar uma corrida para outro app ou relógio e importar
// a corrida gravada em outro lugar.
//
// Exportar: o percurso salvo (já sem os primeiros e últimos 200 m e sem as
// zonas de privacidade). O horário de cada ponto é o início da corrida mais o
// tempo de corrida do ponto, então pausas viram "tempo parado" no arquivo.
// Importar: o arquivo inteiro vira uma corrida; o início e o fim do percurso
// são cortados ao salvar, como em qualquer corrida gravada no app.

const SCALE = 1e5;
// Pausa: intervalo maior que isso (s) entre dois pontos não conta como corrida.
export const MAX_GAP_S = 30;
// Tamanho máximo do arquivo aceito (bytes).
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

const esc = s => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

// ---- Exportar ----------------------------------------------------------------

export function buildGpx(run) {
  const start = new Date(run.started_at).getTime();
  const segs = cleanRoute(run.route);
  const body = segs.map(seg => {
    const pts = seg.map(p => {
      const time = Number.isFinite(p[2]) && Number.isFinite(start) ? `<time>${new Date(start + p[2] * 1000).toISOString()}</time>` : '';
      return `      <trkpt lat="${(p[0] / SCALE).toFixed(5)}" lon="${(p[1] / SCALE).toFixed(5)}">${time}</trkpt>`;
    });
    return `    <trkseg>\n${pts.join('\n')}\n    </trkseg>`;
  }).join('\n');
  const meta = Number.isFinite(start) ? `  <metadata><time>${new Date(start).toISOString()}</time></metadata>\n` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="EAFIT Run" xmlns="http://www.topografix.com/GPX/1/1">
${meta}  <trk>
    <name>${esc(run.title || defaultRunTitle(run.started_at))}</name>
    <type>running</type>
${body}
  </trk>
</gpx>
`;
}

export const gpxFilename = run => `eafit-run-${(run.run_date || String(run.started_at || '').slice(0, 10) || 'corrida')}.gpx`;

export function downloadGpx(run) {
  const blob = new Blob([buildGpx(run)], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = gpxFilename(run);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---- Importar ----------------------------------------------------------------

// Pontos do arquivo: { name, segments: [[{ lat, lon, ele, time (ms) }]] } ou
// null se não for um GPX com percurso.
export function parseGpx(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) return null;
  const trkName = doc.getElementsByTagName('trk')[0]?.getElementsByTagName('name')[0]?.textContent?.trim() || '';
  const num = (el, tag) => {
    const v = el.getElementsByTagName(tag)[0]?.textContent;
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const read = el => {
    const lat = Number(el.getAttribute('lat'));
    const lon = Number(el.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const time = Date.parse(el.getElementsByTagName('time')[0]?.textContent || '');
    return { lat, lon, ele: num(el, 'ele'), time: Number.isFinite(time) ? time : null };
  };
  let segments = [...doc.getElementsByTagName('trkseg')].map(seg => [...seg.getElementsByTagName('trkpt')].map(read).filter(Boolean));
  // Rota (rtept) sem trilha: serve só se tiver horário nos pontos.
  if (!segments.some(s => s.length)) segments = [[...doc.getElementsByTagName('rtept')].map(read).filter(Boolean)];
  segments = segments.filter(s => s.length >= 2);
  return segments.length ? { name: trkName, segments } : null;
}

// Corrida a partir do arquivo. Devolve { record } ou { error }. `zones`: zonas
// de privacidade da conta (o início e o fim somem, como nas corridas gravadas).
export function runFromGpx(parsed, { zones = [], fileName = '', now = Date.now() } = {}) {
  if (!parsed) return { error: t('⚠️ O arquivo não parece um GPX com percurso') };
  const all = parsed.segments.flat();
  if (!all.every(p => p.time != null)) return { error: t('⚠️ O arquivo não tem o horário dos pontos: não dá para calcular o tempo') };

  let meters = 0;
  let movingS = 0;
  let route = [];
  let elev = emptyElevation();
  const kmMarks = [];

  parsed.segments.forEach((seg, si) => {
    let prev = null;
    seg.forEach((p, i) => {
      elev = addAltitude(elev, p.ele, null);
      const dt = prev ? (p.time - prev.time) / 1000 : 0;
      if (prev && dt > 0) {
        const d = haversineM(prev, p);
        // Salto do GPS (túnel, perda de sinal): o ponto novo recomeça o trecho.
        const jump = d / dt > MAX_SPEED_MS;
        if (!jump && dt <= MAX_GAP_S) {
          const before = meters;
          const beforeS = movingS;
          meters += d;
          movingS += dt;
          for (let k = kmMarks.length + 1; k * 1000 <= meters; k++) {
            const frac = d > 0 ? (k * 1000 - before) / d : 1;
            kmMarks.push(Math.round((beforeS + Math.max(0, Math.min(1, frac)) * dt) * 1000));
          }
          route = addPoint(route, p.lat, p.lon, false, movingS);
        } else {
          route = addPoint(route, p.lat, p.lon, true, movingS);
        }
      } else if (!prev) {
        route = addPoint(route, p.lat, p.lon, si > 0 || i === 0, movingS);
      }
      prev = p;
    });
  });

  const durationS = Math.round(movingS);
  const distanceM = Math.round(meters);
  if (distanceM < 100) return { error: t('⚠️ Percurso curto demais: menos de 100 m') };
  if (durationS < 10) return { error: t('⚠️ O horário dos pontos não permite calcular o tempo') };
  if (durationS > 86400 || distanceM > 500000) return { error: t('⚠️ Corrida grande demais para importar (máximo 24 h e 500 km)') };

  const startMs = all.map(p => p.time).reduce((m, x) => Math.min(m, x), Infinity);
  if (startMs > now + 60000) return { error: t('⚠️ A corrida não pode ser no futuro') };
  const start = new Date(startMs);
  const runDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  const name = (parsed.name || fileName.replace(/\.gpx$/i, '')).trim().slice(0, 80);

  return {
    record: {
      // Mesmo arquivo importado de novo cai na mesma corrida (upsert por client_id).
      client_id: `gpx-${startMs.toString(36)}-${distanceM}`,
      run_date: runDate,
      started_at: start.toISOString(),
      duration_s: durationS,
      distance_m: distanceM,
      splits: splitsOf(kmMarks),
      kind: 'livre',
      program_week: null,
      program_day: null,
      gps: true,
      route: privateRoute(route, zones),
      effort: null,
      notes: null,
      title: name || defaultRunTitle(startMs),
      visibility: 'amigos',
      elev_gain_m: elevationGain(elev),
      cadence: null,
      shoe_id: null,
    },
  };
}
