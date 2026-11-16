import { useState } from 'react';
import ProteinBars from './ProteinBars';
import Skeleton from './Skeleton';
import { HISTORY_DAYS } from '../lib/nutritionDay';
import { t, locale } from '../lib/i18n';

const fmt = n => n.toLocaleString(locale);

const READING_TEXT = {
  few_days: () => t('Registre as calorias por pelo menos 3 dias para ver a leitura da semana.'),
  on_track: () => t('Você está dentro da meta de calorias. Continue assim.'),
  plateau: () => t('Calorias na meta, mas o peso não está indo na direção do seu objetivo. Se continuar assim por 2 a 3 semanas, ajuste as calorias em 5 a 10%.'),
  below_gain: () => t('Você está abaixo da meta de calorias. Para ganhar massa, coma um pouco mais.'),
  below_loss: () => t('Você está bem abaixo da meta de calorias. Um déficit grande demais pode custar músculo e energia nos treinos.'),
  below: () => t('Você está abaixo da meta de calorias da semana.'),
  above_loss: () => t('Você está acima da meta de calorias, o que atrasa a perda de peso.'),
  above_gain: () => t('Você está acima da meta de calorias. Um excesso grande vira mais gordura do que massa.'),
  above: () => t('Você está acima da meta de calorias da semana.'),
};

// Card "Sua semana" da aba Nutrição: a leitura da semana (gasto real medido,
// ajuste de calorias ou o texto do platô), média de calorias e proteína, ritmo
// de peso e o gráfico dos últimos dias. Tudo chega pronto da página.
export default function NutritionWeek({
  tdee, tdeeKcal, tdeeDiffers, newKcal, reading, week, stats, weightRate,
  series, kcalSeries, goalG, kcalGoal, loading,
}) {
  const [chart, setChart] = useState('kcal');
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Sua semana')}</div>
      <div className="dash-card">
        {/* Com o gasto real medido, ele manda; senão, com ajuste calculado, a leitura do platô vira a própria ação. */}
        {tdee ? (
          <p className="nutri-reading">
            {t('Pelo que você registrou e pela balança, seu gasto real é de cerca de {tdee} kcal por dia.', { tdee: fmt(tdee) })}
            {' '}
            {tdeeDiffers
              ? t('Para o seu objetivo, mire em {kcal} kcal por dia (meta atual: {goal}). Vale se você registrou tudo o que comeu.', { kcal: fmt(tdeeKcal), goal: fmt(kcalGoal) })
              : t('Sua meta de {goal} kcal está de acordo com isso.', { goal: fmt(kcalGoal) })}
          </p>
        ) : newKcal ? (
          <p className="nutri-reading">
            {t('O peso não está indo na direção do seu objetivo. Passe para cerca de {kcal} kcal por dia nas próximas 2 semanas (hoje: {goal}).', { kcal: fmt(newKcal), goal: fmt(kcalGoal) })}
          </p>
        ) : reading && <p className="nutri-reading">{READING_TEXT[reading]()}</p>}
        <div className="history-stats water-stats">
          <div className="stat-card">
            <span className="stat-card__value">{week.avgKcal ? fmt(week.avgKcal) : '–'}</span>
            <span className="stat-card__label">{t('Média kcal/dia')}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value">{stats.avg7 ? fmt(stats.avg7) : '–'}</span>
            <span className="stat-card__label">{t('Proteína/dia (g)')}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value">{weightRate === null ? '–' : `${weightRate > 0 ? '+' : ''}${weightRate.toLocaleString(locale)}`}</span>
            <span className="stat-card__label">{t('kg por semana')}</span>
          </div>
        </div>
        <div className="seg" role="tablist" aria-label={t('Últimos {HISTORY_DAYS} dias', { HISTORY_DAYS })}>
          {[['kcal', t('Calorias')], ['protein', t('Proteína')]].map(([k, label]) => (
            <button
              key={k} type="button" role="tab" aria-selected={chart === k}
              className={`seg__btn${chart === k ? ' seg__btn--active' : ''}`}
              onClick={() => setChart(k)}
            >{label}</button>
          ))}
        </div>
        {loading ? <Skeleton height={150} /> : chart === 'kcal'
          ? <ProteinBars series={kcalSeries} goalG={kcalGoal} unit="kcal" ariaLabel={t('Calorias nos últimos {HISTORY_DAYS} dias', { HISTORY_DAYS })} />
          : <ProteinBars series={series} goalG={goalG} />}
      </div>
    </div>
  );
}
