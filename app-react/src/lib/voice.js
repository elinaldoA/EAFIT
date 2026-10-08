import { trackFeature } from './tracking';
// Camada de voz do treinador: só fala (speechSynthesis) e escolhe a melhor voz
// pt-BR do aparelho. Não conhece treino nem frases — isso fica em coach.js.
//
// O navegador não informa o gênero das vozes, só o nome. A tabela abaixo
// reconhece as vozes mais comuns (Windows/Edge, macOS/iOS, Android/Chrome).
const FEMALE = /francisca|thalita|giovanna|let[ií]cia|maria|luciana|vit[oó]ria|helo[ií]sa|raquel|yara|fernanda|google portugu[eê]s|female|feminin/i;
const MALE = /antonio|ant[oô]nio|ricardo|j[uú]lio|daniel|felipe|donato|humberto|male\b|masculin/i;
// Vozes "neurais"/online soam bem mais naturais que as locais antigas.
const NATURAL = /natural|neural|online|enhanced|premium|aprimorada/i;

export function isVoiceSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function voiceGender(voice) {
  const name = voice?.name || '';
  if (MALE.test(name)) return 'male';
  if (FEMALE.test(name)) return 'female';
  return null;
}

function langScore(voice) {
  const l = (voice.lang || '').replace('_', '-').toLowerCase();
  if (l === 'pt-br') return 2;
  if (l.startsWith('pt')) return 1;
  return 0;
}

// Voz escolhida à mão (voiceName) ou, sem escolha, a melhor em português do
// aparelho: pt-BR e "natural/neural" primeiro. Sem voz em português, null.
export function pickVoice(voices, voiceName = '') {
  const pt = (voices || []).filter(v => langScore(v) > 0);
  if (!pt.length) return null;
  const chosen = voiceName && pt.find(v => v.name === voiceName);
  if (chosen) return chosen;
  const rank = v => langScore(v) * 10 + (NATURAL.test(v.name) ? 5 : 0) + (v.localService ? 0 : 1);
  return [...pt].sort((a, b) => rank(b) - rank(a))[0];
}

function loadVoices() {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  // Chrome carrega a lista de forma assíncrona.
  return new Promise(resolve => {
    const done = () => { synth.removeEventListener('voiceschanged', done); resolve(synth.getVoices()); };
    synth.addEventListener('voiceschanged', done);
    setTimeout(done, 1500);
  });
}

// Vozes em português do aparelho, para escolha manual (melhores primeiro).
export async function listPtVoices() {
  if (!isVoiceSupported()) return [];
  const voices = (await loadVoices()).filter(v => langScore(v) > 0);
  return voices
    .sort((a, b) => langScore(b) - langScore(a) || Number(NATURAL.test(b.name)) - Number(NATURAL.test(a.name)))
    .map(v => ({ name: v.name, lang: v.lang, gender: voiceGender(v) }));
}

export function cancelSpeech() {
  if (isVoiceSupported()) window.speechSynthesis.cancel();
}

// Fala o texto; por padrão uma fala nova interrompe a anterior (evita fila
// atrasada). Com queue=true entra na fila e espera a atual terminar.
export async function speak(text, { voiceName = '', rate = 1, pitch = 1, volume = 1, queue = false } = {}) {
  if (!isVoiceSupported() || !text) return false;
  try {
    const voice = pickVoice(await loadVoices(), voiceName);
    if (!voice) return false;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang || 'pt-BR';
    u.rate = rate;
    u.pitch = pitch;
    u.volume = volume;
    if (!queue) window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    trackFeature('voice_coach');
    return true;
  } catch {
    return false;
  }
}
