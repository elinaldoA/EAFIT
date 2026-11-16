import { useEffect, useState } from 'react';
import CollapsibleCard from './CollapsibleCard';
import ProfileSeasonSection from './ProfileSeasonSection';
import ProfilePauseSection from './ProfilePauseSection';
import ProfileHealthSection from './ProfileHealthSection';
import ProfileBiometricSection from './ProfileBiometricSection';
import ProfileTrainerSection from './ProfileTrainerSection';
import ProfileTrainerRequestSection from './ProfileTrainerRequestSection';
import LanguageSwitch from './LanguageSwitch';
import { NotificationsSection, ExportSection, CoachSection } from './ProfilePreferencesSection';
import { useReminders } from '../hooks/useReminders';
import { useSeason } from '../hooks/useSeason';
import { SEASONS } from '../lib/season';
import { SEASON_DECOR_TITLE } from '../lib/seasonLabels';
import { isBiometricAvailable, getLock } from '../lib/biometricLock';
import { isCoachAvailable } from '../lib/coach';
import { activePause, formatDayBR } from '../lib/pause';
import { todayDate } from '../data/treinoData';
import { t, lang } from '../lib/i18n';

// Grupo "Preferências" do Perfil: tema de temporada, idioma, notificações,
// treinador por voz, modo pausa, saúde (PAR-Q), biometria, personal e backup.
// Cada cartão tem o seu estado aqui dentro; o Perfil só diz quem é a pessoa e
// se o esporte usa treino de musculação (`usesWorkouts`).
export default function ProfilePreferencesGroup({ user, updateProfile, toast, usesWorkouts }) {
  const season = useSeason();
  const [remindersEnabled, toggleReminders] = useReminders(toast, user);
  const [exporting, setExporting] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricOn, setBiometricOn] = useState(() => !!getLock(user?.id));

  useEffect(() => {
    let alive = true;
    isBiometricAvailable().then(ok => { if (alive) setBiometricAvailable(ok); });
    return () => { alive = false; };
  }, []);

  async function handleExport(action, label) {
    if (!user || exporting) return;
    setExporting(true);
    try {
      await action(user.id);
    } catch (err) {
      console.error('export:', err);
      toast(t('⚠️ Erro ao gerar {label}', { label }));
    } finally {
      setExporting(false);
    }
  }

  const pause = activePause(user.user_metadata, todayDate());
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Preferências')}</div>
      {SEASON_DECOR_TITLE[season.available] && (
        <CollapsibleCard icon={SEASONS[season.available].emoji} title={SEASON_DECOR_TITLE[season.available]()} summary={season.off ? t('Desativado') : t('Ativado')}>
          <ProfileSeasonSection theme={season.available} off={season.off} />
        </CollapsibleCard>
      )}
      <CollapsibleCard icon="🌐" title={t('Idioma')} summary={lang === 'en' ? 'English' : 'Português'}>
        <LanguageSwitch />
      </CollapsibleCard>
      <CollapsibleCard icon="🔔" title={t('Notificações')} summary={remindersEnabled ? t('Ativadas') : t('Desativadas')}>
        <NotificationsSection
          user={user} updateProfile={updateProfile} toast={toast}
          remindersEnabled={remindersEnabled} toggleReminders={toggleReminders}
          running={!usesWorkouts}
        />
      </CollapsibleCard>
      {usesWorkouts && isCoachAvailable() && (
        <CollapsibleCard
          icon="🎙️" title={t('Treinador por voz')}
          summary={user.user_metadata?.coachEnabled ? t('Ativado') : t('Desativado')}
        >
          <CoachSection updateProfile={updateProfile} toast={toast} />
        </CollapsibleCard>
      )}
      <CollapsibleCard
        icon="⏸" title={t('Modo pausa')}
        summary={pause ? t('Pausado até {v1}', { v1: formatDayBR(pause.to) }) : usesWorkouts ? t('Viagem ou doença? Pause sem perder a sequência') : t('Viagem ou lesão? Pause sem perder a sequência')}
      >
        <ProfilePauseSection user={user} updateProfile={updateProfile} toast={toast} />
      </CollapsibleCard>
      <CollapsibleCard
        icon="🩺" title={t('Saúde (PAR-Q)')}
        summary={user.user_metadata?.parqAt ? (user.user_metadata?.parqAlert ? t('Respondido · vale ver um médico') : t('Respondido')) : t('7 perguntas rápidas sobre prontidão')}
      >
        <ProfileHealthSection user={user} updateProfile={updateProfile} toast={toast} />
      </CollapsibleCard>
      {biometricAvailable && (
        <CollapsibleCard icon="🔒" title={t('Bloqueio com biometria')} summary={biometricOn ? t('Ativado neste aparelho') : t('Desativado')}>
          <ProfileBiometricSection user={user} toast={toast} onChange={setBiometricOn} />
        </CollapsibleCard>
      )}
      {usesWorkouts && (
        <>
          <CollapsibleCard icon="🤝" title={t('Meu personal')} summary={t('Vincule-se ao seu personal trainer')}>
            <ProfileTrainerSection toast={toast} />
          </CollapsibleCard>
          <CollapsibleCard icon="🧑‍🏫" title={t('Sou personal trainer')} summary={t('Peça o acesso ao modo Personal')}>
            <ProfileTrainerRequestSection toast={toast} />
          </CollapsibleCard>
        </>
      )}
      <CollapsibleCard icon="💾" title={t('Exportar e backup')} summary={t('CSV, JSON ou relatório para imprimir')}>
        <ExportSection exporting={exporting} onExport={handleExport} />
      </CollapsibleCard>
    </div>
  );
}
