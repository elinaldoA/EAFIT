import { useEffect, useState } from 'react';
import CollapsibleCard from './CollapsibleCard';
import { WAITLIST_GOALS, inRunWaitlist, joinRunWaitlist } from '../lib/runWaitlist';
import { trackEvent } from '../lib/tracking';
import { t } from '../lib/i18n';

// Perfil: convite para o pré-cadastro do EAFIT Run, só enquanto o módulo ainda
// não está disponível para a conta. Um toque e pronto: o e-mail é o da conta.
export default function RunWaitlistCard({ toast }) {
  const [joined, setJoined] = useState(null); // null = ainda consultando
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    inRunWaitlist().then(v => { if (alive) setJoined(v === true); });
    return () => { alive = false; };
  }, []);

  async function handleJoin() {
    setBusy(true);
    try {
      await joinRunWaitlist({ goal });
      trackEvent('feature', 'run_waitlist');
      setJoined(true);
      toast(t('✅ Pronto! Avisamos você quando o EAFIT Run abrir'));
    } catch {
      toast(t('⚠️ Não foi possível salvar — tente novamente'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CollapsibleCard
      icon="🏃" title="EAFIT Run"
      summary={joined ? t('Você está na lista de espera') : t('Em breve · quero ser avisado')}
    >
      <p className="profile-field__hint">
        {t('O módulo para quem ama correr chega em breve, com GPS, voz a cada quilômetro e desafios com amigos. É a mesma conta, sem novo cadastro.')}
      </p>
      {joined ? (
        <p className="profile-field__hint">{t('Você está na lista. Vamos avisar assim que abrir.')}</p>
      ) : (
        <>
          <label className="profile-field" htmlFor="runWaitlistGoal">
            <span className="profile-field__label">{t('Seu objetivo (opcional)')}</span>
            <select id="runWaitlistGoal" className="input" value={goal} onChange={e => setGoal(e.target.value)}>
              {WAITLIST_GOALS.map(g => <option key={g.value} value={g.value}>{t(g.label)}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn--primary btn--full" disabled={busy || joined === null} onClick={handleJoin}>
            {busy ? t('Salvando…') : t('Quero ser avisado')}
          </button>
        </>
      )}
    </CollapsibleCard>
  );
}
