import { useCallback, useEffect, useState } from 'react';
import { getLock, isFreshLogin, RELOCK_AFTER_MS } from '../lib/biometricLock';

// Se a trava de biometria está fechada agora. Fecha ao abrir o app (sessão
// restaurada) e ao voltar depois de RELOCK_AFTER_MS em segundo plano; quem
// acabou de entrar com a senha não vê a trava.
export function useBiometricLock(userId) {
  const uid = userId ?? null;
  const [state, setState] = useState({ userId: null, locked: false });

  // Trocou a conta: decide já no render, senão o app apareceria por um quadro
  // antes da trava.
  let current = state;
  if (state.userId !== uid) {
    current = { userId: uid, locked: !!getLock(uid) && !isFreshLogin(uid) };
    setState(current);
  }

  useEffect(() => {
    if (!uid) return undefined;
    let hiddenAt = null;
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= RELOCK_AFTER_MS && getLock(uid)) {
        setState({ userId: uid, locked: true });
      }
      hiddenAt = null;
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [uid]);

  const unlock = useCallback(() => setState(s => ({ ...s, locked: false })), []);
  return [current.locked, unlock];
}
