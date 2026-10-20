import { AmbassadorResults } from '../components/AmbassadorPanel';
import { MILESTONES, goalProgress } from '../lib/influencerGoals';
import RankingCard from './RankingCard';

import { t } from '../lib/i18n';

// Influenciador → Resultados: os números do que o link trouxe (só números,
// nunca quem se cadastrou).
export default function ResultsPage({ amb }) {
  return (
    <section className="page active trainer-page">
      <div className="dash-card influencer-hero">
        <div className="dash-card__title">{t('📣 Olá, {name}', { name: amb.name })}</div>
        <p className="influencer-hero__total"><strong>{amb.total}</strong> {t('cadastros pelo seu link desde o início')}</p>
        {!amb.active && (
          <p className="amb__notice">{t('Seu link está pausado: novas visitas não contam até a equipe EAFIT reativar.')}</p>
        )}
      </div>

      <GoalsCard total={amb.total} />

      <RankingCard />

      <div className="dash-card">
        <div className="dash-card__title">{t('📊 Seus números')}</div>
        <div className="amb">
          <AmbassadorResults initial={amb} />
        </div>
      </div>
    </section>
  );
}

// Próxima meta e os selos dos marcos já batidos (lib/influencerGoals.js).
function GoalsCard({ total }) {
  const g = goalProgress(total);
  return (
    <div className="dash-card influencer-goals">
      <div className="dash-card__title">{t('🏆 Metas')}</div>
      {g.next === null ? (
        <p className="influencer-goals__next">{t('Você bateu todas as metas. Obrigado por levar tanta gente para o EAFIT! 🎉')}</p>
      ) : (
        <>
          <p className="influencer-goals__next">
            {t('Próxima meta: {next} cadastros', { next: g.next })}
            <span>{g.missing === 1 ? t('falta 1') : t('faltam {n}', { n: g.missing })}</span>
          </p>
          <div className="influencer-goals__bar" role="progressbar" aria-valuemin={g.prev} aria-valuemax={g.next} aria-valuenow={Math.max(0, total)}
            aria-label={t('Progresso até a próxima meta')}>
            <div style={{ width: `${g.pct}%` }} />
          </div>
        </>
      )}
      <ul className="influencer-goals__badges" aria-label={t('Selos')}>
        {MILESTONES.map(m => {
          const done = g.reached.includes(m);
          return (
            <li key={m} className={done ? 'is-done' : ''} title={done ? t('Meta de {m} batida', { m }) : t('Meta de {m}', { m })}>
              <span aria-hidden="true">{done ? '🏅' : '🔒'}</span>{m}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
