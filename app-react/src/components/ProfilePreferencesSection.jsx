import { isNotificationSupported, isIosSafariNotInstalled, sendNotification, isNotifyEnabled } from '../lib/notifications';
import { exportSummaryCSV, exportBackupJSON, printReport } from '../lib/exportData';
import { useEffect, useState } from 'react';
import { getCoachPrefs, saveCoachPrefs, coachSample, coachStop, coachName } from '../lib/coach';
import { genderAvailable, listPtVoices } from '../lib/voice';

import { t } from '../lib/i18n';
const NOTIFY_PREFS = [
  { key: 'notifyEngagement', label: t('Lembretes e incentivos para treinar (treino do dia, meta semanal, plano vencendo)') },
  { key: 'notifyStreakRisk', label: t('Sequência em risco (à noite, se ainda não treinou hoje)') },
  { key: 'notifyInactivity', label: t('Voltar a treinar (dias parado)') },
  { key: 'notifyWeeklySummary', label: t('Resumo semanal (segunda de manhã)') },
  { key: 'notifyWeightUpdate', label: t('Atualizar peso (segunda de manhã)') },
  { key: 'notifyRecords', label: t('Recordes e conquistas') },
  { key: 'notifyDiscomfortFollowup', label: t('Follow-up de desconforto (dias após relato forte/lesão)') },
];

export function NotificationsSection({ user, updateProfile, toast, remindersEnabled, toggleReminders }) {
  return (
    <>
      <div className="profile-field profile-field--row">
        <label className="profile-field__label" htmlFor="remindersToggle">
          {t('Lembretes de refeição, treino e água (app aberto)')}
        </label>
        <input
          type="checkbox" id="remindersToggle"
          checked={remindersEnabled} onChange={toggleReminders}
          disabled={!isNotificationSupported()}
        />
      </div>
      {!isNotificationSupported() && (
        <p className="dash-empty">
          {isIosSafariNotInstalled()
            ? t('No iPhone/iPad, notificações só funcionam depois de instalar o app: toque em Compartilhar → "Adicionar à Tela de Início".')
            : t('Notificações não são suportadas neste navegador.')}
        </p>
      )}
      <button
        className="btn btn--outline btn--sm"
        disabled={!isNotificationSupported()}
        onClick={() => sendNotification(t('🔔 Notificação de teste'), { body: t('Se você está vendo isso, está tudo funcionando!') })
          .then(() => toast(t('✅ Notificação enviada')))
          .catch(err => toast(t('❌ Falhou: {message}', { message: err.message })))}
      >{t('Testar notificação')}</button>

      <div className="profile-field">
        <label className="profile-field__label" htmlFor="trainingHour">{t('Horário em que costumo treinar')}</label>
        <select
          id="trainingHour" className="input input--sm"
          value={user.user_metadata?.trainingHour ?? ''}
          onChange={e => updateProfile({ trainingHour: e.target.value === '' ? null : Number(e.target.value) })
            .then(({ error }) => (error ? toast(`❌ ${error.message}`) : toast(t('⏰ Horário salvo'))))}
        >
          <option value="">{t('Sem preferência')}</option>
          {Array.from({ length: 19 }, (_, i) => i + 5).map(h => (
            <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
          ))}
        </select>
        <span className="profile-field__hint">{t('O lembrete de "hoje é dia de treino" chega 1h antes.')}</span>
      </div>

      {NOTIFY_PREFS.map(({ key, label }) => (
        <div className="profile-field profile-field--row" key={key}>
          <label className="profile-field__label" htmlFor={key}>{label}</label>
          <input
            type="checkbox" id={key}
            checked={isNotifyEnabled(user.user_metadata, key)}
            disabled={!remindersEnabled}
            onChange={e => updateProfile({ [key]: e.target.checked })
              .then(({ error }) => error && toast(`❌ ${error.message}`))}
          />
        </div>
      ))}
    </>
  );
}

export function ExportSection({ exporting, onExport }) {
  return (
    <>
      <p className="profile-field__hint">{t('Baixe seus dados a qualquer momento — nenhuma biblioteca externa é usada, tudo é gerado no seu navegador.')}</p>
      <div className="export-actions">
        <button className="btn btn--outline btn--sm" disabled={exporting} onClick={() => onExport(exportSummaryCSV, t('o resumo (CSV)'))}>{t('📊 Resumo (CSV)')}</button>
        <button className="btn btn--outline btn--sm" disabled={exporting} onClick={() => onExport(exportBackupJSON, t('o backup (JSON)'))}>{t('💾 Backup completo (JSON)')}</button>
        <button className="btn btn--outline btn--sm" disabled={exporting} onClick={() => onExport(printReport, t('o relatório'))}>{t('🖨️ Relatório para imprimir')}</button>
      </div>
    </>
  );
}

