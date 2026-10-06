import { isNotificationSupported, isIosSafariNotInstalled, sendNotification, isNotifyEnabled } from '../lib/notifications';
import { exportSummaryCSV, exportBackupJSON, printReport } from '../lib/exportData';

const NOTIFY_PREFS = [
  { key: 'notifyEngagement', label: 'Lembretes e incentivos para treinar (treino do dia, meta semanal, plano vencendo)' },
  { key: 'notifyStreakRisk', label: 'Sequência em risco (à noite, se ainda não treinou hoje)' },
  { key: 'notifyInactivity', label: 'Voltar a treinar (dias parado)' },
  { key: 'notifyWeeklySummary', label: 'Resumo semanal (segunda de manhã)' },
  { key: 'notifyWeightUpdate', label: 'Atualizar peso (segunda de manhã)' },
  { key: 'notifyRecords', label: 'Recordes e conquistas' },
  { key: 'notifyDiscomfortFollowup', label: 'Follow-up de desconforto (dias após relato forte/lesão)' },
];

export function NotificationsSection({ user, updateProfile, toast, remindersEnabled, toggleReminders }) {
  return (
    <>
      <div className="profile-field profile-field--row">
        <label className="profile-field__label" htmlFor="remindersToggle">
          Lembretes de refeição, treino e água (app aberto)
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
            ? 'No iPhone/iPad, notificações só funcionam depois de instalar o app: toque em Compartilhar → "Adicionar à Tela de Início".'
            : 'Notificações não são suportadas neste navegador.'}
        </p>
      )}
      <button
        className="btn btn--outline btn--sm"
        disabled={!isNotificationSupported()}
        onClick={() => sendNotification('🔔 Notificação de teste', { body: 'Se você está vendo isso, está tudo funcionando!' })
          .then(() => toast('✅ Notificação enviada'))
          .catch(err => toast(`❌ Falhou: ${err.message}`))}
      >Testar notificação</button>

      <div className="profile-field">
        <label className="profile-field__label" htmlFor="trainingHour">Horário em que costumo treinar</label>
        <select
          id="trainingHour" className="input input--sm"
          value={user.user_metadata?.trainingHour ?? ''}
          onChange={e => updateProfile({ trainingHour: e.target.value === '' ? null : Number(e.target.value) })
            .then(({ error }) => (error ? toast(`❌ ${error.message}`) : toast('⏰ Horário salvo')))}
        >
          <option value="">Sem preferência</option>
          {Array.from({ length: 19 }, (_, i) => i + 5).map(h => (
            <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
          ))}
        </select>
        <span className="profile-field__hint">O lembrete de "hoje é dia de treino" chega 1h antes.</span>
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
      <p className="profile-field__hint">Baixe seus dados a qualquer momento — nenhuma biblioteca externa é usada, tudo é gerado no seu navegador.</p>
      <div className="export-actions">
        <button className="btn btn--outline btn--sm" disabled={exporting} onClick={() => onExport(exportSummaryCSV, 'o resumo (CSV)')}>📊 Resumo (CSV)</button>
        <button className="btn btn--outline btn--sm" disabled={exporting} onClick={() => onExport(exportBackupJSON, 'o backup (JSON)')}>💾 Backup completo (JSON)</button>
        <button className="btn btn--outline btn--sm" disabled={exporting} onClick={() => onExport(printReport, 'o relatório')}>🖨️ Relatório para imprimir</button>
      </div>
    </>
  );
}
