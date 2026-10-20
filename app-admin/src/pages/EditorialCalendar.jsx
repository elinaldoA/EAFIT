import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { TYPES, buildEvents, busyDays, eventsInMonth, fetchCalendar, monthGrid } from '../lib/calendar';
import { formatDay, todayStr } from '../lib/community';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const FAR = '9999-12-31';

function monthLabel(year, month) {
  const s = new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function shift(year, month, delta) {
  const m = month - 1 + delta;
  return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 + 1 };
}

// Comunicação → Calendário.
export default function EditorialCalendar() {
  const today = todayStr();
  const [ym, setYm] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(() => new Set());

  useEffect(() => {
    fetchCalendar().then(setRaw).catch(err => setError(err.message));
  }, []);

  const events = useMemo(() => (raw ? buildEvents(raw, today).filter(e => !hidden.has(e.type)) : []), [raw, hidden, today]);
  const weeks = useMemo(() => monthGrid(ym.year, ym.month, events), [ym, events]);
  const busy = useMemo(() => new Set(busyDays(weeks)), [weeks]);
  const list = useMemo(() => eventsInMonth(ym.year, ym.month, events), [ym, events]);

  function toggle(type) {
    const next = new Set(hidden);
    if (next.has(type)) next.delete(type); else next.add(type);
    setHidden(next);
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Calendário</h1>
          <p className="page-subtitle">
            Tudo o que tem data e aparece para os usuários num mês só: temas de temporada, aviso do app, envios agendados,
            desafios oficiais, pesquisas e experimentos. Dias com dois temas ou mais de um envio ficam marcados com ⚠️.
          </p>
        </div>
        <div className="actions-row">
          <button type="button" className="btn btn--ghost btn--small" aria-label="Mês anterior" onClick={() => setYm(shift(ym.year, ym.month, -1))}>‹</button>
          <strong>{monthLabel(ym.year, ym.month)}</strong>
          <button type="button" className="btn btn--ghost btn--small" aria-label="Próximo mês" onClick={() => setYm(shift(ym.year, ym.month, 1))}>›</button>
          <button type="button" className="btn btn--small" onClick={() => setYm({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) })}>Hoje</button>
        </div>
      </div>

      <div className="actions-row" role="group" aria-label="Tipos">
        {Object.entries(TYPES).map(([k, t]) => (
          <button key={k} type="button" aria-pressed={!hidden.has(k)} className={`cal__chip cal__chip--${k}${hidden.has(k) ? ' cal__chip--off' : ''}`} onClick={() => toggle(k)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {error && <p className="form-msg form-msg--error">{error}</p>}
      {!raw && !error && <Loading />}
      {raw && (
        <>
          <div className="card">
            <div className="cal" role="grid" aria-label={monthLabel(ym.year, ym.month)}>
              <div className="cal__row cal__row--head" role="row">
                {WEEKDAYS.map(d => <div key={d} className="cal__weekday" role="columnheader">{d}</div>)}
              </div>
              {weeks.map((w, i) => (
                <div key={i} className="cal__row" role="row">
                  {w.map((c, j) => (c ? (
                    <div key={c.date} role="gridcell" data-date={c.date}
                      className={`cal__cell${c.date === today ? ' cal__cell--today' : ''}${busy.has(c.date) ? ' cal__cell--busy' : ''}`}>
                      <div className="cal__day">{c.day}{busy.has(c.date) && <span title="Mais de um tema ou envio no dia"> ⚠️</span>}</div>
                      {c.events.slice(0, 3).map((e, k) => (
                        <div key={k} className={`cal__chip cal__chip--${e.type}`} title={`${TYPES[e.type].label}: ${e.title}`}>
                          {TYPES[e.type].icon} {e.time ? `${e.time} ` : ''}{e.title}
                        </div>
                      ))}
                      {c.events.length > 3 && <div className="cal__more">+{c.events.length - 3}</div>}
                    </div>
                  ) : <div key={`x${j}`} className="cal__cell cal__cell--empty" role="gridcell" />))}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="section-title">No mês</h2>
            {list.length === 0 ? <EmptyState icon="🗓️" label="Nada programado neste mês." /> : (
              <div className="table-wrap">
                <table className="resp-table">
                  <thead><tr><th>Tipo</th><th>O quê</th><th>Quando</th><th /></tr></thead>
                  <tbody>
                    {list.map((e, i) => (
                      <tr key={i}>
                        <td data-label="Tipo">{TYPES[e.type].icon} {TYPES[e.type].label}</td>
                        <td data-label="O quê">{e.title}{e.done ? ' (enviado)' : ''}</td>
                        <td data-label="Quando">
                          {e.start === e.end ? `${formatDay(e.start)}${e.time ? ` às ${e.time}` : ''}`
                            : `${formatDay(e.start)} – ${e.end === FAR ? 'sem fim' : formatDay(e.end)}`}
                        </td>
                        <td><Link to={TYPES[e.type].to}>Abrir</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
