import { useEffect, useState } from 'react';
import { fetchAutopost, setAutopostEnabled } from '../lib/marketing';

// Cartão em Marketing → Publicar: a publicação automática (feed 12h e stories
// 19h, horário de Brasília) com o que ainda falta sair e o botão de pausar.
export default function MarketingAutopost() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let alive = true;
    fetchAutopost().then(s => { if (alive) setState(s); }).catch(() => { if (alive) setState(false); });
    return () => { alive = false; };
  }, []);

  if (!state) return null; // sem migration ou sem permissão: o cartão some

  const feed = state.pending.filter(i => i.format === 'feed').length;
  const story = state.pending.filter(i => i.format === 'story').length;

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

  return (
    <section className="card" aria-label="Publicação automática">
      <h2>Publicação automática</h2>
      <p>
        {state.enabled ? 'Ligada' : 'Pausada'}: todo dia o feed sai às 12h e o story às 19h no Instagram e no Facebook
        (feed também no Threads), com os prints do app.
      </p>
      <p className="user-detail__meta">
        {state.posted} já publicados · faltam {feed} no feed e {story} em stories.
        {state.pending.length === 0 && ' A fila acabou: o painel não publica mais sozinho.'}
      </p>
      <button type="button" className="btn btn--small" onClick={toggle} disabled={busy}>
        {state.enabled ? 'Pausar' : 'Ligar'}
      </button>
      {msg && <p role="alert">{msg}</p>}
    </section>
  );
}
