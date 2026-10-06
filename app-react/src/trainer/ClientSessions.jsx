import { useEffect, useMemo, useState } from 'react';
import { fmtDate } from '../lib/utils';
import { buildSessions, formatSets, formatDurationMin, fetchClientSessions } from '../lib/trainerInsights';

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

  return (
    <div className="dash-card">
      <div className="dash-card__title">Últimos treinos</div>
      {!raw && <p className="dash-empty">Carregando…</p>}
      {raw && sessions.length === 0 && <p className="dash-empty">O aluno ainda não registrou treinos.</p>}

      {sessions.map(s => {
        const expanded = open === s.id;
        const dur = formatDurationMin(s.duration);
        return (
          <div className="challenge" key={s.id}>
            <button type="button" className="challenge__head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : s.id)}>
              <span className="challenge__title">{fmtDate(s.date)} · {s.day}{s.completed ? '' : ' (incompleto)'}</span>
              <span className="challenge__meta">
                {[dur, s.rating ? `${'★'.repeat(s.rating)}` : null,
                  s.improved ? `↑ ${s.improved} evoluíram` : null, s.dropped ? `↓ ${s.dropped} caíram` : null,
                  s.notes ? '📝 com observação' : null].filter(Boolean).join(' · ') || 'Sem detalhes'}
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
  );
}
