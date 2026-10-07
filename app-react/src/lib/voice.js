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

// Melhor voz para o gênero pedido. Sem nenhuma do gênero, cai na melhor voz
// pt-BR disponível (matched=false). Sem voz em português, devolve null.
export function pickVoice(voices, gender, voiceName = '') {
  const pt = (voices || []).filter(v => langScore(v) > 0);
  if (!pt.length) return null;
  // Voz escolhida à mão na configuração: vale sobre o gênero.
  const chosen = voiceName && pt.find(v => v.name === voiceName);
  if (chosen) return { voice: chosen, matched: true };
  const rank = v => langScore(v) * 10 + (NATURAL.test(v.name) ? 5 : 0) + (v.localService ? 0 : 1);
  const byRank = (a, b) => rank(b) - rank(a);
  const same = pt.filter(v => voiceGender(v) === gender).sort(byRank);
  if (same.length) return { voice: same[0], matched: true };
  const rest = [...pt].sort(byRank);
  return { voice: rest[0], matched: false };
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

// Diz se o aparelho tem voz do gênero (para avisar na configuração).
export async function genderAvailable(gender) {
  if (!isVoiceSupported()) return { supported: false, matched: false };
  const picked = pickVoice(await loadVoices(), gender);
  return { supported: !!picked, matched: !!picked?.matched };
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
export async function speak(text, { gender = 'female', voiceName = '', rate = 1, pitch = 1, volume = 1, queue = false } = {}) {
  if (!isVoiceSupported() || !text) return false;
  try {
    const picked = pickVoice(await loadVoices(), gender, voiceName);
    if (!picked) return false;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = picked.voice;
    u.lang = picked.voice.lang || 'pt-BR';
    u.rate = rate;
    u.pitch = pitch;
    u.volume = volume;
    if (!queue) window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}
