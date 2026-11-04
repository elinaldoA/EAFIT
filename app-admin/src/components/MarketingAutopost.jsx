import { useEffect, useState } from 'react';
import { brtDay, fetchAutopost, nextAutopostSlots, setAutopostEnabled } from '../lib/marketing';

const FORMAT_LABEL = { feed: 'Feed', story: 'Story' };

function hourBRT(date) {
  return `${String(new Date(new Date(date).getTime() - 3 * 3600 * 1000).getUTCHours()).padStart(2, '0')}h`;
}

// Cartão em Marketing → Publicar: o que está programado para sair hoje (a fila
// automática e os posts agendados à mão), o que já saiu e o botão de pausar.
// `posts` é a lista de posts da página.
export default function MarketingAutopost({ posts = [] }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let alive = true;
    fetchAutopost().then(s => { if (alive) setState(s); }).catch(() => { if (alive) setState(false); });
    return () => { alive = false; };
  }, []);

  if (!state) return null; // sem migration ou sem permissão: o cartão some

  const now = new Date();
  const today = brtDay(now);
  const slots = nextAutopostSlots(state.pending, now);
  const feed = state.pending.filter(i => i.format === 'feed').length;
  const story = state.pending.filter(i => i.format === 'story').length;

  // Agendados à mão para hoje e ainda não publicados.
  const manual = posts
    .filter(p => p.scheduled_at && brtDay(p.scheduled_at) === today && p.targets?.some(t => t.status === 'pending'))
    .map(p => ({ id: p.id, format: p.format, at: new Date(p.scheduled_at), caption: p.caption, media: p.media }));

  const planned = [
    ...(state.enabled ? slots.filter(s => s.today).map(s => ({
      id: s.item.id, format: s.format, at: s.at, caption: s.item.caption, media: s.item.media, auto: true,
    })) : []),
    ...manual,
  ].sort((a, b) => a.at - b.at);
  const nextTomorrow = state.enabled ? slots.filter(s => !s.today) : [];
  const publishedToday = state.items.filter(i => i.posted_at && brtDay(i.posted_at) === today);

  async function toggle() {
    setBusy(true);
    setMsg('');
    try {
      await setAutopostEnabled(!state.enabled);
      setState({ ...state, enabled: !state.enabled });
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const row = (p, label) => (
    <li key={`${p.id}-${label}`} className="mkt-planned">
      {p.media?.[0]?.url && <img src={p.media[0].url} alt="" width="56" height="70" loading="lazy" />}
      <div>
        <strong>{label}</strong> · {FORMAT_LABEL[p.format] || p.format}
        {p.media?.length > 1 && ` (${p.media.length} imagens)`}
        {p.auto && ' · automático'}
        <div className="user-detail__meta">{p.format === 'story' ? 'Story não tem legenda.' : (p.caption || '').split('\n')[0]}</div>
      </div>
    </li>
  );

  return (
    <section className="card stack" aria-label="Publicação automática">
      <h2>Programado para hoje</h2>
      {planned.length > 0 ? (
        <ul className="stack">{planned.map(p => row(p, `Hoje às ${hourBRT(p.at)}`))}</ul>
      ) : (
        <p className="user-detail__meta">
          {state.enabled ? 'Nada mais programado para hoje.' : 'A publicação automática está pausada: nada sai sozinho.'}
        </p>
      )}
      {nextTomorrow.length > 0 && (
        <ul className="stack">{nextTomorrow.map(s => row({ id: s.item.id, format: s.format, caption: s.item.caption, media: s.item.media, auto: true }, `Amanhã às ${hourBRT(s.at)}`))}</ul>
      )}
      {publishedToday.length > 0 && (
        <p className="user-detail__meta">Já publicado hoje: {publishedToday.map(i => `${FORMAT_LABEL[i.format]} (${hourBRT(i.posted_at)})`).join(', ')}.</p>
      )}
      <p className="user-detail__meta">
        Automática {state.enabled ? 'ligada' : 'pausada'}: feed 12h (Instagram, Facebook e Threads) e story 19h (Instagram e Facebook).
        {' '}{state.posted} já publicados · faltam {feed} no feed e {story} em stories.
        {state.pending.length === 0 && ' A fila acabou: o painel não publica mais sozinho.'}
      </p>
      <div className="actions-row">
        <button type="button" className="btn btn--small" onClick={toggle} disabled={busy}>
          {state.enabled ? 'Pausar' : 'Ligar'}
        </button>
      </div>
      {msg && <p role="alert">{msg}</p>}
    </section>
  );
}
