import { newAchievements } from './runReadings';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { trackEvent } from '../../lib/tracking';
import { elapsedMs, finishRun, splitsOf, setLiveRun } from './liveRun';
import { elevationGain, kmElevOf } from './elevation';
import { fetchWeather, startPosition, weatherShort, weatherDetail } from './weather';
import { useStartWeather } from './useStartWeather';
import { averageCadence } from './cadence';
import { heartOf, hrText } from './heartRate';
import HrZones from './HrZones';
import IntervalResults from './IntervalResults';
import { GhostResult } from './GhostBar';
import SplitBars from './SplitBars';
import { ShoePicker } from './Shoes';
import { newMedals } from './challenges';
import { todayDate } from '../../data/treinoData';
import { RUN_SAVED_EVENT, defaultRunTitle, saveRun, fetchRuns, newRecords, describeRecord, formatClock, formatKm, fetchShoes, cachedShoes, defaultShoeId, rememberShoe, shoeUsage, shoeWearNotice } from './runs';
import { privateRoute } from './route';
import RouteDrawing from './RouteDrawing';
import { t } from '../../lib/i18n';

// Tela de fechar a corrida: distância, esforço, notas, tênis e salvar (LiveRunHost.jsx).

const EFFORTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function FinishRun({ run, now, onBack, onDone }) {
  const { user } = useAuth();
  const toast = useToast();
  const [km, setKm] = useState(() => formatKm(run.meters));
  // Só conta como distância corrigida se a pessoa mexeu no campo: o valor
  // mostrado é arredondado e não pode apagar o tempo por km do GPS.
  const [edited, setEdited] = useState(false);
  const [effort, setEffort] = useState(null);
  const [notes, setNotes] = useState('');
  const [title, setTitle] = useState(() => defaultRunTitle(run.startedAt));
  const [visibility, setVisibility] = useState('amigos');
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const totalS = Math.floor(elapsedMs(run, now) / 1000);
  const zones = user?.user_metadata?.runZones;
  const [shoes, setShoes] = useState(() => cachedShoes(user.id));
  const [shoeId, setShoeId] = useState(() => defaultShoeId(cachedShoes(user.id)));
  const shoeTouched = useRef(false);
  useEffect(() => {
    let alive = true;
    fetchShoes(user.id).then(list => {
      if (!alive) return;
      setShoes(list);
      if (!shoeTouched.current) setShoeId(defaultShoeId(list));
    });
    return () => { alive = false; };
  }, [user.id]);
  const gain = run.gps ? elevationGain(run.elev) : null;
  const cadence = averageCadence(run.steps, run.stepMs);
  // Clima de onde a corrida começou, já na tela de resumo (ao salvar, o mesmo clima vai com a corrida).
  const weather = useStartWeather(run.gps ? startPosition(run.route) : null);

  async function handleSave() {
    const parsed = Number(String(km).replace(',', '.'));
    if (edited && (!Number.isFinite(parsed) || parsed < 0 || parsed > 500)) return toast(t('⚠️ Distância inválida'));
    setBusy(true);
    const record = finishRun(run, { meters: edited ? parsed * 1000 : undefined, effort, notes, title, visibility, zones, shoeId });
    let previous = [];
    let loaded = false;
    // O clima do começo do percurso (até 4 s; sem internet salva sem ele) busca junto com a lista, sem somar espera.
    const weatherPromise = record.gps ? fetchWeather(run.route) : Promise.resolve(null);
    try { previous = await fetchRuns(user.id); loaded = true; } catch { /* sem rede: sem recorde agora */ }
    // Se a consulta de agora falhar (4 s, sem rede), vale o clima que a tela já mostrava.
    record.weather = (await weatherPromise) || weather;
    const out = await saveRun(user.id, record);
    if (out.lost) { setBusy(false); return toast(t('⚠️ Sem espaço no aparelho para guardar a corrida. Libere espaço e toque em salvar de novo')); }
    const { pending } = out;
    rememberShoe(shoeId);
    const others = previous.filter(r => r.client_id !== record.client_id);
    const records = newRecords(others, record);
    const shoe = shoes.find(x => x.id === shoeId);
    const shoeNotice = shoe ? shoeWearNotice(shoe, shoeUsage([shoe], others)[shoe.id], record.distance_m) : null;
    // Sem a lista (sem internet), toda medalha pareceria nova: só com ela carregada.
    const medals = loaded ? newMedals(others, [...others, record], todayDate()) : [];
    const achieved = loaded ? newAchievements(others, [...others, record]) : [];
    trackEvent('run', record.kind);
    setLiveRun(null);
    setBusy(false);
    onDone(record); // a tela "Corrida salva" (SavedRun) segue aberta depois que a corrida acaba
    window.dispatchEvent(new CustomEvent(RUN_SAVED_EVENT));
    if (pending && out.rejected) toast(t('⚠️ O servidor não aceitou a corrida agora — ela fica no aparelho e tentamos de novo depois'));
    else if (pending) toast(t('📶 Sem internet — a corrida fica no aparelho e sobe sozinha depois'));
    else if (records.length) toast(t('🏆 Novo recorde — {v1}!', { v1: records.map(describeRecord).join(', ') }));
    else if (medals.length) toast(t('🏅 Medalha: {v1}!', { v1: medals.map(m => m.title).join(', ') }));
    else if (achieved.length) toast(t('🎖️ Conquista: {v1}!', { v1: achieved.map(a => a.title).join(', ') }));
    else if (shoeNotice) toast(shoeNotice);
    else toast(t('✅ Corrida salva: {v1} km em {v2}', { v1: formatKm(record.distance_m), v2: formatClock(record.duration_s) }));
  }

  function handleDiscard() {
    if (!confirmDiscard) { setConfirmDiscard(true); return; }
    setLiveRun(null);
    onDone(null);
    toast(t('Corrida descartada'));
  }

  return (
    <div className="run-live run-live--finish" role="dialog" aria-modal="true" aria-label={t('Finalizar corrida')}>
      <div className="run-live__top">
        <span className="run-live__brand">EAFIT · Run</span>
      </div>
      <h2 className="run-live__title">{t('Fim da corrida')}</h2>
      <div className="run-live__clock run-live__clock--small">{formatClock(totalS)}</div>
      {weather && (
        <div className="run-live__weather" aria-label={t('Clima')}>
          <span>{weatherShort(weather)}</span>
          {weatherDetail(weather) && <span>{weatherDetail(weather)}</span>}
        </div>
      )}
      {run.ghost && <GhostResult ghost={run.ghost} totalS={totalS} meters={edited ? (Number(String(km).replace(',', '.')) || 0) * 1000 : run.meters} />}
      {(gain !== null || cadence) && (
        <div className="run-live__extra">
          {gain !== null && <span>{t('↗ {v1} m de subida', { v1: gain })}</span>}
          {cadence && <span>{t('👣 {v1} passos/min', { v1: cadence })}</span>}
        </div>
      )}

      {heartOf(run) && (
        <>
          <p className="run-live__extra">{hrText(heartOf(run))}</p>
          <HrZones zones={heartOf(run).z} />
        </>
      )}

      {run.reps?.length > 0 && (
        <div className="profile-field">
          <span className="profile-field__label">{t('Seus tiros')}</span>
          <IntervalResults reps={run.reps} />
        </div>
      )}

      <div className="profile-field">
        <label className="profile-field__label" htmlFor="runTitle">{t('Título')}</label>
        <input id="runTitle" className="input" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} />
      </div>

      <div className="profile-field">
        <label className="profile-field__label" htmlFor="runKm">{t('Distância (km)')}</label>
        <input id="runKm" className="input" inputMode="decimal" value={km} onChange={e => { setKm(e.target.value); setEdited(true); }} />
        {run.gps && run.meters > 0 && <span className="profile-field__hint">{t('Medida pelo GPS. Corrigir a distância apaga o tempo por km desta corrida.')}</span>}
      </div>

      {run.gps && (
        <div className="run-live__route-preview">
          <RouteDrawing route={privateRoute(run.route, zones)} splits={splitsOf(run.kmMarks)} detail width={320} height={150} />
          <span className="profile-field__hint">{t('🔒 Por privacidade, os primeiros e os últimos 200 m do percurso não são salvos.')}</span>
        </div>
      )}

      {!edited && <SplitBars splits={splitsOf(run.kmMarks)} elev={run.gps ? kmElevOf(run.kmElev, run.kmMarks.length) : null} />}

      <ShoePicker shoes={shoes} value={shoeId} onChange={id => { shoeTouched.current = true; setShoeId(id); }} />

      <div className="profile-field">
        <span className="profile-field__label" id="runEffortLabel">{t('Esforço (1 = leve, 10 = máximo)')}</span>
        <div className="run-effort" role="group" aria-labelledby="runEffortLabel">
          {EFFORTS.map(n => (
            <button
              key={n} type="button" aria-pressed={effort === n}
              className={`run-effort__btn${effort === n ? ' run-effort__btn--on' : ''}`}
              onClick={() => setEffort(effort === n ? null : n)}
            >{n}</button>
          ))}
        </div>
      </div>

      <div className="profile-field">
        <label className="profile-field__label" htmlFor="runNotes">{t('Anotações')}</label>
        <textarea id="runNotes" className="input" rows={2} maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('Como foi? Percurso, clima, dor…')} />
      </div>

      <div className="profile-field">
        <span className="profile-field__label" id="runVisLabel">{t('Quem vê')}</span>
        <div className="run-chips" role="group" aria-labelledby="runVisLabel">
          {[['amigos', t('👥 Amigos')], ['privado', t('🔒 Só eu')]].map(([v, label]) => (
            <button key={v} type="button" aria-pressed={visibility === v} className={`run-chip${visibility === v ? ' run-chip--on' : ''}`} onClick={() => setVisibility(v)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="run-live__actions">
        <button type="button" className="btn btn--ghost run-live__btn" onClick={onBack} disabled={busy}>{t('Voltar')}</button>
        <button type="button" className="btn btn--primary run-live__btn" onClick={handleSave} disabled={busy}>{busy ? t('Salvando…') : t('Salvar corrida')}</button>
      </div>
      <button type="button" className="btn btn--ghost btn--sm run-live__discard" onClick={handleDiscard} disabled={busy}>
        {confirmDiscard ? t('Toque de novo para descartar') : t('Descartar corrida')}
      </button>
    </div>
  );
}
