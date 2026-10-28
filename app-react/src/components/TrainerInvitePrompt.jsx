import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../context/useToast';
import { useAuth } from '../context/useAuth';
import { fetchMyTrainer, friendlyTrainerError } from '../lib/trainer';
import { visibleInvite, clearPersonalInvite, fetchInviteName, acceptTrainerInvite } from '../lib/trainerInvite';

import { t } from '../lib/i18n';

// Chegou pelo link de convite de um personal: com a conta aberta, pergunta uma
// vez se o aluno autoriza o vínculo. Só na aba aberta pelo link ou para quem se
// cadastrou por ele (ver visibleInvite) — abrir o app direto não cita ninguém.
export default function TrainerInvitePrompt() {
  const toast = useToast();
  const { user } = useAuth();
  const [invite, setInvite] = useState(null); // { code, name }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const code = visibleInvite(user);
    if (!code) return undefined;
    let active = true;
    Promise.all([fetchInviteName(code), fetchMyTrainer()])
      .then(([name, current]) => {
        if (!active) return;
        // código que não é de personal, ou o aluno já tem personal: nada a perguntar
        if (!name || current) { clearPersonalInvite(); return; }
        setInvite({ code, name });
      })
      .catch(() => { /* sem rede: pergunta na próxima abertura */ });
    return () => { active = false; };
  }, [user]);

  if (!invite) return null;

  function close() {
    clearPersonalInvite();
    setInvite(null);
  }

  async function handleAccept() {
    setBusy(true); setError('');
    try {
      await acceptTrainerInvite(invite.code);
      close();
      toast(t('🤝 Vinculado ao seu personal'));
    } catch (err) {
      const msg = String(err?.message || '');
      // o próprio personal abrindo o link dele
      if (msg.includes('self_link')) { close(); return; }
      setError(friendlyTrainerError(err));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="rating-modal" role="dialog" aria-modal="true" aria-labelledby="trainer-invite-title">
      <div className="rating-modal__backdrop" onClick={close} />
      <div className="rating-modal__panel">
        <div className="rating-modal__header">
          <h3 className="rating-modal__title" id="trainer-invite-title">
            {t('🤝 {name} quer acompanhar seu treino', { name: invite.name })}
          </h3>
          <button type="button" className="rating-modal__close" aria-label={t('Fechar')} onClick={close}>✕</button>
        </div>
        <p className="app-rating__text">
          {t('Você chegou pelo convite do seu personal. Autorizando, ele passa a ver seus treinos, peso, medidas, check-ins e desconfortos, e pode enviar treinos e recados. Você pode encerrar o vínculo quando quiser em Perfil → Meu personal.')}
        </p>
        {error && <p className="profile-field__hint text-error" role="alert">{error}</p>}
        <button type="button" className="btn btn--primary btn--full" disabled={busy} onClick={handleAccept}>
          {busy ? t('Vinculando…') : t('Autorizar')}
        </button>
        <button type="button" className="btn btn--ghost btn--full" disabled={busy} onClick={close}>{t('Agora não')}</button>
      </div>
    </div>,
    document.body,
  );
}
