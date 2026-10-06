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
    catch { toast('❌ Não foi possível salvar'); }
    finally { setSaving(false); }
  }

  return (
    <section className="page active trainer-page">
      <div className="dash-card">
        <div className="dash-card__title">🧑‍🏫 Modo Personal</div>
        <p className="profile-field__hint" style={{ marginTop: 0 }}>{getDisplayName(user)}<br />{user?.email}</p>
        <p className="profile-field__hint">
          Quer treinar também? Troque para o modo aluno para usar o app de treino normal. Você volta ao modo Personal quando quiser.
        </p>
        <button type="button" className="btn btn--primary btn--full" onClick={onSwitchToStudent}>Usar como aluno</button>
      </div>

      <div className="dash-card">
        <div className="dash-card__title">🔔 Alertas sobre seus alunos</div>
        <p className="profile-field__hint" style={{ marginTop: 0 }}>
          Receba uma notificação quando um aluno precisar de você. Os avisos chegam entre 8h e 20h.
        </p>
        <button type="button" className={notifyOn ? 'btn btn--outline btn--full' : 'btn btn--primary btn--full'}
          disabled={!isNotificationSupported()} onClick={toggleNotify}>
          {notifyOn ? '🔕 Desativar notificações neste aparelho' : '🔔 Ativar notificações neste aparelho'}
        </button>

        {settings && ALERT_OPTIONS.map(o => (
          <label className="trainer-consent" key={o.key}>
            <input type="checkbox" checked={settings[o.key]} disabled={saving} onChange={e => update({ [o.key]: e.target.checked })} />
            <span><strong>{o.label}</strong><br />{o.hint}</span>
          </label>
        ))}

        {settings && settings.inactive && (
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="inactiveDays">Considerar "sem treinar" após</label>
            <select id="inactiveDays" className="input input--sm" value={settings.days} disabled={saving}
              onChange={e => update({ days: Number(e.target.value) })}>
              {INACTIVE_DAY_CHOICES.map(d => <option key={d} value={d}>{d} dias</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="dash-card">
        <div className="dash-card__title">🎓 Ajuda</div>
        <p className="profile-field__hint" style={{ marginTop: 0 }}>Reveja o passo a passo de todas as funções do painel.</p>
        <button type="button" className="btn btn--outline btn--full" onClick={startTutorial}>Ver tutorial</button>
      </div>

      <button type="button" className="btn btn--outline btn--full" onClick={logout}>Sair da conta</button>
    </section>
  );
}
