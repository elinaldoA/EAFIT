import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Diálogo modal acessível: Tab e Shift+Tab ficam dentro dele e, ao fechar, o foco
// volta para quem o abriu (senão o teclado "cai" no começo da página).
// `ref` aponta para o elemento do diálogo; `active` é true enquanto ele está aberto.
export function useDialogFocus(ref, active) {
  // Último elemento focado fora do diálogo. Não dá para ler document.activeElement
  // ao abrir: o autoFocus do diálogo já roubou o foco antes do efeito rodar.
  const lastOutside = useRef(null);
  // Enquanto o diálogo está aberto nenhum foco conta como "de fora" (o autoFocus dele
  // dispara antes de `ref` apontar para o elemento).
  const openRef = useRef(false);
  openRef.current = active;

  useEffect(() => {
    const onFocusIn = e => {
      if (!openRef.current) lastOutside.current = e.target;
    };
    document.addEventListener('focus', onFocusIn, true);
    return () => document.removeEventListener('focus', onFocusIn, true);
  }, [ref]);

  useEffect(() => {
    if (!active) return undefined;
    const opener = lastOutside.current;

    function onKey(e) {
      if (e.key !== 'Tab' || !ref.current) return;
      const items = [...ref.current.querySelectorAll(FOCUSABLE)].filter(el => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden'; });
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const inside = ref.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [ref, active]);
}
