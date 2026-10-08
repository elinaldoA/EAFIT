import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { fetchCurrentLegalDate, needsNewAcceptance } from '../lib/legal';

import { t } from '../lib/i18n';
// Tela cheia pedindo um novo aceite quando os Termos ou a Política de
// Privacidade mudam (versão registrada no painel admin). Sem mudança pendente,
// ou sem conseguir consultar, não mostra nada.
export default function TermsUpdateScreen() {
  const { user, updateProfile, logout } = useAuth();
  const [legalDate, setLegalDate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    Promise.resolve().then(fetchCurrentLegalDate)
      .then(d => { if (active) setLegalDate(d); })
      .catch(() => { /* fail-open: sem resposta, não bloqueia */ });
    return () => { active = false; };
  }, [userId]);

  if (!needsNewAcceptance(user, legalDate)) return null;

  async function handleAccept() {
    setBusy(true);
    setError('');
    const { error: err } = await updateProfile({ termsAcceptedAt: new Date().toISOString() });
    if (err) setError(t('Não foi possível registrar. Verifique a conexão e tente de novo.'));
    setBusy(false);
  }

  return (
    <div className="boot maintenance" role="dialog" aria-modal="true" aria-labelledby="terms-update-title">
      <img src={`${import.meta.env.BASE_URL}icon-maskable-192.png`} alt="" />
      <h1 className="maintenance__title" id="terms-update-title">{t('Atualizamos nossos termos')}</h1>
      <p className="maintenance__text">
        {t('Para continuar usando o EAFIT, leia e aceite a versão atual dos')}{' '}
        <a href="legal/termos.html" target="_blank" rel="noopener noreferrer">{t('Termos de Uso')}</a> {t('e da')}{' '}
        <a href="legal/privacidade.html" target="_blank" rel="noopener noreferrer">{t('Política de Privacidade')}</a>.
      </p>
      {error && <p className="maintenance__text" role="alert">{error}</p>}
      <button type="button" className="btn btn--primary" disabled={busy} onClick={handleAccept}>
        {busy ? t('Registrando…') : t('Li e aceito')}
      </button>
      <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={logout}>{t('Sair da conta')}</button>
    </div>
  );
}
