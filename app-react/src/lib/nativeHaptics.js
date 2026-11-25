import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { isNative } from './native';

// Vibração: no app Android usa o motor nativo, que vibra mesmo quando o aviso não
// vem de um toque (fim do descanso, troca de fase). O navigator.vibrate da WebView
// exige gesto recente do usuário. No navegador/PWA segue o navigator.vibrate.
// pattern: [vibra, pausa, vibra, ...] em ms, o mesmo formato do navigator.vibrate.
let run = 0;

export function vibratePattern(pattern) {
  if (!isNative()) {
    try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern); } catch { /* sem vibração */ }
    return;
  }
  const mine = ++run;
  const list = Array.isArray(pattern) ? pattern : [pattern];
  (async () => {
    for (let i = 0; i < list.length && mine === run; i++) {
      const ms = list[i];
      try {
        if (i % 2 === 0) await Haptics.vibrate({ duration: ms });
      } catch { return; /* sem o plugin */ }
      await new Promise(r => setTimeout(r, ms));
    }
  })();
}

// Toque curto ao marcar uma série. Só no app: na web uma vibração a cada toque incomoda.
export function hapticTap() {
  if (!isNative()) return;
  Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
}
