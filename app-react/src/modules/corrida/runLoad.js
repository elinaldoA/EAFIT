import { addDays } from '../../lib/pause';
import { t } from '../../lib/i18n';

// Esforço relativo de cada corrida e "forma e frescor" (carga de treino ao longo
// dos dias). Tudo calculado das corridas já carregadas; nada vai para o banco.
//
// Esforço relativo = quanto a corrida custou ao corpo, em pontos: minutos em cada
// zona de frequência cardíaca × o peso da zona. Sem as zonas, usa o esforço de 1 a
// 10 que a pessoa marcou; sem nenhum dos dois, estima por um peso médio e avisa
// (source 'estimado').

// Peso por minuto em cada zona (Z1 a Z5): uma hora na Z2 vale 60 pontos.
export const ZONE_WEIGHTS = [0.5, 1, 2, 3, 4];
// Peso por minuto estimado quando só há o esforço percebido (1 a 10): esforço 3 ≈ Z2, 10 ≈ Z5.
const perceivedWeight = effort => 0.25 + effort * 0.35;
const DEFAULT_WEIGHT = 1.5;

// { points, source, level } da corrida. source: 'hr' (zonas), 'esforco' (percebido)
// ou 'estimado'. level: 'leve' | 'moderado' | 'forte' | 'extremo'.
export function relativeEffort(run) {
  const minutes = (run?.duration_s || 0) / 60;
  if (!(minutes > 0)) return { points: 0, source: 'estimado', level: 'leve' };
  let points;
  let source;
  const zones = run?.hr?.z;
  if (Array.isArray(zones) && zones.length === ZONE_WEIGHTS.length) {
    points = zones.reduce((s, sec, i) => s + (sec / 60) * ZONE_WEIGHTS[i], 0);
    source = 'hr';
  } else if (run?.effort >= 1 && run.effort <= 10) {
    points = minutes * perceivedWeight(run.effort);
    source = 'esforco';
  } else {
    points = minutes * DEFAULT_WEIGHT;
    source = 'estimado';
  }
  points = Math.round(points);
  return { points, source, level: effortLevel(points) };
}

export const effortLevel = points => (points < 50 ? 'leve' : points < 100 ? 'moderado' : points < 200 ? 'forte' : 'extremo');

export const EFFORT_LEVEL_LABEL = {
  leve: () => t('leve'),
  moderado: () => t('moderado'),
  forte: () => t('forte'),
  extremo: () => t('extremo'),
};

// ---- Forma e frescor ---------------------------------------------------------

// Constantes de tempo (dias): a forma é a média lenta da carga (42 dias), a fadiga a
// média rápida (7 dias); o frescor é a diferença entre as duas.
export const FITNESS_DAYS = 42;
export const FATIGUE_DAYS = 7;

// Série diária dos últimos `days` dias até `today`: [{ date, load, fitness, fatigue, form }].
// A conta começa 120 dias antes, para a média já estar "aquecida" no primeiro dia mostrado.
export function loadSeries(runs, today, days = 90) {
  const warm = 120;
  const start = addDays(today, -(days + warm - 1));
  const byDay = new Map();
  for (const r of runs) {
    if (r.run_date < start || r.run_date > today) continue;
    byDay.set(r.run_date, (byDay.get(r.run_date) || 0) + relativeEffort(r).points);
  }
  const kf = 1 - Math.exp(-1 / FITNESS_DAYS);
  const ka = 1 - Math.exp(-1 / FATIGUE_DAYS);
  let fitness = 0;
  let fatigue = 0;
  const out = [];
  for (let i = 0; i < days + warm; i++) {
    const date = addDays(start, i);
    const load = byDay.get(date) || 0;
    const form = fitness - fatigue; // frescor de hoje: calculado com os valores de ontem
    fitness += (load - fitness) * kf;
    fatigue += (load - fatigue) * ka;
    if (i >= warm) out.push({ date, load, fitness: Math.round(fitness * 10) / 10, fatigue: Math.round(fatigue * 10) / 10, form: Math.round(form * 10) / 10 });
  }
  return out;
}

// Estado de treino pelo frescor de hoje; null sem nenhuma carga nos últimos 42 dias.
export function trainingStatus(series) {
  const last = series.at(-1);
  if (!last || !series.slice(-FITNESS_DAYS).some(d => d.load > 0)) return null;
  const f = last.form;
  const key = f > 10 ? 'descansado' : f >= -10 ? 'equilibrado' : f >= -30 ? 'carregado' : 'sobrecarga';
  return { key, form: f, fitness: last.fitness, fatigue: last.fatigue };
}

export const STATUS_TEXT = {
  descansado: () => t('😌 Descansado: boa hora para uma corrida forte ou uma prova.'),
  equilibrado: () => t('✅ Equilibrado: carga em dia com a sua forma.'),
  carregado: () => t('💪 Carregado: treinando firme. Intercale dias leves.'),
  sobrecarga: () => t('⚠️ Sobrecarga: fadiga bem acima da forma. Descanse para não se lesionar.'),
};
