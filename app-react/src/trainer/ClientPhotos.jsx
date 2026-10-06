import { useEffect, useState } from 'react';
import { fmtDate } from '../lib/utils';
import { fetchClientPhotos, beforeAfter } from '../lib/trainerPhotos';
import Skeleton from '../components/Skeleton';

// Fotos de evolução que o aluno escolheu compartilhar (só leitura): antes e
// depois no topo e a linha do tempo completa embaixo. Toque numa foto para ampliar.
export default function ClientPhotos({ client }) {
  const [state, setState] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let active = true;
    fetchClientPhotos(client.id)
      .then(r => { if (active) setState(r); })
      .catch(err => { console.error('fetchClientPhotos:', err); if (active) setState({ shared: false, photos: [], failed: true }); });
    return () => { active = false; };
  }, [client.id]);

  const ba = state ? beforeAfter(state.photos) : null;

  return (
    <div className="dash-card">
      <div className="dash-card__title">📸 Fotos de evolução</div>
      {!state && <Skeleton height={80} />}
      {state && !state.shared && (
        <p className="dash-empty">
          {state.failed ? 'Não foi possível carregar as fotos agora.' : `${client.name} não compartilhou as fotos de evolução com você.`}
        </p>
      )}
      {state && state.shared && state.photos.length === 0 && <p className="dash-empty">O aluno ainda não tem fotos.</p>}
      {ba && (
        <div className="photo-compare">
          {[['Antes', ba.before], ['Depois', ba.after]].map(([label, p]) => (
            <button type="button" key={label} className="photo-compare__item" onClick={() => setOpen(p)}>
              <img src={p.url} alt={`${label}: ${fmtDate(p.date)}`} loading="lazy" />
              <span>{label} · {fmtDate(p.date)}</span>
            </button>
          ))}
        </div>
      )}
      {state && state.photos.length > 0 && (
        <div className="photo-strip">
          {state.photos.map(p => (
            <button type="button" key={p.id} onClick={() => setOpen(p)} aria-label={`Foto de ${fmtDate(p.date)}`}>
              <img src={p.url} alt="" loading="lazy" />
              <small>{fmtDate(p.date)}</small>
            </button>
          ))}
        </div>
      )}
      {open && (
        <button type="button" className="photo-zoom" onClick={() => setOpen(null)} aria-label="Fechar foto">
          <img src={open.url} alt={`Foto de ${fmtDate(open.date)}`} />
          <span>{fmtDate(open.date)}{open.note ? ` · ${open.note}` : ''}</span>
        </button>
      )}
    </div>
  );
}
