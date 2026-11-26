import { registerPlugin } from '@capacitor/core';

// Voz nativa do Android para o treinador por voz e a corrida (plugin
// @capacitor-community/text-to-speech). O WebView do app nem sempre tem vozes em
// português na `speechSynthesis` do navegador (Redmi/Xiaomi sem o Google TTS, por
// exemplo) e a fala some em silêncio; o motor de voz do sistema, não.
// Sem o plugin instalado no app (ou sem o idioma), `nativeSpeakAll` devolve false e
// quem chamou cai na voz do navegador.
const TextToSpeech = registerPlugin('TextToSpeech');

let supported = null;

async function checkSupport() {
  if (supported !== null) return supported;
  try {
    const r = await TextToSpeech.isLanguageSupported({ lang: 'pt-BR' });
    supported = r?.supported !== false;
  } catch {
    supported = false; // plugin ausente no app
  }
  return supported;
}

// Para os testes.
export const resetNativeSpeech = () => { supported = null; };

// `items`: [{ text, rate, pitch }] — cada frase com a sua entonação. A primeira
// interrompe a fala atual (a menos que `queue`), as demais entram na fila.
export async function nativeSpeakAll(items, { volume = 1, queue = false } = {}) {
  if (!items?.length || !(await checkSupport())) return false;
  items.forEach((it, i) => {
    // Não espera: a promessa só resolve quando a frase termina.
    TextToSpeech.speak({
      text: it.text,
      lang: 'pt-BR',
      rate: it.rate,
      pitch: it.pitch,
      volume,
      category: 'ambient',
      queueStrategy: queue || i > 0 ? 1 : 0,
    }).catch(() => { /* fala interrompida por outra: normal */ });
  });
  return true;
}

export function nativeStop() {
  TextToSpeech.stop().catch(() => { /* plugin ausente */ });
}
