import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { todayDate } from '../../data/treinoData';
import { trackEvent } from '../../lib/tracking';
import {
  RUN_GOALS, RUN_LEVELS, GOAL_LABEL, sessionTitle, programFromMetadata, programToday,
  describeSession, isRunSession, mondayOf, goalWeeks,
} from './program';
import RunRace from './RunRace';
import {
  fetchRuns, flushPendingRuns, formatKm, formatClock, RUN_SAVED_EVENT, manualRun, saveRun, newRecords, describeRecord,
  fetchShoes, cachedShoes, defaultShoeId, rememberShoe, shoeUsage, shoeWearNotice,
} from './runs';
import { requestMotionPermission } from './cadence';
import { ShoePicker } from './Shoes';
import GuidedSetup from './GuidedSetup';
import GpxImport from './GpxImport';
import { newMedals } from './challenges';
import { startRun, setLiveRun, getLiveRun } from './liveRun';
import { geoSupported, useGeoTracker } from './useGeoTracker';
import { gpsStatusText } from './gpsStatus';
import { useLiveRun } from './useLiveRun';
import { GPS_KEY, readPref, writePref } from './runPrefs';

import { t } from '../../lib/i18n';
const WEEKDAYS = [t('Seg'), t('Ter'), t('Qua'), t('Qui'), t('Sex'), t('Sáb'), t('Dom')];
const LEVEL_LABEL = { iniciante: t('Iniciante'), intermediario: t('Intermediário'), avancado: t('Avançado') };

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

const pad2 = n => String(n).padStart(2, '0');

