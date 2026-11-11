import { useState } from 'react';
import { useAuth } from '../context/useAuth';
import { needsHealthScreen, skipFields } from '../lib/parq';
import HealthForm from './HealthForm';
import HealthAlertNotice from './HealthAlertNotice';

import { t } from '../lib/i18n';
// Tela cheia, uma vez, com o PAR-Q e a anamnese curta. Não bloqueia: dá para
// pular e ela volta só 30 dias depois. Vale para contas novas (logo depois do
// onboarding) e para quem já tinha conta (na próxima abertura do app).
export default function HealthScreen() {
  const { user, updateProfile } = useAuth();
  const [result, setResult] = useState(null); // { alert } depois de salvar

  if (result) {
    return (
      <div className="health-screen" role="dialog" aria-modal="true" aria-labelledby="health-title">
        <h1 className="maintenance__title" id="health-title">{t('Respostas salvas')}</h1>
        {result.alert
          ? <HealthAlertNotice />
          : <p className="maintenance__text">{t('Tudo certo. Você pode atualizar essas respostas quando quiser, em Perfil.')}</p>}
        <button type="button" className="btn btn--primary" onClick={() => setResult(null)}>{t('Entendi')}</button>
      </div>
    );
  }

  if (!needsHealthScreen(user?.user_metadata)) return null;

  return (
    <div className="health-screen" role="dialog" aria-modal="true" aria-labelledby="health-title">
      <h1 className="maintenance__title" id="health-title">{t('Sua saúde em primeiro lugar')}</h1>
      <p className="maintenance__text">{t('Responda 7 perguntas rápidas antes de treinar. Leva menos de um minuto e você pode pular.')}</p>
      <HealthForm
        meta={user.user_metadata}
        updateProfile={updateProfile}
        onSaved={alert => setResult({ alert })}
        onSkip={() => updateProfile(skipFields())}
      />
    </div>
  );
}
