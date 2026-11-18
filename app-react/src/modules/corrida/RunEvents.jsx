import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { trackEvent } from '../../lib/tracking';
import { parseLocalDate } from '../../lib/utils';
import { t, locale, decimal } from '../../lib/i18n';
import { raceFromMetadata } from './race';
import {
  EVENT_BANDS, EVENT_RADII, DEFAULT_RADIUS, fetchRunEvents, nearbyEvents, readLocation, writeLocation,
  formatEventKm, raceFromEvent, eventPlace,
} from './events';

const SHOWN = 5;

const dayText = date => {
  const d = parseLocalDate(date);
  return {
    day: String(d.getDate()).padStart(2, '0'),
    month: d.toLocaleDateString(locale, { month: 'short' }).replace('.', '').toUpperCase(),
    weekday: d.toLocaleDateString(locale, { weekday: 'short' }).replace('.', ''),
  };
};

const distLabel = km => (km === Math.round(km) ? `${km} km` : `${decimal(km)} km`);

function EventRow({ event, picked, busy, onPick }) {
  const [km, setKm] = useState(event.distances[0] || 0);
  const when = dayText(event.date);
  const isPicked = picked && picked.date === event.date && picked.name === event.name.slice(0, 60);
  return (
    <li className="run-event">
      <div className="run-event__date" aria-hidden="true">
        <strong>{when.day}</strong><span>{when.month}</span>
      </div>
      <div className="run-event__body">
        <strong className="run-event__name">{event.name}</strong>
        <span className="run-challenge__meta">
          {when.weekday} · {eventPlace(event)}{event.km != null ? ` · ${t('a {v1}', { v1: formatEventKm(event.km) })}` : ''}
        </span>
        {event.venue && <span className="profile-field__hint">{t('Largada: {v1}', { v1: event.venue })}</span>}
        {event.distances.length > 1 ? (
          <div className="run-chips" role="group" aria-label={t('Distância')}>
            {event.distances.map(d => (
              <button key={d} type="button" aria-pressed={km === d} className={`run-chip${km === d ? ' run-chip--on' : ''}`} onClick={() => setKm(d)}>{distLabel(d)}</button>
            ))}
          </div>
        ) : event.distances.length === 1 && <span className="profile-field__hint">{distLabel(event.distances[0])}</span>}
        <div className="run-setup__actions run-event__actions">
          {event.distances.length > 0 && (
            <button type="button" className="btn btn--outline btn--sm" disabled={busy || isPicked} onClick={() => onPick(event, km)}>
              {isPicked ? t('✓ É a sua prova') : t('Quero participar')}
            </button>
          )}
          {event.url && (
            <a className="btn btn--ghost btn--sm" href={event.url} target="_blank" rel="noopener noreferrer">{t('Inscrição ↗')}</a>
          )}
        </div>
      </div>
    </li>
  );
}

// Aba Gravar: provas aprovadas pelo admin perto da pessoa. "Quero participar"
// marca a prova em "Sua prova" (contagem regressiva e programa de treino).
export default function RunEvents({ today }) {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [events, setEvents] = useState(null);
  const [loc, setLoc] = useState(readLocation);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [band, setBand] = useState('');
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  const race = raceFromMetadata(user?.user_metadata);

  useEffect(() => {
    let alive = true;
    fetchRunEvents(today).then(list => { if (alive) setEvents(list); }).catch(() => { if (alive) setEvents([]); });
    return () => { alive = false; };
  }, [today]);

  const states = useMemo(() => [...new Set((events || []).map(e => e.state).filter(Boolean))].sort(), [events]);
  const list = useMemo(() => nearbyEvents(events || [], { loc, radius, band }), [events, loc, radius, band]);

  if (!events?.length) return null; // sem provas cadastradas, sem card

  function choose(next) {
    writeLocation(next);
    setLoc(next);
    setAll(false);
  }

  function useMyLocation() {
    if (!navigator.geolocation) { setLocError(t('Este aparelho não informa a localização. Escolha o estado.')); return; }
    setLocating(true);
    setLocError('');
    navigator.geolocation.getCurrentPosition(
      pos => { setLocating(false); choose({ lat: pos.coords.latitude, lon: pos.coords.longitude }); },
      () => { setLocating(false); setLocError(t('Não consegui sua localização. Escolha o estado.')); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  async function pick(event, km) {
    setBusy(true);
    const { error } = await updateProfile({ runRace: raceFromEvent(event, km) });
    setBusy(false);
    if (error) return toast(t('⚠️ Não foi possível salvar — tente novamente'));
    trackEvent('run_event_pick', String(km));
    toast(t('🏁 Prova marcada!'));
  }

  const visible = all ? list : list.slice(0, SHOWN);

  return (
    <div className="dash-card run-events">
      <strong>{t('📍 Próximas corridas perto de você')}</strong>

      {loc?.lat != null ? (
        <div className="run-events__where">
          <label className="profile-field__hint" htmlFor="eventsRadius">{t('Num raio de')}</label>
          <select id="eventsRadius" className="input" value={radius} onChange={e => setRadius(Number(e.target.value))}>
            {EVENT_RADII.map(r => <option key={r} value={r}>{r} km</option>)}
          </select>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => choose(null)}>{t('Mudar')}</button>
        </div>
      ) : (
        <div className="run-events__where">
          <button type="button" className="btn btn--outline btn--sm" disabled={locating} onClick={useMyLocation}>
            {locating ? t('Localizando…') : t('📍 Usar minha localização')}
          </button>
          <select className="input" aria-label={t('Estado')} value={loc?.uf || ''} onChange={e => choose(e.target.value ? { uf: e.target.value } : null)}>
            <option value="">{t('ou escolha o estado')}</option>
            {states.map(uf => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </div>
      )}
      {locError && <p className="profile-field__hint text-error" role="alert">{locError}</p>}

      <div className="run-chips" role="group" aria-label={t('Distância')}>
        {[{ key: '', label: t('Todas') }, ...EVENT_BANDS].map(b => (
          <button key={b.key} type="button" aria-pressed={band === b.key} className={`run-chip${band === b.key ? ' run-chip--on' : ''}`} onClick={() => { setBand(b.key); setAll(false); }}>{b.label}</button>
        ))}
      </div>

      {!list.length ? (
        <p className="profile-field__hint">
          {loc?.lat != null ? t('Nenhuma corrida neste raio. Aumente o raio ou escolha o estado.') : t('Nenhuma prova com esses filtros.')}
        </p>
      ) : (
        <ul className="run-events__list">
          {visible.map(e => <EventRow key={e.id} event={e} picked={race} busy={busy} onPick={pick} />)}
        </ul>
      )}
      {list.length > SHOWN && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAll(a => !a)}>
          {all ? t('Mostrar menos') : t('Ver todas ({v1})', { v1: list.length })}
        </button>
      )}
      <span className="profile-field__hint">{t('Confirme data e inscrição com o organizador.')}</span>
    </div>
  );
}