// Corrida feita sem gravar pelo app: esteira, relógio, ou o celular ficou em casa.
export function ManualRunForm({ userId, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState(() => {
    const d = new Date(Date.now() - 45 * 60000);
    return {
      date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
      hours: '', minutes: '', seconds: '', km: '', title: '', treadmill: true, visibility: 'amigos',
    };
  });
  const [busy, setBusy] = useState(false);
  const [shoes, setShoes] = useState(() => cachedShoes(userId));
  const [shoeId, setShoeId] = useState(() => defaultShoeId(cachedShoes(userId)));
  useEffect(() => {
    let alive = true;
    fetchShoes(userId).then(list => { if (alive) setShoes(list); });
    return () => { alive = false; };
  }, [userId]);
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const field = (key, label, props = {}) => (
    <div className="profile-field">
      <label className="profile-field__label" htmlFor={`runManual-${key}`}>{label}</label>
      <input id={`runManual-${key}`} className="input" value={form[key]} onChange={e => set(key, e.target.value)} {...props} />
    </div>
  );

  async function handleSave(e) {
    e.preventDefault();
    const { record, error } = manualRun({ ...form, shoeId });
    if (error) return toast(error);
    setBusy(true);
    let previous = [];
    let loaded = false;
    try { previous = await fetchRuns(userId); loaded = true; } catch { /* sem rede: sem recorde agora */ }
    const { pending } = await saveRun(userId, record);
    rememberShoe(shoeId);
    const records = newRecords(previous, record);
    const shoe = shoes.find(x => x.id === shoeId);
    const shoeNotice = shoe ? shoeWearNotice(shoe, shoeUsage([shoe], previous)[shoe.id], record.distance_m) : null;
    const medals = loaded ? newMedals(previous, [...previous, record], todayDate()) : [];
    trackEvent('run', 'manual');
    setBusy(false);
    window.dispatchEvent(new CustomEvent(RUN_SAVED_EVENT));
    onClose();
    if (pending) toast(t('📶 Sem internet — a corrida fica no aparelho e sobe sozinha depois'));
    else if (records.length) toast(t('🏆 Novo recorde — {v1}!', { v1: records.map(describeRecord).join(', ') }));
    else if (medals.length) toast(t('🏅 Medalha: {v1}!', { v1: medals.map(m => m.title).join(', ') }));
    else if (shoeNotice) toast(shoeNotice);
    else toast(t('✅ Corrida salva: {v1} km em {v2}', { v1: formatKm(record.distance_m), v2: formatClock(record.duration_s) }));
  }

  return (
    <form className="dash-card run-setup" onSubmit={handleSave} aria-label={t('Lançar corrida')}>
      <h2 className="run-setup__title">{t('Lançar corrida')}</h2>
      <p className="run-setup__text">{t('Para a corrida que você não gravou pelo app: esteira, relógio ou celular em casa.')}</p>
      <div className="run-chips" role="group" aria-label={t('Onde')}>
        {[[true, t('Esteira')], [false, t('Rua')]].map(([v, label]) => (
          <button key={label} type="button" aria-pressed={form.treadmill === v} className={`run-chip${form.treadmill === v ? ' run-chip--on' : ''}`} onClick={() => set('treadmill', v)}>{label}</button>
        ))}
      </div>
      <div className="run-manual__row">
        {field('date', t('Data'), { type: 'date', max: todayDate() })}
        {field('time', t('Início'), { type: 'time' })}
      </div>
      {field('km', t('Distância (km)'), { inputMode: 'decimal', placeholder: '5,0' })}
      <div className="profile-field">
        <span className="profile-field__label" id="runManualTime">{t('Tempo')}</span>
        <div className="run-manual__clock" role="group" aria-labelledby="runManualTime">
          {[['hours', t('h')], ['minutes', t('min')], ['seconds', t('s')]].map(([key, unit]) => (
            <input
              key={key} className="input" inputMode="numeric" placeholder={unit} aria-label={unit}
              value={form[key]} onChange={e => set(key, e.target.value.replace(/\D/g, '').slice(0, 2))}
            />
          ))}
        </div>
      </div>
      <ShoePicker id="runManualShoe" shoes={shoes} value={shoeId} onChange={setShoeId} />
      {field('title', t('Título (opcional)'), { maxLength: 80, placeholder: form.treadmill ? t('Corrida na esteira') : t('Corrida da manhã') })}
      <div className="profile-field">
        <span className="profile-field__label" id="runManualVis">{t('Quem vê')}</span>
        <div className="run-chips" role="group" aria-labelledby="runManualVis">
          {[['amigos', t('👥 Amigos')], ['privado', t('🔒 Só eu')]].map(([v, label]) => (
            <button key={v} type="button" aria-pressed={form.visibility === v} className={`run-chip${form.visibility === v ? ' run-chip--on' : ''}`} onClick={() => set('visibility', v)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="run-setup__actions">
        <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>{t('Cancelar')}</button>
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? t('Salvando…') : t('Salvar corrida')}</button>
      </div>
    </form>
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
  const [manualOpen, setManualOpen] = useState(false);
  const [guidedOpen, setGuidedOpen] = useState(false);
  const [gpxOpen, setGpxOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState(() => readPref(GPS_KEY) && geoSupported());
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

  async function saveProgram({ goal, nivel, start }) {
    setBusy(true);
    const { error } = await updateProfile({ runGoal: goal, runNivel: nivel, runStart: start || mondayOf(today) });
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

  // custom: sessão montada no treino guiado (GuidedSetup).
  function begin(withSession, custom = null) {
    if (getLiveRun()) return;
    writePref(GPS_KEY, gps);
    const s = custom || (withSession && planned ? { ...session, week: where.week || null, dayIndex: where.dayIndex } : null);
    setGuidedOpen(false);
    // iPhone: a permissão do acelerômetro (cadência) só pode ser pedida no toque.
    requestMotionPermission();
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
        {!gpxOpen && !live && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setGpxOpen(true); setManualOpen(false); setGuidedOpen(false); }}>
            {t('📥 Importar corrida de outro app (GPX)')}
          </button>
        )}
        {doneToday && <p className="run-today__done">{t('✅ Corrida de hoje registrada')}</p>}
        {!guidedOpen && !live && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setGuidedOpen(true); setManualOpen(false); setGpxOpen(false); }}>
            {t('🎯 Treino guiado: intervalado ou ritmo alvo')}
          </button>
        )}
        {!manualOpen && !live && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setManualOpen(true); setGuidedOpen(false); setGpxOpen(false); }}>
            {t('＋ Lançar corrida feita sem o app (esteira, relógio)')}
          </button>
        )}
      </div>

      {gpxOpen && <GpxImport onClose={() => setGpxOpen(false)} />}
      {guidedOpen && <GuidedSetup gps={gps} onStart={s => begin(false, s)} onCancel={() => setGuidedOpen(false)} />}
      {manualOpen && <ManualRunForm userId={user?.id} onClose={() => setManualOpen(false)} />}

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

      <RunRace runs={runs} today={today} onProgram={saveProgram} />
    </section>
  );
}
