import { useEffect, useMemo, useState } from 'react';
import { TODAY_DATE, WATER_STORAGE_KEY, getWaterGoalLiters } from '../data/treinoData';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useWorkout } from '../context/WorkoutContext';
import { fetchWaterLog, upsertWaterLog, fetchWaterLogsRange } from '../lib/waterLog';
import { enqueue } from '../lib/syncQueue';
import { fmtDate, parseLocalDate, toDateStr } from '../lib/utils';
import LineChart from '../components/LineChart';
import Skeleton from '../components/Skeleton';

function getWaterMl() {
  return parseInt(localStorage.getItem(WATER_STORAGE_KEY), 10) || 0;
}

function fmtLiters(ml) {
  return (ml / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export default function HidratacaoPage({ active }) {
  const { user } = useAuth();
  const { markPending } = useWorkout();
  const toast = useToast();
  const waterGoalLiters = useMemo(() => getWaterGoalLiters(user), [user]);
  const goalMl = waterGoalLiters * 1000;

  const [_tick, setTick] = useState(0);
  const bump = () => setTick(t => t + 1);
  const [waterLogs, setWaterLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const water = getWaterMl();

  useEffect(() => {
    if (!active || !user) return;

    async function load() {
      setLoading(true);
      try {
        // Ancora em TODAY_DATE (fuso de Brasília), não em `new Date()` local +
        // toISOString() (UTC) — evita que a janela de 60 dias fique um dia
        // deslocada dependendo do fuso/horário do navegador.
        const since = parseLocalDate(TODAY_DATE);
        since.setDate(since.getDate() - 59);
        const sinceStr = toDateStr(since);

        const [todayMl, history] = await Promise.all([
          fetchWaterLog(user.id, TODAY_DATE),
          fetchWaterLogsRange(user.id, sinceStr),
        ]);
        if (todayMl !== null) localStorage.setItem(WATER_STORAGE_KEY, todayMl);
        setWaterLogs(history);
        bump();
      } catch (err) {
        console.error('loadHidratacao:', err);
        toast('⚠️ Erro ao carregar dados de hidratação');
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, user]);

  const waterPoints = useMemo(() => waterLogs
    .filter(w => Number.isFinite(w.amount_ml))
    .map(w => ({ value: Math.round(w.amount_ml / 1000 * 10) / 10, label: fmtDate(w.log_date) })),
  [waterLogs]);

  function handleAddWater(deltaMl) {
    const next = Math.max(0, water + deltaMl);
    localStorage.setItem(WATER_STORAGE_KEY, next);
    bump();
    if (deltaMl > 0 && next >= goalMl && water < goalMl) {
      toast('🎉 Meta de hidratação do dia atingida!');
    }
    if (user) {
      upsertWaterLog(user.id, TODAY_DATE, next).catch(err => {
        console.error('upsertWaterLog:', err);
        enqueue('water_log', { userId: user.id, date: TODAY_DATE, amountMl: next });
        markPending();
      });
    }
  }

  function handleResetWater() {
    if (!window.confirm('Zerar a água registrada hoje?')) return;
    localStorage.removeItem(WATER_STORAGE_KEY);
    bump();
    if (user) {
      upsertWaterLog(user.id, TODAY_DATE, 0).catch(err => {
        console.error('resetWaterLog:', err);
        enqueue('water_log', { userId: user.id, date: TODAY_DATE, amountMl: 0 });
        markPending();
      });
    }
  }

  const pct = Math.min(100, (water / goalMl) * 100);

  return (
    <section id="page-hidratacao" className="page active">
      <div className="progress-card">
        <div className="progress-card__row">
          <span className="progress-card__label">💧 Hidratação hoje</span>
          <span className="progress-card__count">{fmtLiters(water)}L / {fmtLiters(goalMl)}L</span>
        </div>
        <div className="progress-card__bar">
          <div className="progress-card__fill progress-card__fill--water" style={{ width: `${pct}%` }} />
        </div>
        <div className="water-actions">
          <button type="button" className="btn btn--outline btn--sm" onClick={() => handleAddWater(200)}>+200ml</button>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => handleAddWater(500)}>+500ml</button>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => handleAddWater(-200)}>-200ml</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={handleResetWater}>Zerar</button>
        </div>
      </div>

      <div className="section-group">
        <div className="section-group__label">Histórico</div>
        <div className="dash-card">
          <div className="dash-card__title">Água consumida por dia</div>
          <div className="line-chart-wrap">
            {loading ? <Skeleton height={130} /> : (
              <LineChart
                points={waterPoints}
                valueSuffix="L"
                singleMsg={v => `1 dia registrado: ${v}L — registre água em outros dias para ver a evolução`}
                emptyMsg="Nenhuma água registrada ainda."
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
