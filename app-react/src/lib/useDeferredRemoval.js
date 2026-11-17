import { useCallback, useEffect, useRef, useState } from 'react';

// Remoção com "Desfazer" para o que o servidor apaga de vez (não dá para
// recriar): o item some da tela na hora (`hidden`), mas a exclusão só roda
// depois de `delay` ms. `undo(id)` cancela e o item volta. Ao sair da tela
// o que ainda espera é executado na hora, para a remoção não se perder.
export function useDeferredRemoval(delay = 6000) {
  const [hidden, setHidden] = useState(() => new Set());
  const pending = useRef(new Map());

  const unhide = useCallback(id => {
    setHidden(s => { const n = new Set(s); n.delete(id); return n; });
  }, []);

  const commit = useCallback(async id => {
    const item = pending.current.get(id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.current.delete(id);
    try { await item.run(); } finally { unhide(id); }
  }, [unhide]);

  const schedule = useCallback((id, run) => {
    if (pending.current.has(id)) return;
    setHidden(s => new Set(s).add(id));
    pending.current.set(id, { run, timer: setTimeout(() => commit(id), delay) });
  }, [commit, delay]);

  const undo = useCallback(id => {
    const item = pending.current.get(id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.current.delete(id);
    unhide(id);
  }, [unhide]);

  useEffect(() => () => {
    for (const id of [...pending.current.keys()]) commit(id);
  }, [commit]);

  return { hidden, schedule, undo };
}
