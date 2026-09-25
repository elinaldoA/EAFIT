import { useEffect, useMemo, useRef, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { parseLocalDate, formatDuration } from '../lib/utils';
import { RATING_OPTIONS } from '../lib/ratingOptions';
import { MONTH_NAMES, buildMonthGrid, fetchMonthSessions, summarizeMonth, fmtVolume } from '../lib/workoutHistory';
import Skeleton from '../components/Skeleton';
import SessionDetailModal from '../components/SessionDetailModal';

const WEEKDAYS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

function currentMonth() {
  const d = parseLocalDate(todayDate());
  return { year: d.getFullYear(), month: d.getMonth() };
}

function fmtLongDate(dateStr) {
  return parseLocalDate(dateStr).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
}

export default function HistoricoPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [cursor, setCursor] = useState(currentMonth);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [detail, setDetail] = useState(null);
  // Meses já carregados nesta visita à aba: voltar/avançar entre meses não
  // repete a consulta. O mês atual nunca vai pro cache (ainda está mudando).
  const cacheRef = useRef(new Map());
  const listRef = useRef(null);

  const today = todayDate();
  const now = currentMonth();
  const isCurrentMonth = cursor.year === now.year && cursor.month === now.month;
  const cacheKey = `${cursor.year}-${cursor.month}`;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setSessions(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchMonthSessions(user.id, cursor.year, cursor.month)
      .then(result => {
        if (cancelled) return;
        if (!isCurrentMonth) cacheRef.current.set(cacheKey, result);
        setSessions(result);
      })
      .catch(err => {
        console.error('fetchMonthSessions:', err);
        if (!cancelled) toast('⚠️ Erro ao carregar o histórico');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, cacheKey]);

  const byDate = useMemo(() => new Map(sessions.map(s => [s.date, s])), [sessions]);
  const weeks = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const stats = useMemo(() => summarizeMonth(sessions), [sessions]);
  const visible = selectedDate ? sessions.filter(s => s.date === selectedDate) : sessions;

  function shiftMonth(delta) {
    setSelectedDate(null);
    setCursor(c => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function handleDayClick(date) {
    if (!byDate.has(date)) return;
    setSelectedDate(d => (d === date ? null : date));
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section id="page-historico" className="page active">
      <div className="dash-card history-cal">
        <div className="history-cal__head">
          <button type="button" className="icon-btn" aria-label="Mês anterior" onClick={() => shiftMonth(-1)}>‹</button>
          <div className="history-cal__title">{MONTH_NAMES[cursor.month]} {cursor.year}</div>
          <button type="button" className="icon-btn" aria-label="Próximo mês" disabled={isCurrentMonth} onClick={() => shiftMonth(1)}>›</button>
        </div>

        <div className="history-cal__grid" role="grid" aria-label={`Treinos de ${MONTH_NAMES[cursor.month]}`}>
          {WEEKDAYS.map((w, i) => <span key={i} className="history-cal__weekday" aria-hidden="true">{w}</span>)}
          {weeks.flat().map((date, i) => {
            if (!date) return <span key={`e${i}`} className="history-cal__cell history-cal__cell--empty" />;
            const s = byDate.get(date);
            const cls = [
              'history-cal__cell',
              s && (s.completed ? 'history-cal__cell--done' : 'history-cal__cell--partial'),
              date === today && 'history-cal__cell--today',
              date === selectedDate && 'history-cal__cell--selected',
            ].filter(Boolean).join(' ');
            return (
              <button
                key={date} type="button" className={cls} disabled={!s}
                aria-pressed={date === selectedDate}
                aria-label={`${parseLocalDate(date).getDate()}${s ? (s.completed ? ', treino concluído' : ', treino incompleto') : ''}`}
                onClick={() => handleDayClick(date)}
              >
                {parseLocalDate(date).getDate()}
              </button>
            );
          })}
        </div>

        <div className="history-cal__legend">
          <span><i className="history-dot history-dot--done" /> Concluído</span>
          <span><i className="history-dot history-dot--partial" /> Incompleto</span>
        </div>
      </div>

      <div className="history-stats">
        <div className="stat-card"><span className="stat-card__value">{stats.treinos}</span><span className="stat-card__label">Treinos</span></div>
        <div className="stat-card"><span className="stat-card__value">{stats.seconds ? formatDuration(stats.seconds * 1000) : '–'}</span><span className="stat-card__label">Tempo total</span></div>
        <div className="stat-card"><span className="stat-card__value">{stats.sets}</span><span className="stat-card__label">Séries</span></div>
        <div className="stat-card"><span className="stat-card__value">{stats.volume ? fmtVolume(stats.volume) : '–'}</span><span className="stat-card__label">Volume</span></div>
      </div>

      <div className="section-group" ref={listRef}>
        <div className="section-group__label history-list__label">
          {selectedDate ? `Treino de ${fmtLongDate(selectedDate)}` : 'Sessões do mês'}
          {selectedDate && (
            <button type="button" className="link-btn" onClick={() => setSelectedDate(null)}>Ver todas</button>
          )}
        </div>

        {loading ? (
          <>
            <Skeleton height={76} />
            <Skeleton height={76} />
          </>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon" aria-hidden="true">📅</span>
            <p className="empty-state__title">Nenhum treino registrado em {MONTH_NAMES[cursor.month].toLowerCase()}</p>
            <p className="empty-state__text">
              {isCurrentMonth ? 'Inicie um treino na aba Treino — ele aparece aqui assim que você marcar a primeira série.' : 'Use as setas para ver outros meses.'}
            </p>
          </div>
        ) : (
          <div className="history-list">
            {visible.map(s => {
              const rating = RATING_OPTIONS.find(o => o.value === s.rating);
              return (
                <button key={s.id} type="button" className="history-item" onClick={() => setDetail(s)}>
                  <div className={`history-item__date${s.completed ? ' history-item__date--done' : ''}`}>
                    <span className="history-item__day">{parseLocalDate(s.date).getDate()}</span>
                    <span className="history-item__month">{MONTH_NAMES[parseLocalDate(s.date).getMonth()].slice(0, 3)}</span>
                  </div>
                  <div className="history-item__main">
                    <div className="history-item__title">
                      {s.dayOfWeek}
                      {!s.completed && <span className="history-item__tag">incompleto</span>}
                    </div>
                    <div className="history-item__meta">
                      {s.exercises.length} exerc. · {s.doneSets} séries
                      {s.durationSeconds ? ` · ${formatDuration(s.durationSeconds * 1000)}` : ''}
                      {s.volume ? ` · ${fmtVolume(s.volume)}` : ''}
                    </div>
                    {(rating || s.notes) && (
                      <div className="history-item__extra">
                        {rating && <span>★ {rating.label}</span>}
                        {s.notes && <span className="history-item__note">“{s.notes}”</span>}
                      </div>
                    )}
                  </div>
                  <span className="history-item__chevron" aria-hidden="true">›</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {detail && <SessionDetailModal session={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}
