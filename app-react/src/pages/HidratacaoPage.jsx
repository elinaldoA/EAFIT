import { useEffect, useMemo, useState } from 'react';
import { todayDate, waterStorageKey, getWaterGoalLiters } from '../data/treinoData';
import { useToast } from '../context/useToast';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { fetchWaterLog, upsertWaterLog, fetchWaterLogsRange } from '../lib/waterLog';
import { enqueue } from '../lib/syncQueue';
import { parseLocalDate, toDateStr } from '../lib/utils';
import { buildDailySeries, waterStats } from '../lib/waterStats';
import WaterBars from '../components/WaterBars';
import Skeleton from '../components/Skeleton';

const HISTORY_DAYS = 14;

const QUICK_ADD = [
  { ml: 200, icon: '🥛', label: 'Copo' },
  { ml: 300, icon: '☕', label: 'Caneca' },
  { ml: 500, icon: '🥤', label: 'Garrafa' },
  { ml: 750, icon: '🍶', label: 'Squeeze' },
];

function getWaterMl() {
  return parseInt(localStorage.getItem(waterStorageKey()), 10) || 0;
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
  // Últimas adições desta visita, pra "Desfazer" tirar exatamente o que entrou
  // por engano. Vazia (app reaberto), o botão vira um -200ml de correção.
  const [undoStack, setUndoStack] = useState([]);

  const water = getWaterMl();

  useEffect(() => {
    if (!active || !user) return;

    async function load() {
      setLoading(true);
      try {
        // Ancora em todayDate() (fuso de Brasília), não em `new Date()` local +
        // toISOString() (UTC) — evita que a janela fique um dia deslocada
        // dependendo do fuso/horário do navegador.
        const since = parseLocalDate(todayDate());
        since.setDate(since.getDate() - (HISTORY_DAYS - 1));

        const [todayMl, history] = await Promise.all([
          fetchWaterLog(user.id, todayDate()),
          fetchWaterLogsRange(user.id, toDateStr(since)),
        ]);
        if (todayMl !== null) localStorage.setItem(waterStorageKey(), todayMl);
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

  // O dia de hoje vem do localStorage (atualizado na hora a cada toque), não
  // do histórico buscado ao abrir a aba.
  const series = useMemo(() => {
    const s = buildDailySeries(waterLogs, todayDate(), HISTORY_DAYS);
    s[s.length - 1] = { ...s[s.length - 1], ml: water };
    return s;
  }, [waterLogs, water]);
  const stats = useMemo(() => waterStats(series, goalMl), [series, goalMl]);

  function saveWater(next) {
    localStorage.setItem(waterStorageKey(), next);
    bump();
    if (user) {
      upsertWaterLog(user.id, todayDate(), next).catch(err => {
        console.error('upsertWaterLog:', err);
        enqueue('water_log', { userId: user.id, date: todayDate(), amountMl: next });
        markPending();
      });
    }
  }

  function handleAddWater(deltaMl) {
    const next = Math.max(0, water + deltaMl);
    if (deltaMl > 0) {
      setUndoStack(s => [...s, deltaMl].slice(-10));
      if (next >= goalMl && water < goalMl) toast('🎉 Meta de hidratação do dia atingida!');
    }
    saveWater(next);
  }

  function handleUndo() {
    const last = undoStack[undoStack.length - 1] ?? 200;
    setUndoStack(s => s.slice(0, -1));
    saveWater(Math.max(0, water - last));
  }

  function handleResetWater() {
    if (!window.confirm('Zerar a água registrada hoje?')) return;
    setUndoStack([]);
    saveWater(0);
  }

  const pct = goalMl ? Math.min(100, (water / goalMl) * 100) : 0;
  const remaining = Math.max(0, goalMl - water);
  const done = water >= goalMl;
  const undoAmount = undoStack[undoStack.length - 1];

  return (
    <section id="page-hidratacao" className="page active">
      <div className={`water-hero${done ? ' water-hero--done' : ''}`}>
        <div className="water-hero__ring" style={{ '--pct': pct }} role="img" aria-label={`${Math.round(pct)}% da meta de água`}>
          <div className="water-hero__inner">
            <span className="water-hero__value">{fmtLiters(water)}<small>L</small></span>
            <span className="water-hero__goal">de {fmtLiters(goalMl)}L</span>
          </div>
        </div>
        <div className="water-hero__info">
          <span className="water-hero__kicker">Hidratação hoje</span>
          <strong className="water-hero__status">
            {done ? 'Meta batida! 🎉' : `Faltam ${fmtLiters(remaining)}L`}
          </strong>
          <span className="water-hero__hint">
            {done
              ? `${Math.round(pct)}% da meta · continue se hidratando`
              : `≈ ${Math.ceil(remaining / 250)} ${Math.ceil(remaining / 250) === 1 ? 'copo' : 'copos'} de 250ml`}
          </span>
        </div>
      </div>

      <div className="water-quick">
        {QUICK_ADD.map(q => (
          <button key={q.ml} type="button" className="water-quick__btn" onClick={() => handleAddWater(q.ml)}>
            <span className="water-quick__icon" aria-hidden="true">{q.icon}</span>
            <span className="water-quick__ml">+{q.ml}ml</span>
            <span className="water-quick__label">{q.label}</span>
          </button>
        ))}
      </div>

      <div className="water-actions">
        <button type="button" className="btn btn--ghost btn--sm" disabled={water === 0} onClick={handleUndo}>
          ↶ {undoAmount ? `Desfazer +${undoAmount}ml` : '−200ml'}
        </button>
        <button type="button" className="link-btn water-actions__reset" disabled={water === 0} onClick={handleResetWater}>
          Zerar o dia
        </button>
      </div>

      <div className="history-stats water-stats">
        <div className="stat-card">
          <span className="stat-card__value">{stats.avg7 ? fmtLiters(stats.avg7) : '–'}</span>
          <span className="stat-card__label">Média 7 dias (L)</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__value">{stats.streak}</span>
          <span className="stat-card__label">Dias seguidos na meta</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__value">{stats.daysHit}/{HISTORY_DAYS}</span>
          <span className="stat-card__label">Dias na meta</span>
        </div>
      </div>

      <div className="section-group">
        <div className="section-group__label">Últimos {HISTORY_DAYS} dias</div>
        <div className="dash-card">
          {loading ? <Skeleton height={150} /> : <WaterBars series={series} goalMl={goalMl} />}
          <p className="dash-card__subtitle">
            Meta de {fmtLiters(goalMl)}L por dia · melhor dia: {stats.bestMl ? `${fmtLiters(stats.bestMl)}L` : '–'} · ajuste a meta em Perfil
          </p>
        </div>
      </div>
    </section>
  );
}
