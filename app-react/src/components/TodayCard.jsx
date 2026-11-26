import MobilityButton from './MobilityButton';
import { estimateMinutes } from '../lib/quickWorkout';
import { t, tFoco } from '../lib/i18n';

// Card "Treino de hoje": resumo do dia, progresso e o botão que abre o modo treino.
export default function TodayCard({ day, sets, done, onStart, quickMinutes, onQuick, mobility, coach, firstDay, onStartFirst }) {
  const hasSets = sets.total > 0;
  const pct = hasSets ? (sets.done / sets.total) * 100 : 0;
  let cta = t('⚡ Começar treino');
  if (done) cta = t('💪 Revisar treino');
  else if (sets.done > 0) cta = t('⚡ Continuar treino');

  return (
    <div className={`today-card${done ? ' today-card--done' : ''}`}>
      <div className="today-card__top">
        <div>
          <span className="today-card__kicker">{done ? t('Treino de hoje concluído') : t('Treino de hoje')}</span>
          <h2 className="today-card__title">{tFoco(day.foco)}</h2>
          {/* Cada dado vira uma pílula; os " · " ficam no texto (escondidos) para a leitura
              por leitor de tela e o textContent seguirem iguais. */}
          <span className="today-card__meta">
            <span className="today-card__chip">
              {day.exercicios.length === 1
                ? t('{dia} · 1 exercício', { dia: t(day.dia) })
                : t('{dia} · {length} exercícios', { dia: t(day.dia), length: day.exercicios.length })}
            </span>
            {hasSets && <><span className="today-card__sep"> · </span><span className="today-card__chip">{t('{setsDone}/{setsTotal} séries', { setsDone: sets.done, setsTotal: sets.total })}</span></>}
            {hasSets && !done && <><span className="today-card__sep"> · </span><span className="today-card__chip">{t('~{m} min', { m: estimateMinutes(day) })}</span></>}
          </span>
          {quickMinutes && <span className="today-card__quick">{t('⏱ Versão de {m} min', { m: quickMinutes })}</span>}
        </div>
        {hasSets && (
          <div className="today-card__ring" style={{ '--pct': pct }} aria-label={t('{v1}% das séries', { v1: Math.round(pct) })}>
            <span>{Math.round(pct)}%</span>
          </div>
        )}
      </div>
      {!hasSets && <p className="today-card__rest">{t('Dia de recuperação — descanse bem ou faça um cardio leve. 🧘')}</p>}
      {coach}
      {hasSets && <button type="button" className="btn btn--primary btn--full" onClick={onStart}>{cta}</button>}
      {!hasSets && firstDay && onStartFirst && (
        <button type="button" className="btn btn--primary btn--full" onClick={onStartFirst}>
          {t('⚡ Começar pelo primeiro treino: {foco}', { foco: tFoco(firstDay.foco) })}
        </button>
      )}
      {hasSets && !done && onQuick && (
        <button type="button" className="today-card__link" onClick={onQuick}>
          {quickMinutes ? t('Mudar o tempo ou voltar ao treino completo') : t('⏱ Pouco tempo hoje? Enxugar o treino')}
        </button>
      )}
      {!hasSets && mobility && <MobilityButton kind="rest" minutes={8} className="btn btn--outline btn--full" />}
    </div>
  );
}
