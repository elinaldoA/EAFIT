import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { todayDate } from '../../data/treinoData';
import { trackEvent } from '../../lib/tracking';
import {
  RUN_GOALS, RUN_LEVELS, GOAL_LABEL, sessionTitle, programFromMetadata, programToday,
  describeSession, isRunSession, mondayOf, goalWeeks,
} from './program';
import { fetchRuns, flushPendingRuns, formatKm, RUN_SAVED_EVENT } from './runs';
import { startRun, setLiveRun, getLiveRun } from './liveRun';
import { geoSupported, useGeoTracker } from './useGeoTracker';
import { gpsStatusText } from './gpsStatus';
import { useLiveRun } from './useLiveRun';

import { t } from '../../lib/i18n';
const WEEKDAYS = [t('Seg'), t('Ter'), t('Qua'), t('Qui'), t('Sex'), t('Sáb'), t('Dom')];
const LEVEL_LABEL = { iniciante: t('Iniciante'), intermediario: t('Intermediário'), avancado: t('Avançado') };
const GPS_KEY = 'eafit_run_gps';

function readGpsPref() {
  try { return localStorage.getItem(GPS_KEY) !== 'off'; } catch { return true; }
}

// Datas (YYYY-MM-DD) de segunda a domingo da semana de `today`.
function weekDates(today) {
  const [y, m, d] = mondayOf(today).split('-').map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(y, m - 1, d + i);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  });
}

