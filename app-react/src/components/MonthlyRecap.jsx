import { useEffect, useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { useToast } from '../context/useToast';
import { buildMonthlyRecap, fetchRecapWorkouts, formatMinutes } from '../lib/monthlyRecap';
import { shareMonthlyRecap } from '../lib/shareCard';

import { t, locale } from '../lib/i18n';
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
      if (result === 'downloaded') toast(t('🖼️ Imagem baixada'));
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('shareMonthlyRecap:', err);
        toast(t('⚠️ Erro ao gerar imagem de compartilhamento'));
      }
    } finally {
      setSharing(false);
    }
  }

  const delta = recap.deltaPct === null ? null : t('{v1} {v2}% vs. mês anterior', { v1: recap.deltaPct > 0 ? '▲' : recap.deltaPct < 0 ? '▼' : '●', v2: Math.abs(recap.deltaPct) });
  const stats = [
    { value: recap.treinos, label: t('treinos') },
    { value: formatMinutes(recap.minutes), label: t('de treino') },
    { value: loadingLogs ? '…' : `${recap.volume.toLocaleString(locale)} kg`, label: t('volume (carga × reps)') },
    { value: loadingLogs ? '…' : recap.prCount, label: t('recordes batidos') },
    { value: recap.bestStreak ? `${recap.bestStreak} dia(s)` : '—', label: t('melhor sequência') },
    { value: recap.favWeekday || '—', label: t('dia favorito') },
  ];

  return (
    <div className="dash-card recap">
      <div className="dash-card__title-row recap__head">
        <div className="dash-card__title" style={{ marginBottom: 0 }}>{t('📅 Retrospectiva · {label}', { label: recap.label })}</div>
        <div className="recap__toggle" role="group" aria-label={t('Período da retrospectiva')}>
          <button type="button" aria-pressed={offset === 0} className={offset === 0 ? 'recap__btn recap__btn--active' : 'recap__btn'} onClick={() => setOffset(0)}>{t('Este mês')}</button>
          <button type="button" aria-pressed={offset === -1} className={offset === -1 ? 'recap__btn recap__btn--active' : 'recap__btn'} onClick={() => setOffset(-1)}>{t('Mês passado')}</button>
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
      {recap.treinos === 0 && <p className="dash-empty">{t('Nenhum treino concluído neste período.')}</p>}

      <button type="button" className="btn btn--outline btn--sm" disabled={sharing || recap.treinos === 0} onClick={handleShare}>
        {sharing ? t('Gerando…') : t('📤 Compartilhar retrospectiva')}
      </button>
    </div>
  );
}
