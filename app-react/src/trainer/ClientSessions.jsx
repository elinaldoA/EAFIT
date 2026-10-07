import { useEffect, useMemo, useState } from 'react';
import { fmtDate } from '../lib/utils';
import { buildSessions, formatSets, formatDurationMin, fetchClientSessions, progressionSuggestions } from '../lib/trainerInsights';
import Loading from '../components/Loading';

import { t } from '../lib/i18n';
// Últimos treinos do aluno, série a série, com a evolução de carga em relação
// à sessão anterior de cada exercício.
export default function ClientSessions({ clientId }) {
  const [raw, setRaw] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let active = true;
    fetchClientSessions(clientId, 12)
      .then(r => { if (active) setRaw(r); })
      .catch(err => { console.error('fetchClientSessions:', err); if (active) setRaw([]); });
    return () => { active = false; };
  }, [clientId]);

  const sessions = useMemo(() => (raw ? buildSessions(raw) : []), [raw]);

  const suggestions = useMemo(() => progressionSuggestions(sessions), [sessions]);
  const fmtKg = n => String(n).replace('.', ',');

  return (
    <>
    {suggestions.length > 0 && (
      <div className="dash-card">
        <div className="dash-card__title">{t('📈 Sugestões de carga')}</div>
        <p className="profile-field__hint" style={{ marginTop: 0 }}>{t('Baseadas nos últimos treinos. Você decide se faz sentido para o aluno.')}</p>
        <ul className="measure-deltas">
          {suggestions.map(s => (
            <li key={s.name} className="session-ex">
              <span>
                <strong>{s.name}</strong>
                <small>{s.kind === 'subir'
                  ? t('Fez {v1} kg com 12+ repetições nas últimas 2 vezes', { v1: fmtKg(s.top) })
                  : t('Repetiu {v1} kg nas últimas 3 vezes sem ganhar repetições', { v1: fmtKg(s.top) })}</small>
              </span>
              <span className={s.kind === 'subir' ? 'measure-deltas__down' : 'measure-deltas__up'}>
                {s.kind === 'subir' ? `↑ ${fmtKg(s.next)} kg` : 'estagnado'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    )}
    <div className="dash-card">
      <div className="dash-card__title">{t('Últimos treinos')}</div>
      {!raw && <Loading />}
      {raw && sessions.length === 0 && <p className="dash-empty">{t('O aluno ainda não registrou treinos.')}</p>}

      {sessions.map(s => {
        const expanded = open === s.id;
        const dur = formatDurationMin(s.duration);
        return (
          <div className="challenge" key={s.id}>
            <button type="button" className="challenge__head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : s.id)}>
              <span className="challenge__title">{fmtDate(s.date)} · {s.day}{s.completed ? '' : ' (incompleto)'}</span>
              <span className="challenge__meta">
                {[dur, s.rating ? `${'★'.repeat(s.rating)}` : null,
                  s.improved ? t('↑ {improved} evoluíram', { improved: s.improved }) : null, s.dropped ? t('↓ {dropped} caíram', { dropped: s.dropped }) : null,
                  s.notes ? t('📝 com observação') : null].filter(Boolean).join(' · ') || t('Sem detalhes')}
              </span>
            </button>
            {expanded && (
              <div className="challenge__body">
                {s.notes && <p className="session-note">📝 {s.notes}</p>}
                <ul className="measure-deltas">
                  {s.exercises.map(e => (
                    <li key={e.name} className="session-ex">
                      <span><strong>{e.name}</strong><small>{formatSets(e.sets)}</small></span>
                      {e.delta !== null && e.delta !== 0 && (
                        <span className={e.delta > 0 ? 'measure-deltas__down' : 'measure-deltas__up'}>
                          {e.delta > 0 ? '↑' : '↓'} {String(Math.abs(e.delta)).replace('.', ',')} kg
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
    </>
  );
}
