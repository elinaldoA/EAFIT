// Treinador por voz: preferências do aparelho, sorteio de frases (sem repetir
// a mesma logo em seguida) e a fala em si. Sem IA — é um banco de frases por
// situação (data/coachPhrases.js) escolhido por regras.
//
// Quanto ele fala (prefs.frequency): 'light' só o essencial; 'full' o roteiro
// do treino mais os comentários sobre o andamento; 'free' ("à vontade") também
// as falas em que ele toma a iniciativa (FREE_EVENTS).
//
// As preferências ficam no perfil (user_metadata, para acompanhar a conta) e
// numa cópia local (`coach_prefs`) que o treino lê de forma síncrona. A cópia é
// preenchida por syncCoachPrefs().
import { speak, cancelSpeech, isVoiceSupported } from './voice';
import { lang } from './i18n';
import { PHRASES, LIGHT_EVENTS, FREE_EVENTS, TONES } from '../data/coachPhrases';

export const FREQUENCIES = ['light', 'full', 'free'];
// Falas do fim do treino: são agendadas no instante em que o modo ao vivo fecha.
export const FINISH_EVENTS = ['finish', 'finishStats', 'weekGoal'];
// Descanso mínimo para caber uma dica depois da fala do descanso, sem atropelar
// o aviso dos dez segundos.
const TIP_MIN_REST_SECONDS = 45;
const TIP_CHANCE = 0.35;
const TIP_MAX_LENGTH = 120;

const STORAGE_KEY = 'coach_prefs';
// voiceName: voz escolhida à mão neste aparelho ('' = automática pelo gênero). Os nomes das
// vozes mudam de aparelho para aparelho, por isso não vai para a conta.
const DEFAULTS = { enabled: false, voiceName: '', tone: 'animado', frequency: 'full', rate: 1, name: '' };
// Ajuste fino de timbre por tom: o animado é mais agudo e rápido, o calmo mais lento.
const DELIVERY = {
  animado: { rate: 1.05, pitch: 1.08 },
  zoeira: { rate: 1.1, pitch: 1.12 },
  calmo: { rate: 0.95, pitch: 1 },
};
const RECENT_MEMORY = 2;

export function isCoachAvailable() {
  return lang === 'pt' && isVoiceSupported();
}

export function getCoachPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveCoachPrefs(partial) {
  const next = { ...getCoachPrefs(), ...partial };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* sem storage */ }
  return next;
}

// Primeiro nome falado: apelido, senão o primeiro nome. Nunca o e-mail.
function spokenName(md = {}) {
  const raw = (md.apelido || md.nome || '').trim();
  return raw.split(/\s+/)[0] || '';
}

// Copia as preferências do perfil (conta) para o aparelho.
export function syncCoachPrefs(user) {
  const md = user?.user_metadata || {};
  const next = {
    name: spokenName(md),
    ...(md.coachEnabled !== undefined && { enabled: !!md.coachEnabled }),
    ...(TONES.includes(md.coachTone) && { tone: md.coachTone }),
    ...(FREQUENCIES.includes(md.coachFrequency) && { frequency: md.coachFrequency }),
    ...(Number.isFinite(md.coachRate) && { rate: md.coachRate }),
  };
  return saveCoachPrefs(next);
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

// "90" -> "1 minuto e 30 segundos"; a voz lê melhor por extenso.
export function speechTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const sec = n => `${n} ${n === 1 ? 'segundo' : 'segundos'}`;
  const min = n => `${n} ${n === 1 ? 'minuto' : 'minutos'}`;
  if (m === 0) return sec(r);
  return r === 0 ? min(m) : `${min(m)} e ${sec(r)}`;
}

// "8-10" -> "8 a 10", "30s" -> "30 segundos", "20min · Moderado" -> "20 minutos, Moderado".
export function speechReps(reps) {
  return String(reps ?? '')
    .replace(/(\d)\s*-\s*(\d)/g, '$1 a $2')
    .replace(/(\d)\s*min\b/gi, '$1 minutos')
    .replace(/(\d)\s*s\b/gi, '$1 segundos')
    .replace(/\s*·\s*/g, ', ')
    .trim();
}

// "🔷 Prancha" -> "Prancha"
export function speechExercise(nome) {
  return String(nome ?? '').replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim();
}

// "3 séries de 8 a 10" (ou só as repetições, em cardio e itens sem série).
export function speechDetail(ex) {
  const n = parseInt(ex?.series, 10);
  const reps = speechReps(ex?.reps);
  if (Number.isFinite(n) && n > 0) {
    return `${n} ${n === 1 ? 'série' : 'séries'}${reps ? ` de ${reps}` : ''}`;
  }
  return reps;
}

// 42.5 -> "42,5": com vírgula a voz lê "quarenta e dois vírgula cinco".
export function speechLoad(kg) {
  return String(kg ?? '').replace('.', ',');
}

// Dica técnica do exercício pronta para a fala: "Cadência 2-0-2" -> "cadência 2, 0, 2".
// Devolve '' quando não há o que falar (vazia ou longa demais para o descanso).
export function speechTip(tecnica) {
  const text = speechExercise(tecnica)
    .replace(/\bfull rom\b/gi, 'amplitude completa')
    .replace(/\brom\b/gi, 'amplitude')
    .replace(/(\d)\s*-\s*(?=\d)/g, '$1, ')
    .replace(/[.!\s]+$/, '');
  if (!text || text === '-' || text.length > TIP_MAX_LENGTH) return '';
  return text.charAt(0).toLowerCase() + text.slice(1);
}

