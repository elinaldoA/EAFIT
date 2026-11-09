import { newAchievements } from './runReadings';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { trackEvent } from '../../lib/tracking';
import { parseGpx, runFromGpx, MAX_FILE_BYTES } from './gpx';
import {
  RUN_SAVED_EVENT, saveRun, fetchRuns, newRecords, describeRecord, formatKm, formatClock, formatPace, paceSeconds,
  fetchShoes, cachedShoes, defaultShoeId, rememberShoe,
} from './runs';
import { ShoePicker } from './Shoes';
import RouteDrawing from './RouteDrawing';
import { t } from '../../lib/i18n';

// Importar a corrida gravada em outro app ou relógio (arquivo GPX): escolhe o
// arquivo, mostra o que vai ser salvo e confirma.
export default function GpxImport({ onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const input = useRef(null);
  const [record, setRecord] = useState(null);
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState('amigos');
  const [shoes, setShoes] = useState(() => cachedShoes(user.id));
  const [shoeId, setShoeId] = useState(() => defaultShoeId(cachedShoes(user.id)));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchShoes(user.id).then(list => { if (alive) setShoes(list); });
    return () => { alive = false; };
  }, [user.id]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return toast(t('⚠️ Arquivo grande demais (máximo 8 MB)'));
    const { record: rec, error } = runFromGpx(parseGpx(await file.text()), { zones: user?.user_metadata?.runZones, fileName: file.name });
    if (error) return toast(error);
    setRecord(rec);
    setTitle(rec.title);
  }

  async function handleSave() {
    setBusy(true);
    const final = { ...record, title: title.trim().slice(0, 80) || record.title, visibility, shoe_id: shoeId || null };
    let previous = [];
    let loaded = false;
    try { previous = await fetchRuns(user.id); loaded = true; } catch { /* sem rede: sem recorde agora */ }
    const { pending } = await saveRun(user.id, final);
    rememberShoe(shoeId);
    const others = previous.filter(r => r.client_id !== final.client_id);
    const records = loaded ? newRecords(others, final) : [];
    const achieved = loaded ? newAchievements(others, [...others, final]) : [];
    trackEvent('run', 'gpx');
    setBusy(false);
    window.dispatchEvent(new CustomEvent(RUN_SAVED_EVENT));
    onClose();
    if (pending) toast(t('📶 Sem internet — a corrida fica no aparelho e sobe sozinha depois'));
    else if (records.length) toast(t('🏆 Novo recorde — {v1}!', { v1: records.map(describeRecord).join(', ') }));
    else if (achieved.length) toast(t('🎖️ Conquista: {v1}!', { v1: achieved.map(a => a.title).join(', ') }));
    else toast(t('✅ Corrida salva: {v1} km em {v2}', { v1: formatKm(final.distance_m), v2: formatClock(final.duration_s) }));
  }

  return (
    <div className="dash-card run-setup" role="group" aria-label={t('Importar corrida (GPX)')}>
      <h2 className="run-setup__title">{t('Importar corrida (GPX)')}</h2>
      <p className="run-setup__text">{t('Traga uma corrida gravada em outro app ou relógio. O tempo parado fora da corrida não conta.')}</p>
      <input ref={input} type="file" accept=".gpx,application/gpx+xml,text/xml,application/xml" className="run-gpx__file" onChange={handleFile} aria-label={t('Arquivo GPX')} />
      {!record ? (
        <>
          <button type="button" className="btn btn--primary" onClick={() => input.current?.click()}>{t('Escolher arquivo GPX')}</button>
          <div className="run-setup__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>{t('Cancelar')}</button>
          </div>
        </>
      ) : (
        <>
          <div className="run-gpx__summary">
            <div><span>{t('Distância')}</span><strong>{t('{v1} km', { v1: formatKm(record.distance_m) })}</strong></div>
            <div><span>{t('Tempo')}</span><strong>{formatClock(record.duration_s)}</strong></div>
            <div><span>{t('Ritmo')}</span><strong>{formatPace(paceSeconds(record.duration_s, record.distance_m))}/km</strong></div>
          </div>
          <RouteDrawing route={record.route} splits={record.splits} detail width={320} height={150} />
          <p className="profile-field__hint">{t('🔒 Por privacidade, os primeiros e os últimos 200 m do percurso não são salvos.')}</p>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="gpxTitle">{t('Título')}</label>
            <input id="gpxTitle" className="input" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <ShoePicker id="runGpxShoe" shoes={shoes} value={shoeId} onChange={setShoeId} />
          <div className="profile-field">
            <span className="profile-field__label" id="gpxVis">{t('Quem vê')}</span>
            <div className="run-chips" role="group" aria-labelledby="gpxVis">
              {[['amigos', t('👥 Amigos')], ['privado', t('🔒 Só eu')]].map(([v, label]) => (
                <button key={v} type="button" aria-pressed={visibility === v} className={`run-chip${visibility === v ? ' run-chip--on' : ''}`} onClick={() => setVisibility(v)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="run-setup__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setRecord(null)} disabled={busy}>{t('Outro arquivo')}</button>
            <button type="button" className="btn btn--primary" onClick={handleSave} disabled={busy}>{busy ? t('Salvando…') : t('Salvar corrida')}</button>
          </div>
        </>
      )}
    </div>
  );
}
