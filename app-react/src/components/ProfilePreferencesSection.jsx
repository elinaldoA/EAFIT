import { isNotificationSupported, isIosSafariNotInstalled, sendNotification, isNotifyEnabled } from '../lib/notifications';
import { exportSummaryCSV, exportBackupJSON, printReport } from '../lib/exportData';

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
