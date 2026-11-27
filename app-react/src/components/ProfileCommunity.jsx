import UiIcon from './UiIcon';
import CollapsibleCard from './CollapsibleCard';
import ProfileFeedbackSection from './ProfileFeedbackSection';
import { useAppConfig } from '../context/useAppConfig';
import { isFlagOn } from '../lib/appConfig';
import { shareInvite } from '../lib/invite';
import { startTutorial } from '../lib/tutorial';
import { t } from '../lib/i18n';

// Atalho do Perfil em forma de cartão: ícone, título, resumo e seta.
export function ShortcutCard({ icon, title, summary, onClick }) {
  return (
    <button type="button" className="shortcut-card" onClick={onClick}>
      <span className="collapse__icon" aria-hidden="true"><UiIcon icon={icon} /></span>
      <span className="collapse__text">
        <span className="collapse__title">{title}</span>
        <span className="collapse__summary">{summary}</span>
      </span>
      <span className="collapse__chevron" aria-hidden="true">›</span>
    </button>
  );
}

// "Comunidade e ajuda": convidar amigos, enviar feedback e rever o tutorial num
// grupo só. Convite e feedback são ligados pelo painel admin (flags
// convite_amigos e feedback); o tutorial só existe nos esportes que o têm.
// `cardToOpen`: atalho vindo de uma notificação que abre o feedback.
export function CommunityGroup({ user, toast, usesWorkouts, cardToOpen, showTutorial }) {
  const { config } = useAppConfig();
  const showInvite = isFlagOn(config.flags, 'convite_amigos');
  const showFeedback = isFlagOn(config.flags, 'feedback');

  async function handleInvite() {
    const result = await shareInvite();
    if (result === 'copied') toast(t('🔗 Link copiado — cole na conversa com seus amigos'));
    else if (result === 'failed') toast(t('⚠️ Não deu pra compartilhar. Mande o link eafit.com.br'));
  }

  if (!showInvite && !showFeedback && !showTutorial) return null;

  return (
    <div className="section-group">
      <div className="section-group__label">{t('Comunidade e ajuda')}</div>
      {showInvite && (
        <ShortcutCard
          icon="🤝" title={t('Convidar amigos')} onClick={handleInvite}
          summary={usesWorkouts ? t('Mande o link do EAFIT pra quem treina com você') : t('Mande o link do EAFIT pra quem corre com você')}
        />
      )}
      {showFeedback && (
        <CollapsibleCard icon="💬" title={t('Enviar feedback')} summary={t('Sugestão, problema ou elogio')} defaultOpen={cardToOpen === 'feedback'}>
          <ProfileFeedbackSection userId={user.id} toast={toast} />
        </CollapsibleCard>
      )}
      {showTutorial && (
        <ShortcutCard
          icon="🎓" title={t('Ver tutorial')} onClick={startTutorial}
          summary={t('Passo a passo de todas as funções do app')}
        />
      )}
    </div>
  );
}