const RATES = [
  { value: 0.9, label: t('Mais lenta') },
  { value: 1, label: t('Normal') },
  { value: 1.1, label: t('Mais rápida') },
];

// Treinador por voz do modo treino. Cada escolha vale na hora neste aparelho
// (a amostra usa ela) e vai para o perfil para acompanhar a conta.
export function CoachSection({ updateProfile, toast }) {
  const [prefs, setPrefs] = useState(getCoachPrefs);
  const [missingVoice, setMissingVoice] = useState(false);
  const [voices, setVoices] = useState([]);

  useEffect(() => {
    let alive = true;
    listPtVoices().then(list => { if (alive) setVoices(list); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    genderAvailable(prefs.gender).then(r => { if (alive) setMissingVoice(r.supported && !r.matched); });
    return () => { alive = false; };
  }, [prefs.gender]);

  useEffect(() => coachStop, []);

  function change(patch, profilePatch) {
    setPrefs(saveCoachPrefs(patch));
    updateProfile(profilePatch).then(({ error }) => error && toast(`❌ ${error.message}`));
  }

  function toggle(e) {
    const enabled = e.target.checked;
    change({ enabled }, { coachEnabled: enabled });
    if (enabled) coachSample();
    else coachStop();
  }

  return (
    <>
      <p className="profile-field__hint">{t('O treinador fala durante o modo treino: apresenta os exercícios, conta o descanso e comemora seus recordes. Use fone ou aumente o volume de mídia.')}</p>
      <div className="profile-field profile-field--row">
        <label className="profile-field__label" htmlFor="coachEnabled">{t('Falar durante o treino')}</label>
        <input type="checkbox" id="coachEnabled" checked={prefs.enabled} onChange={toggle} />
      </div>

      <div className="profile-field">
        <label className="profile-field__label" htmlFor="coachGender">{t('Voz')}</label>
        <select
          id="coachGender" className="input input--sm" value={prefs.gender}
          onChange={e => change({ gender: e.target.value, voiceName: '' }, { coachGender: e.target.value })}
        >
          <option value="female">{`${t('Feminina')} · ${coachName('female')}`}</option>
          <option value="male">{`${t('Masculina')} · ${coachName('male')}`}</option>
        </select>
        {missingVoice && (
          <span className="profile-field__hint">{t('Este aparelho não tem uma voz {genero} em português; vamos usar outra. Em "Voz do aparelho" você pode escolher uma manualmente.', { genero: prefs.gender === 'male' ? t('masculina') : t('feminina') })}</span>
        )}
      </div>

      {voices.length > 1 && (
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="coachVoice">{t('Voz do aparelho')}</label>
          <select
            id="coachVoice" className="input input--sm" value={prefs.voiceName}
            onChange={e => { setPrefs(saveCoachPrefs({ voiceName: e.target.value })); coachSample(); }}
          >
            <option value="">{t('Automática (pelo gênero)')}</option>
            {voices.map(v => (
              <option key={v.name} value={v.name}>
                {v.gender ? `${v.name} · ${v.gender === 'male' ? t('masculina') : t('feminina')}` : v.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="profile-field">
        <label className="profile-field__label" htmlFor="coachTone">{t('Jeito de falar')}</label>
        <select
          id="coachTone" className="input input--sm" value={prefs.tone}
          onChange={e => change({ tone: e.target.value }, { coachTone: e.target.value })}
        >
          <option value="animado">{t('Animado')}</option>
          <option value="zoeira">{t('Zoeira')}</option>
          <option value="calmo">{t('Calmo')}</option>
        </select>
      </div>

      <div className="profile-field">
        <label className="profile-field__label" htmlFor="coachFrequency">{t('Quanto ele fala')}</label>
        <select
          id="coachFrequency" className="input input--sm" value={prefs.frequency}
          onChange={e => change({ frequency: e.target.value }, { coachFrequency: e.target.value })}
        >
          <option value="full">{t('Tudo (exercícios, descanso e recordes)')}</option>
          <option value="light">{t('Só o essencial (início, recordes e fim)')}</option>
        </select>
      </div>

      <div className="profile-field">
        <label className="profile-field__label" htmlFor="coachRate">{t('Velocidade da fala')}</label>
        <select
          id="coachRate" className="input input--sm" value={prefs.rate}
          onChange={e => change({ rate: Number(e.target.value) }, { coachRate: Number(e.target.value) })}
        >
          {RATES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      <button type="button" className="btn btn--outline btn--sm" onClick={coachSample}>{t('🔊 Ouvir amostra')}</button>
    </>
  );
}
