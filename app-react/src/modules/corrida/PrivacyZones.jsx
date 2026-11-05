import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { trackEvent } from '../../lib/tracking';
import { t } from '../../lib/i18n';
import { cleanZones, ZONE_RADII, MAX_ZONES } from './route';
import { applyZonesToRuns, RUN_SAVED_EVENT } from './runs';
import { geoSupported } from './useGeoTracker';

// Posição pior que isso (m) não serve para marcar a zona.
const MAX_ZONE_ACCURACY_M = 100;
const NAMES = [t('Casa'), t('Trabalho'), t('Outro lugar')];

function currentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
  });
}

// Zonas de privacidade do EAFIT Run (aba Você): lugares em volta dos quais o
// percurso nunca aparece no mapa, além dos 200 m das pontas. Ficam na conta
// (user_metadata.runZones), valem para as próximas corridas e são aplicadas
// na hora às já salvas.
export default function PrivacyZones() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const zones = cleanZones(user?.user_metadata?.runZones);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(NAMES[0]);
  const [radius, setRadius] = useState(ZONE_RADII[1]);
  const [busy, setBusy] = useState(false);

  async function save(next, message) {
    const { error } = await updateProfile({ runZones: next });
    if (error) {
      toast(t('⚠️ Não foi possível salvar — tente novamente'));
      return false;
    }
    let changed = 0;
    try { changed = await applyZonesToRuns(user.id, next); } catch (err) { console.error('applyZonesToRuns:', err); }
    if (changed) window.dispatchEvent(new CustomEvent(RUN_SAVED_EVENT));
    toast(changed ? t('{v1} — {v2} corrida(s) atualizada(s)', { v1: message, v2: changed }) : message);
    return true;
  }

  async function handleAdd() {
    if (!geoSupported()) return toast(t('📡 Este aparelho não tem GPS no navegador'));
    setBusy(true);
    try {
      const pos = await currentPosition();
      const acc = Math.round(pos.coords.accuracy);
      if (!(acc <= MAX_ZONE_ACCURACY_M)) {
        toast(t('📡 Localização imprecisa (±{v1} m) — tente de novo perto da janela ou ao ar livre', { v1: acc }));
        return;
      }
      const next = cleanZones([...zones, { lat: pos.coords.latitude, lon: pos.coords.longitude, r: radius, name }]);
      if (await save(next, t('🛡️ Zona “{v1}” criada', { v1: name }))) {
        trackEvent('run_zone', String(radius));
        setAdding(false);
      }
    } catch (err) {
      toast(err?.code === 1 ? t('📡 Localização negada — libere nas configurações do navegador') : t('📡 Não foi possível ler a localização'));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(index) {
    setBusy(true);
    await save(zones.filter((_, i) => i !== index), t('Zona removida'));
    setBusy(false);
  }

  return (
    <div className="section-group">
      <div className="section-group__label">{t('Zonas de privacidade')}</div>
      <div className="dash-card run-zones">
        <p className="profile-field__hint">
          {t('O percurso nunca aparece no mapa perto destes lugares, além dos 200 m do começo e do fim de toda corrida. Vale também para as corridas já salvas.')}
        </p>
        {zones.length > 0 && (
          <ul className="run-zones__list">
            {zones.map((z, i) => (
              <li key={`${z.lat},${z.lon},${i}`}>
                <span>🛡️ <strong>{z.name || t('Zona {v1}', { v1: i + 1 })}</strong> · {t('{v1} m em volta', { v1: z.r })}</span>
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => handleRemove(i)}>{t('Remover')}</button>
              </li>
            ))}
          </ul>
        )}
        {adding ? (
          <div className="run-zones__form">
            <div className="run-chips" role="group" aria-label={t('Nome da zona')}>
              {NAMES.map(n => (
                <button key={n} type="button" className={`run-chip${name === n ? ' run-chip--on' : ''}`} aria-pressed={name === n} onClick={() => setName(n)}>{n}</button>
              ))}
            </div>
            <div className="run-chips" role="group" aria-label={t('Tamanho da zona')}>
              {ZONE_RADII.map(r => (
                <button key={r} type="button" className={`run-chip${radius === r ? ' run-chip--on' : ''}`} aria-pressed={radius === r} onClick={() => setRadius(r)}>{t('{v1} m', { v1: r })}</button>
              ))}
            </div>
            <p className="profile-field__hint">{t('Fique no lugar que quer esconder e toque no botão: o app usa a sua posição agora como centro da zona.')}</p>
            <div className="run-zones__actions">
              <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleAdd}>
                {busy ? t('Lendo a localização…') : t('📍 Usar minha localização agora')}
              </button>
              <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setAdding(false)}>{t('Cancelar')}</button>
            </div>
          </div>
        ) : zones.length < MAX_ZONES && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAdding(true)}>{t('+ Criar zona de privacidade')}</button>
        )}
        {zones.length > 0 && <p className="profile-field__hint">{t('Tirar uma zona não traz de volta os trechos já escondidos.')}</p>}
      </div>
    </div>
  );
}