export function ProgramSetup({ initialNivel, onSave, onCancel, busy }) {
  const [goal, setGoal] = useState('5k');
  const [nivel, setNivel] = useState(RUN_LEVELS.includes(initialNivel) ? initialNivel : 'iniciante');
  const goals = RUN_GOALS.filter(g => !(g === 'meia' && nivel === 'iniciante'));
  const weeks = goalWeeks(goal, nivel);
  return (
    <div className="dash-card run-setup">
      <h2 className="run-setup__title">{t('Monte seu programa de corrida')}</h2>
      <p className="run-setup__text">{t('Escolha o objetivo e o app monta as semanas, com corrida, descanso e força para corredor.')}</p>
      <div className="profile-field">
        <span className="profile-field__label" id="runGoalLabel">{t('Objetivo')}</span>
        <div className="run-chips" role="group" aria-labelledby="runGoalLabel">
          {goals.map(g => (
            <button key={g} type="button" aria-pressed={goal === g} className={`run-chip${goal === g ? ' run-chip--on' : ''}`} onClick={() => setGoal(g)}>{GOAL_LABEL[g]}</button>
          ))}
        </div>
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="runLevel">{t('Seu nível na corrida')}</label>
        <select id="runLevel" className="input" value={nivel} onChange={e => { setNivel(e.target.value); if (e.target.value === 'iniciante' && goal === 'meia') setGoal('10k'); }}>
          {RUN_LEVELS.map(l => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
        </select>
      </div>
      <p className="profile-field__hint">
        {goal === 'livre' ? t('Sem prazo: semanas leves e constantes, para correr pela saúde.') : t('{v1} semanas, começando nesta segunda-feira.', { v1: weeks })}
      </p>
      <div className="run-setup__actions">
        {onCancel && <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>{t('Cancelar')}</button>}
        <button type="button" className="btn btn--primary" onClick={() => onSave({ goal, nivel })} disabled={busy}>{busy ? t('Salvando…') : t('Começar programa')}</button>
      </div>
    </div>
  );
}

// Aba Gravar do EAFIT Run: o botão grande de começar a corrida e, opcional,
// o programa de 5K/10K/meia com a corrida de cada dia.
export default function RunHomePage() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const md = user?.user_metadata || {};
  const program = programFromMetadata(md);
  const today = todayDate();
  const [runs, setRuns] = useState([]);
  const [editing, setEditing] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState(() => readGpsPref() && geoSupported());
  // Aquece o GPS antes do Começar: o celular leva de segundos a um minuto para
  // achar os satélites, e assim a corrida já começa com sinal. Para quando a
  // corrida começa (a tela ao vivo tem o próprio rastreio).
  const live = useLiveRun();
  const warm = useGeoTracker({ active: gps && !live });

  const load = useCallback(async () => {
    if (!user) return;
    try {
      await flushPendingRuns(user.id);
      setRuns(await fetchRuns(user.id));
    } catch (err) {
      console.error('RunHomePage:', err);
    }
  }, [user]);

  useEffect(() => {
    load();
    window.addEventListener(RUN_SAVED_EVENT, load);
    return () => window.removeEventListener(RUN_SAVED_EVENT, load);
  }, [load]);

  async function saveProgram({ goal, nivel }) {
    setBusy(true);
    const { error } = await updateProfile({ runGoal: goal, runNivel: nivel, runStart: mondayOf(today) });
    setBusy(false);
    if (error) return toast(t('⚠️ Não foi possível salvar — tente novamente'));
    trackEvent('run_program', goal);
    setEditing(false);
    setPlanOpen(false);
    toast(t('✅ Programa {v1} montado', { v1: GOAL_LABEL[goal] }));
  }

  async function stopProgram() {
    setBusy(true);
    const { error } = await updateProfile({ runGoal: null, runStart: null });
    setBusy(false);
    if (error) return toast(t('⚠️ Não foi possível salvar — tente novamente'));
    toast(t('Programa encerrado. As corridas continuam salvas.'));
  }

  const where = program ? programToday(program, today) : null;
  const session = where ? where.days[where.dayIndex] : null;
  const dates = weekDates(today);
  const ranOn = new Set(runs.map(r => r.run_date));
  const weekRuns = runs.filter(r => r.run_date >= dates[0] && r.run_date <= dates[6]);
  const weekMeters = weekRuns.reduce((sum, r) => sum + r.distance_m, 0);
  const doneToday = ranOn.has(today);
  const planned = !!session && isRunSession(session);

  function begin(withSession) {
    if (getLiveRun()) return;
    try { localStorage.setItem(GPS_KEY, gps ? 'on' : 'off'); } catch { /* sem storage */ }
    const s = withSession && planned ? { ...session, week: where.week || null, dayIndex: where.dayIndex } : null;
    setLiveRun(startRun({ gps, session: s }));
    trackEvent('run_start', s ? s.type : 'livre');
  }

  return (
    <section id="page-gravar" className="page active">
      <div className="dash-card run-record">
        <div className="run-record__week">
          <span><strong>{formatKm(weekMeters, 1)}</strong> {t('km nesta semana')}</span>
          <span><strong>{weekRuns.length}</strong> {t('corrida(s)')}</span>
        </div>
        <button type="button" className="run-record__start" onClick={() => begin(planned)} aria-label={planned ? t('Começar a corrida de hoje') : t('Começar corrida')}>
          <span className="run-record__play" aria-hidden="true">▶</span>
          <span>{t('Começar')}</span>
        </button>
        <p className="run-record__hint">
          {planned ? t('Hoje: {v1} · {v2}', { v1: sessionTitle(session), v2: describeSession(session) }) : t('Corrida livre, no seu ritmo')}
        </p>
        {planned && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => begin(false)}>{t('Fazer corrida livre')}</button>
        )}
        <label className="run-today__gps">
          <input type="checkbox" checked={gps} disabled={!geoSupported()} onChange={e => setGps(e.target.checked)} />
          {geoSupported() ? t('Medir distância e percurso pelo GPS') : t('GPS indisponível neste aparelho')}
        </label>
        {gps && warm.status !== 'idle' && (
          <p className={`run-record__gps run-record__gps--${warm.status}`} role="status">{gpsStatusText(warm.status, warm.accuracy)}</p>
        )}
        {doneToday && <p className="run-today__done">{t('✅ Corrida de hoje registrada')}</p>}
      </div>

      {editing || (!program && planOpen) ? (
        <ProgramSetup
          initialNivel={program?.nivel || md.nivel} onSave={saveProgram} busy={busy}
          onCancel={() => { setEditing(false); setPlanOpen(false); }}
        />
      ) : program ? (
        <div className="section-group">
          <div className="section-group__label">
            {where.maintenance
              ? (where.finished ? t('Programa concluído 🎉 · semanas de manutenção') : t('Programa: {v1}', { v1: GOAL_LABEL[program.goal] }))
              : t('{v1} · semana {v2} de {v3}', { v1: GOAL_LABEL[program.goal], v2: where.week, v3: where.weeks })}
          </div>
          <ol className="run-week">
            {where.days.map((d, i) => (
              <li key={dates[i]} className={`run-week__day${i === where.dayIndex ? ' run-week__day--today' : ''}${ranOn.has(dates[i]) ? ' run-week__day--done' : ''}`}>
                <span className="run-week__name">{WEEKDAYS[i]}</span>
                <span className="run-week__type">{sessionTitle(d)}</span>
                <span className="run-week__mark" aria-label={ranOn.has(dates[i]) ? t('feito') : undefined}>{ranOn.has(dates[i]) ? '✓' : ''}</span>
              </li>
            ))}
          </ol>
          <div className="run-setup__actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={stopProgram} disabled={busy}>{t('Encerrar programa')}</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>{t('Trocar de programa')}</button>
          </div>
        </div>
      ) : (
        <button type="button" className="dash-card run-plan-cta" onClick={() => setPlanOpen(true)}>
          <strong>{t('📅 Quer um plano? Monte um programa de 5K, 10K ou meia maratona')}</strong>
          <span>{t('O app diz qual corrida fazer em cada dia da semana.')}</span>
        </button>
      )}
    </section>
  );
}
