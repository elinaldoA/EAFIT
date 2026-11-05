import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { useWakeLock } from '../../hooks/useWakeLock';
import { useBackToClose } from '../../hooks/useBackToClose';
import { speak, cancelSpeech } from '../../lib/voice';
import { trackEvent } from '../../lib/tracking';
import { phaseAt } from '../../lib/runIntervals';
import { useGeoTracker, geoSupported } from './useGeoTracker';
import { gpsStatusText } from './gpsStatus';
import { useLiveRun, useNow } from './useLiveRun';
import {
  elapsedMs, isPaused, pauseRun, resumeRun, setDistance, finishRun, splitsOf, addRoutePoint,
  updateLiveRun, setLiveRun,
} from './liveRun';
import { RUN_SAVED_EVENT, decimal, defaultRunTitle, saveRun, fetchRuns, newRecords, describeRecord, paceSeconds, formatPace, formatClock, formatKm } from './runs';
import { SESSION_TITLE, describeSession } from './program';
import { trimRoute, cleanRoute } from './route';
import RouteDrawing from './RouteDrawing';

import { t } from '../../lib/i18n';
const VOICE_KEY = 'eafit_run_voice';

function readVoicePref() {
  try { return localStorage.getItem(VOICE_KEY) !== 'off'; } catch { return true; }
}
function writeVoicePref(on) {
  try { localStorage.setItem(VOICE_KEY, on ? 'on' : 'off'); } catch { /* sem storage */ }
}

function BackGuard({ onBlocked }) {
  useBackToClose(onBlocked);
  return null;
}

// "1 quilômetro. Tempo 6 minutos e 10 segundos. Ritmo 6:10 por quilômetro."
function kmAnnouncement(km, totalS, splitS) {
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return t('{v1} quilômetro(s). Tempo {v2} minutos e {v3} segundos. Último quilômetro em {v4}.', {
    v1: km, v2: m, v3: s, v4: formatPace(splitS).replace(':', ' e '),
  });
}

// Fica montado o tempo todo no EAFIT Run. Com corrida em andamento cuida do
// que não pode parar (GPS, tela acesa, voz a cada km, corre/caminha, proteção
// contra sair ou recarregar) e mostra a tela da corrida por cima do app.
export default function LiveRunHost() {
  const run = useLiveRun();
  const now = useNow(run);
  const toast = useToast();
  const [guardKey, setGuardKey] = useState(0);
  const [voiceOn, setVoiceOn] = useState(readVoicePref);
  const [finishing, setFinishing] = useState(false);

  const running = !!run && !isPaused(run);
  const geo = useGeoTracker({
    active: running && run.gps && geoSupported(),
    baseMeters: run?.meters || 0,
    onMeters: meters => updateLiveRun(s => setDistance(s, meters)),
    onFix: ({ lat, lon, jump }) => updateLiveRun(s => addRoutePoint(s, lat, lon, { jump })),
  });

  useWakeLock(!!run);

  useEffect(() => {
    if (!run) return undefined;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [run]);

  // Voz a cada km completo.
  const kmCount = run?.kmMarks.length || 0;
  const spokenKm = useRef(kmCount);
  useEffect(() => {
    if (!run) { spokenKm.current = 0; return; }
    if (kmCount > spokenKm.current && voiceOn) {
      const splits = splitsOf(run.kmMarks);
      speak(kmAnnouncement(kmCount, Math.round(run.kmMarks[kmCount - 1] / 1000), splits[kmCount - 1]), { queue: true });
    }
    spokenKm.current = kmCount;
  }, [kmCount, run, voiceOn]);

  // Corre/caminha: avisa a troca de fase.
  const session = run?.session;
  const runWalk = session?.type === 'corre_caminha' ? { total: session.minutes, run: session.run, walk: session.walk } : null;
  const phase = runWalk ? phaseAt(elapsedMs(run, now), runWalk) : null;
  const phaseName = phase?.phase || null;
  const lastPhase = useRef(null);
  useEffect(() => {
    if (!phaseName) { lastPhase.current = null; return; }
    if (lastPhase.current && lastPhase.current !== phaseName && voiceOn) {
      speak(phaseName === 'run' ? t('Corra!') : phaseName === 'walk' ? t('Caminhe.') : t('Tempo completo. Ótimo trabalho!'));
    }
    lastPhase.current = phaseName;
  }, [phaseName, voiceOn]);

  if (!run) return null;

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    writeVoicePref(next);
    if (!next) cancelSpeech();
  };

  return (
    <>
      <BackGuard
        key={guardKey}
        onBlocked={() => {
          toast(t('🏃 Corrida em andamento — finalize para sair'));
          setGuardKey(k => k + 1);
        }}
      />
      {finishing
        ? <FinishRun run={run} now={now} onBack={() => setFinishing(false)} onDone={() => setFinishing(false)} />
        : (
          <LiveRunScreen
            run={run} now={now} geo={geo} phase={phase} voiceOn={voiceOn} onToggleVoice={toggleVoice}
            onFinish={() => { updateLiveRun(s => pauseRun(s)); setFinishing(true); }}
          />
        )}
    </>
  );
}

