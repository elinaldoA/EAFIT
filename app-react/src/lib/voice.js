import { trackFeature } from './tracking';
// Camada de voz do treinador: só fala (speechSynthesis) e escolhe a melhor voz
// pt-BR do aparelho. Não conhece treino nem frases — isso fica em coach.js.
//
// O navegador não informa o gênero das vozes, só o nome. A tabela abaixo
// reconhece as vozes mais comuns (Windows/Edge, macOS/iOS, Android/Chrome).
const FEMALE = /francisca|thalita|giovanna|let[ií]cia|maria|luciana|vit[oó]ria|helo[ií]sa|raquel|yara|fernanda|google portugu[eê]s|female|feminin/i;
const MALE = /antonio|ant[oô]nio|ricardo|j[uú]lio|daniel|felipe|donato|humberto|male\b|masculin/i;
// Vozes "neurais"/online soam bem mais naturais que as locais antigas.
const NATURAL = /natural|neural|online|enhanced|premium|aprimorada|siri/i;
// Vozes antigas, de som claramente sintético: só entram se não houver outra.
const ROBOTIC = /espeak|pico|compact|compacta|desktop/i;

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

export function isNaturalVoice(voice) {
  return NATURAL.test(voice?.name || '');
}

// Quanto a voz soa humana, pelo que o nome e a origem deixam saber: as neurais
// primeiro, depois as que vêm da rede (as do Google no Chrome), as antigas por último.
function qualityScore(voice) {
  const name = voice.name || '';
  return (NATURAL.test(name) ? 5 : 0) + (voice.localService ? 0 : 1) - (ROBOTIC.test(name) ? 4 : 0);
}

// Voz escolhida à mão (voiceName) ou, sem escolha, a melhor em português do
// aparelho: pt-BR e "natural/neural" primeiro. Sem voz em português, null.
export function pickVoice(voices, voiceName = '') {
  const pt = (voices || []).filter(v => langScore(v) > 0);
  if (!pt.length) return null;
  const chosen = voiceName && pt.find(v => v.name === voiceName);
  if (chosen) return chosen;
  const rank = v => langScore(v) * 10 + qualityScore(v);
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
    .sort((a, b) => langScore(b) - langScore(a) || qualityScore(b) - qualityScore(a))
    .map(v => ({ name: v.name, lang: v.lang, gender: voiceGender(v), natural: isNaturalVoice(v) }));
}

export function cancelSpeech() {
  if (isVoiceSupported()) window.speechSynthesis.cancel();
}

// "Boa! Descansa 1 minuto. Bora?" -> ['Boa!', 'Descansa 1 minuto.', 'Bora?'].
// Só corta em pontuação seguida de espaço, para não partir "2.5".
export function splitSentences(text) {
  return (String(text ?? '').match(/\S.*?(?:[.!?…]+(?=\s|$)|$)/g) || []).map(s => s.trim()).filter(Boolean);
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// Entonação de uma frase, como multiplicadores da velocidade e do tom de base.
// Lida inteira no mesmo tom a fala soa robótica; gente sobe na exclamação e na
// pergunta, assenta na afirmação, não corre nas interjeições ("Boa!") e nunca
// diz duas frases exatamente iguais — daí a pequena variação ao acaso.
export function prosody(sentence, random = Math.random) {
  const s = String(sentence ?? '').trim();
  let rate = 1;
  let pitch = 1;
  if (/!$/.test(s)) { rate *= 1.03; pitch *= 1.04; }
  else if (/\?$/.test(s)) { pitch *= 1.05; }
  else { rate *= 0.98; pitch *= 0.98; }
  if (s.split(/\s+/).length <= 2) rate *= 0.95;
  rate *= 1 + (random() - 0.5) * 0.04;
  pitch *= 1 + (random() - 0.5) * 0.05;
  return { rate, pitch };
}

// Fala o texto; por padrão uma fala nova interrompe a anterior (evita fila
// atrasada). Com queue=true entra na fila e espera a atual terminar.
// Cada frase vira uma fala própria, com a sua entonação (ver prosody) e a pausa
// natural entre elas; `rate` e `pitch` são a base sobre a qual ela varia.
export async function speak(text, { voiceName = '', rate = 1, pitch = 1, volume = 1, queue = false, random = Math.random } = {}) {
  if (!isVoiceSupported() || !text) return false;
  try {
    const voice = pickVoice(await loadVoices(), voiceName);
    if (!voice) return false;
    const sentences = splitSentences(text);
    if (!sentences.length) return false;
    if (!queue) window.speechSynthesis.cancel();
    sentences.forEach(sentence => {
      const tune = prosody(sentence, random);
      const u = new SpeechSynthesisUtterance(sentence);
      u.voice = voice;
      u.lang = voice.lang || 'pt-BR';
      u.rate = clamp(rate * tune.rate, 0.6, 1.6);
      u.pitch = clamp(pitch * tune.pitch, 0.7, 1.4);
      u.volume = volume;
      window.speechSynthesis.speak(u);
    });
    trackFeature('voice_coach');
    return true;
  } catch {
    return false;
  }
}
