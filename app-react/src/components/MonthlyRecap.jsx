import { useEffect, useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { useToast } from '../context/useToast';
import { buildMonthlyRecap, fetchRecapWorkouts, formatMinutes } from '../lib/monthlyRecap';
import { shareMonthlyRecap } from '../lib/shareCard';

// Retrospectiva do mês (este mês ou o anterior) no Dashboard: números simples
// de ler e um cartão compartilhável. Volume e recordes vêm do histórico de
// séries já carregado pelo Dashboard (allTimeLogs); enquanto ele carrega, esses
// dois mostram "…".
export default function MonthlyRecap({ userId, allTimeLogs, loadingLogs }) {
  const toast = useToast();
  const [workouts, setWorkouts] = useState(null);
  const [offset, setOffset] = useState(0);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let active = true;
    fetchRecapWorkouts(userId, todayDate())
      .then(w => { if (active) setWorkouts(w); })
      .catch(err => { console.error('fetchRecapWorkouts:', err); if (active) setWorkouts([]); });
    return () => { active = false; };
  }, [userId]);

  const recap = useMemo(
    () => (workouts ? buildMonthlyRecap({ workouts, allTimeLogs, today: todayDate(), offset }) : null),
    [workouts, allTimeLogs, offset],
  );

  if (!recap) return null;

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    try {
      const result = await shareMonthlyRecap(recap);
      if (result === 'downloaded') toast('🖼️ Imagem baixada');
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('shareMonthlyRecap:', err);
        toast('⚠️ Erro ao gerar imagem de compartilhamento');
      }
    } finally {
      setSharing(false);
    }
  }

  const delta = recap.deltaPct === null ? null : `${recap.deltaPct > 0 ? '▲' : recap.deltaPct < 0 ? '▼' : '●'} ${Math.abs(recap.deltaPct)}% vs. mês anterior`;
  const stats = [
    { value: recap.treinos, label: 'treinos' },
    { value: formatMinutes(recap.minutes), label: 'de treino' },
    { value: loadingLogs ? '…' : `${recap.volume.toLocaleString('pt-BR')} kg`, label: 'volume (carga × reps)' },
    { value: loadingLogs ? '…' : recap.prCount, label: 'recordes batidos' },
    { value: recap.bestStreak ? `${recap.bestStreak} dia(s)` : '—', label: 'melhor sequência' },
    { value: recap.favWeekday || '—', label: 'dia favorito' },
  ];

  return (
    <div className="dash-card recap">
      <div className="dash-card__title-row recap__head">
        <div className="dash-card__title" style={{ marginBottom: 0 }}>📅 Retrospectiva · {recap.label}</div>
        <div className="recap__toggle" role="group" aria-label="Período da retrospectiva">
          <button type="button" aria-pressed={offset === 0} className={offset === 0 ? 'recap__btn recap__btn--active' : 'recap__btn'} onClick={() => setOffset(0)}>Este mês</button>
          <button type="button" aria-pressed={offset === -1} className={offset === -1 ? 'recap__btn recap__btn--active' : 'recap__btn'} onClick={() => setOffset(-1)}>Mês passado</button>
        </div>
      </div>

      <div className="recap__grid">
        {stats.map(s => (
          <div className="recap__stat" key={s.label}>
            <span className="recap__value">{s.value}</span>
            <span className="recap__label">{s.label}</span>
          </div>
        ))}
      </div>

      {delta && <p className={`recap__delta${recap.deltaPct < 0 ? ' recap__delta--down' : ''}`}>{delta}</p>}
      {recap.treinos === 0 && <p className="dash-empty">Nenhum treino concluído neste período.</p>}

      <button type="button" className="btn btn--outline btn--sm" disabled={sharing || recap.treinos === 0} onClick={handleShare}>
        {sharing ? 'Gerando…' : '📤 Compartilhar retrospectiva'}
      </button>
    </div>
  );
}
