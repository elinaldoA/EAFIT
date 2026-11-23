import { formatDuration } from '../lib/utils';
import { t } from '../lib/i18n';

// Relógio do treino do dia e os botões que acompanham seu estado
// (começar, pausar, continuar, finalizar, ver resumo, refazer).
export default function SessionTimerBar({ timer, setsTotal, onOpenLive, onStart, onFinish, onShowSummary, onReset }) {
  return (
    <div className="session-timer">
      <div className="session-timer__clock">
        {formatDuration(timer.elapsedMs)}
        {timer.status === 'finished' && <span className="session-timer__done"> {t('· concluído')}</span>}
      </div>
      <div className="session-timer__actions">
        {/* Um botão só para começar, com o mesmo nome e a mesma ação do card
            "Treino de hoje": abre o modo treino, que já liga o cronômetro.
            Dia sem séries (só cardio ou alongamento) começa na própria lista. */}
        {timer.status === 'idle' && (setsTotal > 0
          ? <button type="button" className="btn btn--primary btn--sm" onClick={onOpenLive}>{t('⚡ Começar treino')}</button>
          : <button type="button" className="btn btn--primary btn--sm" onClick={onStart}>{t('▶ Iniciar')}</button>)}
        {timer.status === 'running' && (
          <>
            <button type="button" className="btn btn--outline btn--sm" aria-label={t('Pausar')} onClick={timer.pause}>⏸</button>
            {setsTotal > 0 && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={onOpenLive}>{t('⚡ Modo treino')}</button>
            )}
            <button type="button" className="btn btn--primary btn--sm" onClick={onFinish}>{t('🏁 Finalizar')}</button>
          </>
        )}
        {timer.status === 'paused' && (
          <>
            <button type="button" className="btn btn--outline btn--sm" aria-label={t('Continuar')} onClick={timer.resume}>▶</button>
            {setsTotal > 0 && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={onOpenLive}>{t('⚡ Modo treino')}</button>
            )}
            <button type="button" className="btn btn--primary btn--sm" onClick={onFinish}>{t('🏁 Finalizar')}</button>
          </>
        )}
        {timer.status === 'finished' && (
          <>
            <button type="button" className="btn btn--outline btn--sm" onClick={onShowSummary}>{t('📋 Ver resumo')}</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onReset}>{t('↺ Refazer treino')}</button>
          </>
        )}
      </div>
      {timer.status === 'idle' && setsTotal > 0 && (
        <button type="button" className="link-btn session-timer__alt" onClick={onStart}>
          {t('Prefere marcar aqui na lista? Começar sem o modo treino')}
        </button>
      )}
      {timer.status === 'idle' && setsTotal === 0 && (
        <span className="session-timer__hint">{t('Inicie o treino para registrar as séries')}</span>
      )}
    </div>
  );
}
