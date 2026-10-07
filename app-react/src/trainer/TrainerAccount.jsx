import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { useReminders } from '../hooks/useReminders';
import { isNotificationSupported } from '../lib/notifications';
import { getDisplayName } from '../lib/utils';
import { startTutorial } from '../lib/tutorial';
import {
  ALERT_OPTIONS, DEFAULT_SETTINGS, INACTIVE_DAY_CHOICES, fetchTrainerSettings, saveTrainerSettings,
} from '../lib/trainerSettings';

import { t } from '../lib/i18n';
// Conta do personal: notificações e alertas, troca para o modo aluno e saída.
export default function TrainerAccount({ onSwitchToStudent }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [notifyOn, toggleNotify] = useReminders(toast, user);
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchTrainerSettings()
      .then(s => { if (active) setSettings(s); })
      .catch(err => { console.error('fetchTrainerSettings:', err); if (active) setSettings({ ...DEFAULT_SETTINGS }); });
    return () => { active = false; };
  }, []);

  async function update(patch) {
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    try { await saveTrainerSettings(next); }
    catch { toast(t('❌ Não foi possível salvar')); }
    finally { setSaving(false); }
  }

  return (
    <section className="page active trainer-page">
      <div className="dash-card">
        <div className="dash-card__title">{t('🧑‍🏫 Modo Personal')}</div>
        <p className="profile-field__hint" style={{ marginTop: 0 }}>{getDisplayName(user)}<br />{user?.email}</p>
        <p className="profile-field__hint">
          {t('Quer treinar também? Troque para o modo aluno para usar o app de treino normal. Você volta ao modo Personal quando quiser.')}
        </p>
        <button type="button" className="btn btn--primary btn--full" onClick={onSwitchToStudent}>{t('Usar como aluno')}</button>
      </div>

      <div className="dash-card">
        <div className="dash-card__title">{t('🔔 Alertas sobre seus alunos')}</div>
        <p className="profile-field__hint" style={{ marginTop: 0 }}>
          {t('Receba uma notificação quando um aluno precisar de você. Os avisos chegam entre 8h e 20h.')}
        </p>
        <button type="button" className={notifyOn ? 'btn btn--outline btn--full' : 'btn btn--primary btn--full'}
          disabled={!isNotificationSupported()} onClick={toggleNotify}>
          {notifyOn ? t('🔕 Desativar notificações neste aparelho') : t('🔔 Ativar notificações neste aparelho')}
        </button>

        {settings && ALERT_OPTIONS.map(o => (
          <label className="trainer-consent" key={o.key}>
            <input type="checkbox" checked={settings[o.key]} disabled={saving} onChange={e => update({ [o.key]: e.target.checked })} />
            <span><strong>{o.label}</strong><br />{o.hint}</span>
          </label>
        ))}

        {settings && settings.inactive && (
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="inactiveDays">{t('Considerar "sem treinar" após')}</label>
            <select id="inactiveDays" className="input input--sm" value={settings.days} disabled={saving}
              onChange={e => update({ days: Number(e.target.value) })}>
              {INACTIVE_DAY_CHOICES.map(d => <option key={d} value={d}>{t('{d} dias', { d })}</option>)}
            </select>
          </div>
        )}
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
