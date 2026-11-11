import { t } from './i18n';

// Técnicas de intensidade: prescritas no exercício do plano
// (plan_exercises.intensidade) e registradas por série (exercise_sets.tipo).
// Mesmo vocabulário nos dois; nulo = série normal. O `tecnica` do plano segue
// sendo a observação livre (cadência, dica de execução).
export const INTENSITY_KEYS = ['drop_set', 'rest_pause', 'cluster', 'falha'];

export function isIntensity(value) {
  return INTENSITY_KEYS.includes(value);
}

// Normaliza o que vem do banco ou de import: valor desconhecido vira null.
export function normalizeIntensity(value) {
  const v = String(value ?? '').trim();
  return isIntensity(v) ? v : null;
}

export function intensityLabel(key) {
  switch (key) {
    case 'drop_set': return t('Drop-set');
    case 'rest_pause': return t('Rest-pause');
    case 'cluster': return t('Cluster');
    case 'falha': return t('Até a falha');
    default: return t('Normal');
  }
}

export function intensityHint(key) {
  switch (key) {
    case 'drop_set': return t('Na última série, ao chegar na falha reduza a carga em ~20-30% e continue sem descansar.');
    case 'rest_pause': return t('Vá até a falha, descanse 10-15s e faça mais repetições com a mesma carga.');
    case 'cluster': return t('Divida a série em blocos de 2-3 reps com 10-20s de pausa entre eles.');
    case 'falha': return t('Faça a série até não conseguir mais uma repetição com boa técnica.');
    default: return '';
  }
}

// Detalhes de uma série registrada, para o histórico: ["RIR 2", "Drop-set"].
export function setExtras(rir, tipo) {
  const out = [];
  if (Number.isFinite(Number(rir)) && rir !== null && rir !== '') out.push(`RIR ${rir}`);
  const k = normalizeIntensity(tipo);
  if (k) out.push(intensityLabel(k));
  return out;
}