function LiveRunScreen({ run, now, geo, phase, voiceOn, onToggleVoice, onFinish }) {
  const el = elapsedMs(run, now);
  const totalS = Math.floor(el / 1000);
  const paused = isPaused(run);
  const avgPace = paceSeconds(totalS, run.meters);
  const splits = splitsOf(run.kmMarks);
  const lastSplit = splits.length ? splits[splits.length - 1] : null;
  const s = run.session;
  const target = s?.minutes ? { done: el / 60000, total: s.minutes, label: t('{v1} de {v2} min', { v1: Math.floor(el / 60000), v2: s.minutes }) }
    : s?.km ? { done: run.meters / 1000, total: s.km, label: t('{v1} de {v2} km', { v1: formatKm(run.meters, 1), v2: decimal(s.km) }) }
      : null;

  return (
    <div className="run-live" role="dialog" aria-modal="true" aria-label={t('Corrida em andamento')}>
      <div className="run-live__top">
        <span className="run-live__brand">EAFIT · Run</span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onToggleVoice} aria-pressed={voiceOn}>
          {voiceOn ? t('🔊 Voz ligada') : t('🔇 Voz desligada')}
        </button>
      </div>
      <div className="run-live__session">
        <strong>{SESSION_TITLE[s?.type || 'livre']}</strong>
        {s && <span>{describeSession(s)}</span>}
      </div>

      <div className={`run-live__clock${paused ? ' run-live__clock--paused' : ''}`} aria-live="off">{formatClock(totalS)}</div>
      {paused && <div className="run-live__paused">{t('Pausada')}</div>}

      {phase && phase.phase !== 'done' && (
        <div className={`run-live__phase run-live__phase--${phase.phase}`}>
          {phase.phase === 'run' ? t('🏃 Corra') : t('🚶 Caminhe')} · {formatClock(Math.ceil(phase.remainingMs / 1000))}
        </div>
      )}

      <div className="run-live__stats">
        <div className="run-live__stat">
          <span className="run-live__value">{formatKm(run.meters)}</span>
          <span className="run-live__label">{t('km')}</span>
        </div>
        <div className="run-live__stat">
          <span className="run-live__value">{formatPace(avgPace)}</span>
          <span className="run-live__label">{t('ritmo médio /km')}</span>
        </div>
        <div className="run-live__stat">
          <span className="run-live__value">{formatPace(lastSplit)}</span>
          <span className="run-live__label">{t('último km')}</span>
        </div>
      </div>

      {target && (
        <div className="run-live__target">
          <div className="run-live__bar"><span style={{ width: `${Math.min(100, Math.round((target.done / target.total) * 100))}%` }} /></div>
          <span>{target.label}</span>
        </div>
      )}

      <RouteDrawing route={run.route} width={320} height={130} className="run-route--live" />

      <div className="run-live__gps">
        {run.gps ? (gpsStatusText(geo.status, geo.accuracy)) : t('Sem GPS: digite a distância no fim')}
      </div>

      {splits.length > 0 && (
        <ol className="run-live__splits" aria-label={t('Tempo por km')}>
          {splits.slice(-3).map((sec, i) => (
            <li key={splits.length - 3 + i}>{t('Km {v1}', { v1: Math.max(1, splits.length - 2) + i })}: {formatPace(sec)}</li>
          ))}
        </ol>
      )}

      <div className="run-live__actions">
        {paused
          ? <button type="button" className="btn btn--primary run-live__btn" onClick={() => updateLiveRun(r => resumeRun(r))}>{t('▶ Continuar')}</button>
          : <button type="button" className="btn btn--ghost run-live__btn" onClick={() => updateLiveRun(r => pauseRun(r))}>{t('⏸ Pausar')}</button>}
        <button type="button" className="btn btn--primary run-live__btn" onClick={onFinish}>{t('🏁 Finalizar')}</button>
      </div>
    </div>
  );
}

const EFFORTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function FinishRun({ run, now, onBack, onDone }) {
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

  async function handleSave() {
    const parsed = Number(String(km).replace(',', '.'));
    if (edited && (!Number.isFinite(parsed) || parsed < 0 || parsed > 500)) return toast(t('⚠️ Distância inválida'));
    setBusy(true);
    const record = finishRun(run, { meters: edited ? parsed * 1000 : undefined, effort, notes, title, visibility });
    let previous = [];
    try { previous = await fetchRuns(user.id); } catch { /* sem rede: sem recorde agora */ }
    const { pending } = await saveRun(user.id, record);
    const records = newRecords(previous.filter(r => r.client_id !== record.client_id), record);
    trackEvent('run', record.kind);
    setLiveRun(null);
    setBusy(false);
    onDone();
    window.dispatchEvent(new CustomEvent(RUN_SAVED_EVENT));
    if (pending) toast(t('📶 Sem internet — a corrida fica no aparelho e sobe sozinha depois'));
    else if (records.length) toast(t('🏆 Novo recorde — {v1}!', { v1: records.map(describeRecord).join(', ') }));
    else toast(t('✅ Corrida salva: {v1} km em {v2}', { v1: formatKm(record.distance_m), v2: formatClock(record.duration_s) }));
  }

  function handleDiscard() {
    if (!confirmDiscard) { setConfirmDiscard(true); return; }
    setLiveRun(null);
    onDone();
    toast(t('Corrida descartada'));
  }

  return (
    <div className="run-live run-live--finish" role="dialog" aria-modal="true" aria-label={t('Finalizar corrida')}>
      <div className="run-live__top">
        <span className="run-live__brand">EAFIT · Run</span>
      </div>
      <h2 className="run-live__title">{t('Fim da corrida')}</h2>
      <div className="run-live__clock run-live__clock--small">{formatClock(totalS)}</div>

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
          <RouteDrawing route={trimRoute(cleanRoute(run.route))} width={320} height={150} />
          <span className="profile-field__hint">{t('🔒 Por privacidade, os primeiros e os últimos 200 m do percurso não são salvos.')}</span>
        </div>
      )}

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
