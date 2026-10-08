import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../lib/modalRoot';
import { useToast } from '../context/useToast';
import { useBackToClose } from '../hooks/useBackToClose';
import { sendFeedback, friendlyFeedbackError } from '../lib/feedback';
import { shareInvite } from '../lib/invite';
import {
  COMMENT_MAX, buildRatingFeedback, markAppRatingAnswered, markAppRatingDismissed,
} from '../lib/appRating';

import { t } from '../lib/i18n';
const STARS = [1, 2, 3, 4, 5];

// Pedido de avaliação do app (ver lib/appRating.js): estrelas, comentário
// opcional e, pra quem gostou, o convite pra indicar o app a um amigo.
export default function AppRatingModal({ userId, onClose }) {
  const toast = useToast();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  // Fechar sem avaliar conta como "Agora não".
  function handleClose() {
    if (!sent) markAppRatingDismissed();
    onClose();
  }
  useBackToClose(handleClose);

  async function handleSend() {
    const { kind, message } = buildRatingFeedback(stars, comment);
    setError('');
    setSending(true);
    try {
      await sendFeedback(userId, kind, message);
      markAppRatingAnswered();
      setSent(true);
    } catch (err) {
      setError(friendlyFeedbackError(err));
    } finally {
      setSending(false);
    }
  }

  async function handleInvite() {
    const result = await shareInvite();
    if (result === 'copied') toast(t('🔗 Link copiado — cole na conversa com seus amigos'));
    else if (result === 'failed') toast(t('⚠️ Não deu pra compartilhar. Mande o link elinaldoa.github.io/EAFIT/landing'));
  }

  const liked = stars >= 4;

  return createPortal(
    <div className="rating-modal" role="dialog" aria-modal="true" aria-labelledby="app-rating-title">
      <div className="rating-modal__backdrop" onClick={handleClose} />
      <div className="rating-modal__panel">
        <div className="rating-modal__header">
          <h3 className="rating-modal__title" id="app-rating-title">
            {sent ? t('Obrigado pela avaliação!') : t('Está gostando do EAFIT?')}
          </h3>
          <button type="button" className="rating-modal__close" aria-label={t('Fechar')} onClick={handleClose}>✕</button>
        </div>

        {sent ? (
          <>
            <p className="app-rating__text">
              {liked
                ? t('Que bom que você está curtindo! Indique o EAFIT pra quem treina com você.')
                : t('Sua opinião ajuda a gente a melhorar o app. Vamos ler com atenção.')}
            </p>
            {liked && (
              <button type="button" className="btn btn--primary btn--full" onClick={handleInvite}>{t('📤 Indicar para um amigo')}</button>
            )}
            <button type="button" className={`btn ${liked ? 'btn--ghost' : 'btn--primary'} btn--full`} onClick={handleClose}>{t('Fechar')}</button>
          </>
        ) : (
          <>
            <p className="app-rating__text">{t('Sua nota ajuda a gente a melhorar o app. Leva só um toque.')}</p>
            <div className="app-rating__stars" role="group" aria-label={t('Nota de 1 a 5')}>
              {STARS.map(n => (
                <button
                  key={n}
                  type="button"
                  className={`app-rating__star${n <= stars ? ' app-rating__star--on' : ''}`}
                  aria-label={n === 1 ? t('1 estrela') : t('{n} estrelas', { n })}
                  aria-pressed={stars === n}
                  onClick={() => setStars(n)}
                >
                  ★
                </button>
              ))}
            </div>
            {stars > 0 && (
              <textarea
                className="input input--sm" rows={3} maxLength={COMMENT_MAX}
                aria-label={t('Comentário (opcional)')}
                placeholder={liked ? t('O que você mais gosta? (opcional)') : t('O que podemos melhorar? (opcional)')}
                value={comment} onChange={e => setComment(e.target.value)}
              />
            )}
            {error && <p className="app-rating__text" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
            <button type="button" className="btn btn--primary btn--full" disabled={!stars || sending} onClick={handleSend}>
              {sending ? t('Enviando…') : t('Enviar avaliação')}
            </button>
            <button type="button" className="btn btn--ghost btn--full" disabled={sending} onClick={handleClose}>{t('Agora não')}</button>
          </>
        )}
      </div>
    </div>,
    getModalRoot()
  );
}
