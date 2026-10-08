import { useEffect, useState } from 'react';
import { useToast } from '../context/useToast';
import { useAppConfig } from '../context/useAppConfig';
import { isFlagOn } from '../lib/appConfig';
import {
  fetchMyFriends, fetchMyFriendProfile, shareFriendCode, requestFriend, normalizeFriendCode, friendlyFriendError,
} from '../lib/friends';
import {
  shouldOfferFriends, recentlyDismissed, readFriendsPromptDismissedAt, markFriendsPromptDismissed,
} from '../lib/friendsPrompt';

import { t } from '../lib/i18n';
const BENEFITS = [
  ['🏆', t('Ranking da semana entre vocês')],
  ['📣', t('Feed com os treinos e recordes de cada um')],
  ['🔥', t('Reações pra dar aquela força')],
];

// Convite dentro do resumo do treino pra quem ainda não tem amigos (ver
// shouldOfferFriends): mostra como fica o ranking com um amigo, manda o código
// pessoal (como o botão de Dashboard → Amigos) ou adiciona pelo código do amigo.
// myWeek = treinos da pessoa na semana, pra prévia do ranking.
export default function FriendsPrompt({ myWeek = 0 }) {
  const toast = useToast();
  const { config } = useAppConfig();
  const flagOn = isFlagOn(config.flags, 'amigos');
  const [info, setInfo] = useState(null); // { code, friendCount }
  const [hidden, setHidden] = useState(false);
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!flagOn || recentlyDismissed(readFriendsPromptDismissedAt())) return undefined;
    let active = true;
    // Falha (offline, sem a função no banco) simplesmente não mostra o convite.
    Promise.resolve().then(() => Promise.all([fetchMyFriends(), fetchMyFriendProfile()]))
      .then(([friends, profile]) => { if (active) setInfo({ code: profile.code, friendCount: friends.length }); })
      .catch(() => {});
    return () => { active = false; };
  }, [flagOn]);

  const offer = !hidden && !!info && shouldOfferFriends({
    flagOn, friendCount: info.friendCount, dismissedAt: readFriendsPromptDismissedAt(),
  });
  if (!offer) return null;

  function handleDismiss() {
    markFriendsPromptDismissed();
    setHidden(true);
  }

  async function handleInvite() {
    const result = await shareFriendCode(info.code);
    if (result === 'cancelled') return;
    if (result === 'copied') toast(t('📋 Convite copiado — cole na conversa com seu amigo'));
    else if (result === 'failed') toast(t('Código: {code}', { code: info.code }));
    handleDismiss();
  }

  async function handleAdd() {
    const c = normalizeFriendCode(code);
    if (c.length < 4) { setError(t('Digite o código do seu amigo.')); return; }
    setBusy(true); setError('');
    try {
      const res = await requestFriend(c);
      toast(res === 'accepted' ? t('🎉 Vocês agora são amigos!') : res === 'already' ? t('Pedido já enviado ou já são amigos') : t('📨 Pedido enviado!'));
      handleDismiss();
    } catch (err) {
      setError(friendlyFriendError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="friends-invite">
      <div className="friends-invite__head">
        <div className="friends-invite__avatars" aria-hidden="true">
          <span className="friends-invite__avatar">💪</span>
          <span className="friends-invite__avatar friends-invite__avatar--empty">+</span>
        </div>
        <div>
          <div className="friends-invite__title">{t('Treine com um amigo')}</div>
          <p className="friends-invite__text">{t('Com alguém acompanhando, fica mais difícil faltar. Chame um amigo pra disputar a semana com você.')}</p>
        </div>
      </div>

      <div className="friends-invite__preview">
        <div className="friends-invite__label">{t('Seu ranking da semana')}</div>
        <div className="friends-invite__rank friends-invite__rank--me">
          <span>{t('{rank}º {name}', { rank: 1, name: t('Você') })}</span><strong>{t('{n} treino(s)', { n: myWeek })}</strong>
        </div>
        <div className="friends-invite__rank friends-invite__rank--empty">
          <span>{t('{rank}º {name}', { rank: 2, name: t('Seu amigo aqui') })}</span><strong>?</strong>
        </div>
      </div>

      <ul className="friends-invite__benefits">
        {BENEFITS.map(([icon, label]) => (
          <li key={label}><span aria-hidden="true">{icon}</span>{label}</li>
        ))}
      </ul>

      <div className="friends-invite__code">
        <span>{t('Seu código:')}</span>
        <strong className="friends__code">{info.code}</strong>
      </div>

      <button type="button" className="btn btn--primary btn--full" onClick={handleInvite}>{t('📤 Convidar amigo')}</button>

      {adding ? (
        <div className="friends-invite__add">
          <input
            className="input input--sm" placeholder={t('Código do seu amigo')} maxLength={12} autoCapitalize="characters"
            value={code} onChange={e => setCode(e.target.value)} aria-label={t('Código do seu amigo')}
          />
          <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={handleAdd}>
            {busy ? t('Enviando…') : t('Adicionar amigo')}
          </button>
        </div>
      ) : null}
      {error && <p className="friends-invite__text" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}

      <div className="friends-invite__links">
        {!adding && <button type="button" className="link-btn" onClick={() => setAdding(true)}>{t('Já tenho o código de um amigo')}</button>}
        <button type="button" className="link-btn friends-invite__later" onClick={handleDismiss}>{t('Agora não')}</button>
      </div>
    </div>
  );
}
