import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { useReminders } from '../hooks/useReminders';
import { isNotificationSupported } from '../lib/notifications';
import { getDisplayName } from '../lib/utils';
import { startTutorial } from '../lib/tutorial';
import { fetchInfluencerRanking, setRankingPublic } from '../lib/influencerRanking';

import { t } from '../lib/i18n';
// Conta do influenciador: código, troca para o modo aluno, avisos de novos
// cadastros, ajuda e saída.
export default function InfluencerAccount({ amb, onSwitchToStudent }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [notifyOn, toggleNotify] = useReminders(toast, user);
  // null = ainda carregando (o valor vem da linha da própria pessoa no ranking)
  const [rankingPublic, setRankingPublicState] = useState(null);
  const [savingRanking, setSavingRanking] = useState(false);

  useEffect(() => {
    let active = true;
    fetchInfluencerRanking(0)
      .then(rows => { if (active) setRankingPublicState(!!rows.find(r => r.me)?.public); })
      .catch(err => console.error('fetchInfluencerRanking:', err));
    return () => { active = false; };
  }, []);

  async function toggleRanking(value) {
    setSavingRanking(true);
    setRankingPublicState(value);
    try {
      await setRankingPublic(value);
      toast(value ? t('✅ Seu nome aparece no ranking') : t('✅ Você aparece como anônimo no ranking'));
    } catch {
      setRankingPublicState(!value);
      toast(t('❌ Não foi possível salvar'));
    } finally {
      setSavingRanking(false);
    }
  }

  return (
    <section className="page active trainer-page">
      <div className="dash-card">
        <div className="dash-card__title">{t('📣 Modo Influenciador')}</div>
        <p className="profile-field__hint" style={{ marginTop: 0 }}>
          {getDisplayName(user)}<br />{user?.email}
          {amb?.code && <><br />{t('Seu código')}: <strong>{amb.code}</strong></>}
        </p>
        <p className="profile-field__hint">
          {t('Quer treinar também? Troque para o modo aluno para usar o app de treino normal. Você volta ao modo Influenciador pelo botão no topo.')}
        </p>
        <button type="button" className="btn btn--primary btn--full" onClick={onSwitchToStudent}>{t('Usar como aluno')}</button>
      </div>

      <div className="dash-card">
        <div className="dash-card__title">{t('🔔 Notificações')}</div>
        <p className="profile-field__hint" style={{ marginTop: 0 }}>
          {t('Receba uma notificação quando alguém criar conta pelo seu link (só o número, nunca quem foi) e quando a equipe EAFIT mandar um recado.')}
        </p>
        <button type="button" className={notifyOn ? 'btn btn--outline btn--full' : 'btn btn--primary btn--full'}
          disabled={!isNotificationSupported()} onClick={toggleNotify}>
          {notifyOn ? t('🔕 Desativar notificações neste aparelho') : t('🔔 Ativar notificações neste aparelho')}
        </button>
      </div>

      <div className="dash-card">
        <div className="dash-card__title">{t('🏁 Ranking')}</div>
        <label className="trainer-consent">
          <input type="checkbox" checked={!!rankingPublic} disabled={rankingPublic === null || savingRanking}
            onChange={e => toggleRanking(e.target.checked)} />
          <span><strong>{t('Mostrar meu nome no ranking')}</strong><br />
            {t('Desligado, os outros influenciadores veem você como anônimo. Seus números continuam contando.')}</span>
        </label>
      </div>

      <div className="dash-card">
        <div className="dash-card__title">{t('🎓 Ajuda')}</div>
        <p className="profile-field__hint" style={{ marginTop: 0 }}>{t('Reveja o passo a passo de todas as funções do painel.')}</p>
        <button type="button" className="btn btn--outline btn--full" onClick={startTutorial}>{t('Ver tutorial')}</button>
      </div>

      <button type="button" className="btn btn--outline btn--full" onClick={logout}>{t('Sair da conta')}</button>
    </section>
  );
}
