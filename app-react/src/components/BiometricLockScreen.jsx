import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../lib/supabase';
import { getLock, verifyLock, isCancelled } from '../lib/biometricLock';
import PasswordInput from './PasswordInput';

import { t } from '../lib/i18n';
// Tela por cima do app enquanto a trava de biometria está fechada. Fica
// sobreposta (em vez de trocar a tela) para não desmontar um treino em
// andamento quando a trava volta depois de um tempo em segundo plano.
// Sem biometria (sensor sujo, credencial apagada no aparelho), a senha da
// conta também desbloqueia — sem sair da conta nem perder o que não sincronizou.
export default function BiometricLockScreen({ user, onUnlock }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const buttonRef = useRef(null);

  const unlockWithBiometric = useCallback(async () => {
    const lock = getLock(user.id);
    if (!lock) { onUnlock(); return; }
    setBusy(true);
    setError('');
    try {
      if (await verifyLock(lock)) onUnlock();
    } catch (err) {
      if (!isCancelled(err)) setError(t('Não foi possível usar a biometria. Tente de novo ou use a senha.'));
    } finally {
      setBusy(false);
    }
  }, [user.id, onUnlock]);

  // Já abre pedindo a biometria. O Safari só aceita depois de um toque — aí a
  // chamada é recusada em silêncio e fica o botão.
  useEffect(() => {
    buttonRef.current?.focus();
    unlockWithBiometric();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, []);

  async function unlockWithPassword(e) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    const { error: authError } = await db.auth.signInWithPassword({ email: user.email, password });
    setBusy(false);
    if (authError) {
      setError(t('Senha incorreta ou sem conexão.'));
      return;
    }
    onUnlock();
  }

  return (
    <div className="boot bio-lock" role="dialog" aria-modal="true" aria-label={t('App bloqueado')}>
      <img src={`${import.meta.env.BASE_URL}icon-maskable-192.png`} alt="" />
      <div className="boot__name">EAFIT</div>
      <p className="bio-lock__text">{t('App bloqueado. Use a biometria do aparelho para continuar.')}</p>

      {!usePassword ? (
        <>
          <button ref={buttonRef} type="button" className="btn btn--primary" onClick={unlockWithBiometric} disabled={busy}>
            {t('🔓 Desbloquear')}
          </button>
          <button type="button" className="link-btn" onClick={() => { setUsePassword(true); setError(''); }}>
            {t('Usar a senha')}
          </button>
        </>
      ) : (
        <form className="bio-lock__form" onSubmit={unlockWithPassword}>
          <p className="bio-lock__email">{user.email}</p>
          <PasswordInput label={t('Senha')} value={password} onChange={setPassword} autoComplete="current-password" autoFocus />
          <button type="submit" className="btn btn--primary btn--full" disabled={busy || !password}>{t('Desbloquear')}</button>
          <button type="button" className="link-btn" onClick={() => { setUsePassword(false); setError(''); }}>
            {t('Usar a biometria')}
          </button>
        </form>
      )}

      {error && <p className="bio-lock__error" role="alert">{error}</p>}
    </div>
  );
}
