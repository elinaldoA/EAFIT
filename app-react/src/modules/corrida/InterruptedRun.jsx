import { t } from '../../lib/i18n';

// Tela de "o app ficou fechado" da corrida ao vivo (LiveRunHost.jsx).

// "12 min", "1 h 05 min".
function gapText(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  return min < 60 ? t('{v1} min', { v1: min }) : t('{v1} h {v2} min', { v1: Math.floor(min / 60), v2: String(min % 60).padStart(2, '0') });
}

// O app ficou fechado com a corrida rodando: o tempo fora conta ou não?
export default function InterruptedRun({ run, since, onKeep, onCut }) {
  const gap = Date.now() - since;
  return (
    <div className="run-live run-live--finish" role="dialog" aria-modal="true" aria-label={t('Corrida interrompida')}>
      <div className="run-live__top">
        <span className="run-live__brand">EAFIT · Run</span>
      </div>
      <h2 className="run-live__title">{t('O app ficou fechado')}</h2>
      <p className="run-live__text">
        {run.gps
          ? t('Sua corrida ficou {v1} sem o app aberto e sem GPS. O que fazer com esse tempo?', { v1: gapText(gap) })
          : t('Sua corrida ficou {v1} sem o app aberto. O que fazer com esse tempo?', { v1: gapText(gap) })}
      </p>
      <div className="run-live__choices">
        <button type="button" className="btn btn--primary run-live__btn" onClick={onCut}>
          {t('⏸ Parar a corrida quando o app fechou')}
        </button>
        <button type="button" className="btn btn--ghost run-live__btn" onClick={onKeep}>
          {t('▶ Continuei correndo: contar esse tempo')}
        </button>
      </div>
      <p className="profile-field__hint">{t('Na dúvida, pare: na tela seguinte dá para continuar a corrida ou finalizar.')}</p>
    </div>
  );
}
