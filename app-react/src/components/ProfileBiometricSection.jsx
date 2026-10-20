import { useState } from 'react';
import { getLock, enableLock, disableLock, isCancelled } from '../lib/biometricLock';
import { trackFeature } from '../lib/tracking';

import { t } from '../lib/i18n';
// Liga/desliga a trava de biometria deste aparelho (lib/biometricLock.js).
// Ligar já pede a biometria, que é quando o sistema cria a credencial.
export default function ProfileBiometricSection({ user, toast, onChange }) {
  const [enabled, setEnabled] = useState(() => !!getLock(user.id));
  const [busy, setBusy] = useState(false);

  async function toggle(e) {
    const on = e.target.checked;
    if (!on) {
      disableLock();
      setEnabled(false);
      onChange?.(false);
      toast(t('🔓 Bloqueio com biometria desativado'));
      return;
    }
    setBusy(true);
    try {
      await enableLock(user);
      trackFeature('bio_lock');
      setEnabled(true);
      onChange?.(true);
      toast(t('🔒 Bloqueio com biometria ativado'));
    } catch (err) {
      if (!isCancelled(err)) toast(t('❌ Não foi possível ativar a biometria neste aparelho'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="profile-field__hint">{t('Ao abrir o app, ou voltar depois de 5 minutos fora, ele pede sua digital, Face ID ou o bloqueio de tela do aparelho. Vale só para este aparelho.')}</p>
      <div className="profile-field profile-field--row">
        <label className="profile-field__label" htmlFor="biometricLock">{t('Pedir biometria para abrir o app')}</label>
        <input type="checkbox" id="biometricLock" checked={enabled} disabled={busy} onChange={toggle} />
      </div>
      <span className="profile-field__hint">{t('Se a biometria falhar, dá para desbloquear com a senha da conta.')}</span>
    </>
  );
}
