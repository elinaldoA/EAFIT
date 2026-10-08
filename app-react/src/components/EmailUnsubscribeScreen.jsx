import { useEffect, useState } from 'react';
import { unsubscribeEmail } from '../lib/emailUnsubscribe';
import { t } from '../lib/i18n';

// Tela cheia aberta pelo link de descadastro do rodapé dos e-mails (ver
// lib/emailUnsubscribe.js): cancela na hora, sem pedir login, e mostra o
// resultado. Reaproveita as classes da splash (.boot), como MovedScreen.
export default function EmailUnsubscribeScreen({ token, onClose }) {
  const [state, setState] = useState('working');

  useEffect(() => {
    let active = true;
    unsubscribeEmail(token).then(ok => { if (active) setState(ok ? 'done' : 'error'); });
    return () => { active = false; };
  }, [token]);

  return (
    <div className="boot maintenance" role="status">
      <img src={`${import.meta.env.BASE_URL}icon-maskable-192.png`} alt="" />
      <div className="boot__name">EAFIT</div>
      {state === 'working' && <p className="maintenance__text">{t('Cancelando o envio de e-mails…')}</p>}
      {state === 'done' && (
        <>
          <h1 className="maintenance__title">{t('Pronto, você não vai mais receber esses e-mails')}</h1>
          <p className="maintenance__text">
            {t('Paramos de enviar o resumo semanal, os convites para voltar a treinar e as novidades. E-mails sobre a sua conta, como redefinição de senha, continuam chegando.')}
          </p>
          <p className="maintenance__text">{t('Mudou de ideia? É só ligar de novo em Perfil → Notificações.')}</p>
        </>
      )}
      {state === 'error' && (
        <>
          <h1 className="maintenance__title">{t('Não foi possível cancelar agora')}</h1>
          <p className="maintenance__text">
            {t('O link pode estar incompleto ou a conexão falhou. Você também pode desligar os e-mails em Perfil → Notificações.')}
          </p>
        </>
      )}
      {state !== 'working' && (
        <button className="btn btn--primary" type="button" onClick={onClose}>{t('Continuar para o app')}</button>
      )}
    </div>
  );
}