// O que dizer ao fechar uma série, do mais marcante para o mais comum.
// `crossedHalf`: esta série fez o treino passar da metade.
export function setDoneEvent({ leftInExercise, leftInWorkout, crossedHalf }) {
  if (leftInWorkout === 0) return 'allDone';
  if (leftInExercise === 0) return 'exerciseDone';
  if (crossedHalf) return 'halfway';
  if (leftInExercise === 1) return 'lastSet';
  return 'rest';
}

// Comentário sobre a semana logo depois da abertura do treino, ou null.
export function weekEvent({ done, total }) {
  if (!(total > 1)) return null;
  if (done === 0) return 'weekFirst';
  if (total - done === 1) return 'weekLast';
  return null;
}

const recent = new Map();

function fill(line, vars) {
  return line
    .replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== '' ? String(vars[k]) : m))
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function pickLine(lines, key, vars, random = Math.random) {
  // Só entram falas cujos placeholders temos como preencher.
  const usable = lines.filter(l => [...l.matchAll(/\{(\w+)\}/g)].every(m => vars[m[1]] !== undefined && vars[m[1]] !== ''));
  const pool = usable.length ? usable : lines;
  const seen = recent.get(key) || [];
  const fresh = pool.filter(l => !seen.includes(l));
  const choices = fresh.length ? fresh : pool;
  const line = choices[Math.floor(random() * choices.length)];
  recent.set(key, [...seen, line].slice(-RECENT_MEMORY));
  return line;
}

// Monta a fala sem falar (usado nos testes e na amostra).
export function buildLine(event, data = {}, prefs = getCoachPrefs(), random = Math.random) {
  const lines = PHRASES[prefs.tone]?.[event];
  if (!lines) return null;
  const vars = {
    nome: prefs.name,
    saudacao: greeting(),
    ...data,
  };
  const line = pickLine(lines, `${prefs.tone}:${event}`, vars, random);
  return fill(line, vars);
}

// Fala uma situação do treino. Devolve true se falou. `delayMs` serve para a
// fala do fim do descanso sair depois do alarme sonoro, sem sobrepor.
// Falas agendadas (id do timer -> situação), para poder cancelá-las ao sair do treino.
const pending = new Map();

function speaksAt(event, frequency) {
  if (frequency === 'light') return LIGHT_EVENTS.includes(event);
  if (frequency === 'free') return true;
  return !FREE_EVENTS.includes(event);
}

export function coachSay(event, data = {}, { delayMs = 0, force = false, queue = false } = {}) {
  if (!isCoachAvailable()) return false;
  const prefs = getCoachPrefs();
  if (!force && !prefs.enabled) return false;
  if (!force && !speaksAt(event, prefs.frequency)) return false;
  const text = buildLine(event, data, prefs);
  if (!text) return false;
  const delivery = DELIVERY[prefs.tone] || DELIVERY.animado;
  const run = () => speak(text, { voiceName: prefs.voiceName, rate: delivery.rate * prefs.rate, pitch: delivery.pitch, queue });
  if (delayMs > 0) {
    const id = setTimeout(() => { pending.delete(id); run(); }, delayMs);
    pending.set(id, event);
  } else {
    run();
  }
  return true;
}

// `keep`: situações agendadas que continuam valendo (ex.: a fala de fim de treino
// é agendada no mesmo instante em que o modo ao vivo fecha).
export function coachStop({ keep = [] } = {}) {
  pending.forEach((event, id) => {
    if (keep.includes(event)) return;
    clearTimeout(id);
    pending.delete(id);
  });
  cancelSpeech();
}

// Fala a carga da última vez e a sugestão de hoje (mesmos dados do aviso na
// tela); estagnação tem prioridade, como lá. Entra na fila, depois da
// apresentação do exercício.
export function coachSuggest(suggestion, plateau) {
  if (plateau) {
    return coachSay('plateau', { carga: speechLoad(plateau.lastCarga), sugestao: speechLoad(plateau.suggestedDeload) }, { queue: true });
  }
  if (!suggestion) return false;
  return coachSay(suggestion.suggestedReps ? 'suggestReps' : 'suggestLoad', {
    ultimaCarga: speechLoad(suggestion.lastCarga),
    ultimasReps: suggestion.lastReps,
    sugestao: speechLoad(suggestion.suggestedCarga),
    repsAlvo: suggestion.suggestedReps ?? undefined,
  }, { queue: true });
}

// Dica durante o descanso (modo "à vontade"): a técnica do exercício na primeira
// vez (`techniqueSaid` = já foi dita neste treino), depois uma dica geral de vez
// em quando. Devolve a situação falada, ou null.
export function coachRestTip({ tecnica, seconds, techniqueSaid }, random = Math.random) {
  if (seconds < TIP_MIN_REST_SECONDS) return null;
  const dica = techniqueSaid ? '' : speechTip(tecnica);
  if (dica) return coachSay('technique', { dica }, { queue: true }) ? 'technique' : null;
  if (random() >= TIP_CHANCE) return null;
  return coachSay('tip', {}, { queue: true }) ? 'tip' : null;
}

// Amostra para a tela de configuração: usa as escolhas atuais mesmo com a voz desligada.
export function coachSample() {
  return coachSay('start', { foco: 'Peito' }, { force: true });
}
