// Vibração da corrida ao vivo: avisa sem depender da voz (desligada, música
// alta, celular no braço). Cada aviso tem um padrão diferente para dar para
// distinguir sem olhar a tela. Sem suporte (iPhone, desktop) não faz nada.

export const BUZZ = {
  km: [200, 100, 200],
  run: [120, 60, 120],
  walk: [300],
  step: [150, 80, 150, 80, 150],
  pause: [250],
  resume: [100, 60, 100],
  done: [120, 60, 120, 60, 250],
  battery: [400, 120, 400],
};

export function buzz(kind) {
  try {
    const pattern = BUZZ[kind];
    if (pattern && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
  } catch { /* vibração indisponível */ }
}
