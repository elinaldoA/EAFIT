import { useEffect, useState } from 'react';
import { fetchInfluencerRanking, rankingView } from '../lib/influencerRanking';

import { t } from '../lib/i18n';

const MONTHS = [
  { offset: 0, label: () => t('Este mês') },
  { offset: 1, label: () => t('Mês passado') },
];

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

// Influenciador → Resultados: ranking do mês entre influenciadores, por
// cadastros pelo link. Quem não quis aparecer vai como anônimo.
export default function RankingCard() {
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setRows(null);
    setError(false);
    fetchInfluencerRanking(offset)
      .then(r => { if (active) setRows(r); })
      .catch(err => { console.error('fetchInfluencerRanking:', err); if (active) setError(true); });
    return () => { active = false; };
  }, [offset]);

  const view = rows ? rankingView(rows) : null;

  return (
    <div className="dash-card influencer-ranking">
      <div className="dash-card__title">{t('🏁 Ranking dos influenciadores')}</div>
      <div className="recap__toggle amb__period" role="group" aria-label={t('Mês do ranking')}>
        {MONTHS.map(m => (
          <button
            key={m.offset} type="button" aria-pressed={offset === m.offset}
            className={`recap__btn${offset === m.offset ? ' recap__btn--active' : ''}`}
            onClick={() => setOffset(m.offset)}
          >
            {m.label()}
          </button>
        ))}
      </div>

      {error && <p className="profile-field__hint">{t('Não foi possível carregar o ranking agora.')}</p>}
      {!view && !error && <div className="skeleton" style={{ height: 90, marginTop: 10 }} />}
      {view && view.me && (
        <p className="influencer-ranking__me">
          {view.me.signups === 0
            ? t('Você ainda não tem cadastros neste mês. O primeiro já te coloca na disputa!')
            : t('Você está em {pos}º lugar entre {total} influenciadores.', { pos: view.me.position, total: view.total })}
        </p>
      )}
      {view && view.head.length > 0 && (
        <ol className="influencer-ranking__list">
          {view.head.map((r, i) => <RankRow key={i} r={r} />)}
          {view.meOutside && (
            <>
              <li className="influencer-ranking__gap" aria-hidden="true">…</li>
              <RankRow r={view.meOutside} />
            </>
          )}
        </ol>
      )}
      <p className="amb__hint" style={{ marginTop: 8 }}>
        {t('Valem as contas criadas pelo seu link no mês. Seu nome só aparece para os outros se você ligar isso em Conta.')}
      </p>
    </div>
  );
}

function RankRow({ r }) {
  return (
    <li className={`influencer-ranking__row${r.me ? ' is-me' : ''}`}>
      <span className="influencer-ranking__pos">{MEDALS[r.position] && r.signups > 0 ? MEDALS[r.position] : `${r.position}º`}</span>
      <span className="influencer-ranking__name">
        {r.me ? t('{name} (você)', { name: r.name || t('Você') }) : (r.name || t('Influenciador anônimo'))}
      </span>
      <span className="influencer-ranking__n">{r.signups}</span>
    </li>
  );
}
