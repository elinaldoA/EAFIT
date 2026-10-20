import { useEffect, useState } from 'react';
import { fmtDate } from '../lib/utils';
import { fetchClientPlans } from '../lib/trainerRoster';

import { t } from '../lib/i18n';
const author = p => (p.byMe ? t('por você') : t('pelo aluno ou pelo app'));

// Ciclos de treino do aluno, do ativo para os mais antigos: quem montou,
// quantos dias e o período de cada um.
export default function ClientPlanHistory({ clientId, version = 0 }) {
  const [plans, setPlans] = useState(null);

  useEffect(() => {
    let active = true;
    fetchClientPlans(clientId)
      .then(r => { if (active) setPlans(r); })
      .catch(err => { console.warn('fetchClientPlans:', err); if (active) setPlans([]); });
    return () => { active = false; };
  }, [clientId, version]);

  if (!plans || plans.length === 0) return null;

  return (
    <div className="dash-card">
      <div className="dash-card__title">{t('🗂️ Histórico de planos')}</div>
      <ul className="plan-history">
        {plans.map(p => (
          <li key={p.id} className={p.active ? 'plan-history__item plan-history__item--active' : 'plan-history__item'}>
            <span>
              <strong>{p.name}</strong>
              <small>
                {t('{n} dia(s)', { n: p.days })} · {author(p)} · {p.start
                  ? `${fmtDate(p.start)}${p.end ? ` → ${fmtDate(p.end)}` : ''}`
                  : t('criado em {d}', { d: fmtDate(String(p.at).slice(0, 10)) })}
              </small>
            </span>
            {p.active && <span className="plan-chip plan-chip--ok">{t('Ativo')}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
