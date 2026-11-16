import { haversineM } from './geoTrack';
import { cleanRoute } from './route';
import { cleanHr } from './heartRate';
import { downloadText } from './gpx';

// TCX do EAFIT Run: o formato que Garmin Connect, Strava, TrainingPeaks e a
// maioria dos relógios aceitam importar, com tempo, distância, frequência
// cardíaca média e máxima e o percurso. Mesmo percurso do GPX (já sem os
// primeiros e últimos 200 m e sem as zonas de privacidade); o horário de cada
// ponto é o início da corrida mais o tempo de corrida do ponto.

const SCALE = 1e5;
const esc = s => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const iso = ms => new Date(ms).toISOString();

export function buildTcx(run) {
  const start = new Date(run.started_at).getTime();
  const hasStart = Number.isFinite(start);
  const segs = cleanRoute(run.route);
  const hr = cleanHr(run.hr);

  // Pontos com horário; a distância acumulada segue o desenho do percurso.
  let meters = 0;
  const tracks = hasStart ? segs.map(seg => {
    const pts = [];
    let prev = null;
    for (const p of seg) {
      if (!Number.isFinite(p[2])) continue;
      const cur = { lat: p[0] / SCALE, lon: p[1] / SCALE };
      if (prev) meters += haversineM(prev, cur);
      prev = cur;
      pts.push(`          <Trackpoint><Time>${iso(start + p[2] * 1000)}</Time><Position><LatitudeDegrees>${cur.lat.toFixed(5)}</LatitudeDegrees><LongitudeDegrees>${cur.lon.toFixed(5)}</LongitudeDegrees></Position><DistanceMeters>${meters.toFixed(1)}</DistanceMeters></Trackpoint>`);
    }
    return pts.length ? `        <Track>\n${pts.join('\n')}\n        </Track>` : '';
  }).filter(Boolean) : [];

  const heart = hr
    ? `        <AverageHeartRateBpm><Value>${hr.avg}</Value></AverageHeartRateBpm>\n        <MaximumHeartRateBpm><Value>${hr.max}</Value></MaximumHeartRateBpm>\n`
    : '';
  const notes = run.notes ? `      <Notes>${esc(run.notes)}</Notes>\n` : '';
  const id = hasStart ? iso(start) : new Date(0).toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Running">
      <Id>${id}</Id>
      <Lap StartTime="${id}">
        <TotalTimeSeconds>${Math.round(run.duration_s || 0)}</TotalTimeSeconds>
        <DistanceMeters>${Math.round(run.distance_m || 0)}</DistanceMeters>
        <Calories>0</Calories>
${heart}        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
${tracks.join('\n')}${tracks.length ? '\n' : ''}      </Lap>
${notes}    </Activity>
  </Activities>
  <Author xsi:type="Application_t" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <Name>EAFIT Run</Name>
    <Build><Version><VersionMajor>1</VersionMajor><VersionMinor>0</VersionMinor></Version></Build>
    <LangID>pt</LangID>
    <PartNumber>000-00000-00</PartNumber>
  </Author>
</TrainingCenterDatabase>
`;
}

export const tcxFilename = run => `eafit-run-${(run.run_date || String(run.started_at || '').slice(0, 10) || 'corrida')}.tcx`;

export const downloadTcx = run => downloadText(tcxFilename(run), buildTcx(run), 'application/vnd.garmin.tcx+xml');
