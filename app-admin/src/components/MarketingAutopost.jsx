import { useEffect, useState } from 'react';
import { PLATFORMS, STATUS_LABEL, autopostSchedule, brtDay, fetchAutopost, setAutopostEnabled, splitCaption } from '../lib/marketing';

const FORMAT_LABEL = { feed: 'Feed', reel: 'Reel', story: 'Story' };
const STATUS_BADGE = { published: 'badge--ok', failed: 'badge--danger', processing: 'badge--warning', pending: '', canceled: '' };
const TZ = 'America/Sao_Paulo';

function hourBRT(date) {
  return `${new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', timeZone: TZ })}h`;
}

function dayLabel(date, today) {
  const day = brtDay(date);
  if (day === today) return 'Hoje';
  const tomorrow = new Date(new Date(`${today}T12:00:00Z`).getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const long = new Date(date).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: TZ });
  return day === tomorrow ? `Amanhã · ${long}` : long;
}

// Redes que recebem o formato (as contas conectadas e ok; story não vai ao Threads).
function networksFor(format, accounts) {
  const names = (accounts || [])
    .filter(a => a.status === 'ok' && PLATFORMS[a.platform] && (format === 'feed' || a.platform !== 'threads')
      && ['facebook', 'instagram', 'threads'].includes(a.platform))
    .map(a => PLATFORMS[a.platform].label);
  return [...new Set(names)];
}

function Preview({ item, format, accounts }) {
  const { body, tags } = splitCaption(item.caption);
  const media = item.media || [];
  const networks = networksFor(format, accounts);
  return (
    <div className="mkt-planned">
      <div className="mkt-planned__thumbs">
        {media.slice(0, 3).map(m => (m.type === 'video'
          ? <video key={m.url} src={`${m.url}#t=1`} width="56" height="100" muted playsInline preload="metadata" />
          : <img key={m.url} src={m.url} alt="" width="56" height="70" loading="lazy" />))}
        {media.length > 3 && <span className="user-detail__meta">+{media.length - 3}</span>}
      </div>
      <div className="stack">
        <div>
          <strong>{FORMAT_LABEL[format]}</strong>
          {media.length > 1 && ` · carrossel de ${media.length} imagens`}
          {networks.length > 0 && ` · ${networks.join(', ')}`}
        </div>
        {format === 'story'
          ? <div className="user-detail__meta">Story: só a imagem, sem legenda.</div>
          : (
            <>
              <div className="mkt-planned__caption">{body || <em>(sem legenda)</em>}</div>
              {tags.length > 0 && <div className="user-detail__meta">Hashtags: {tags.join(' ')}</div>}
            </>
          )}
      </div>
    </div>
  );
}

// Cartão em Marketing → Publicar: a agenda da publicação automática (feed 12h
// e story 19h, horário de Brasília) dia a dia com legenda e hashtags, o que já
// saiu em cada rede e o botão de pausar. `posts` e `accounts` vêm da página.
export default function MarketingAutopost({ posts = [], accounts = [] }) {
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
  const count = format => state.pending.filter(i => i.format === format).length;
  const problems = posts.filter(p => p.targets?.some(t => t.status === 'failed' || t.status === 'processing'));

  // Agenda da fila (se ligada) + posts agendados à mão e ainda não publicados.
  const planned = [
    ...(state.enabled ? autopostSchedule(state.pending, now).map(s => ({ key: s.item.id, at: s.at, format: s.format, item: s.item, auto: true })) : []),
    ...posts
      .filter(p => p.scheduled_at && new Date(p.scheduled_at) > now && p.targets?.some(t => t.status === 'pending'))
      .map(p => ({ key: p.id, at: new Date(p.scheduled_at), format: p.format, item: p, auto: false })),
  ].sort((a, b) => a.at - b.at);
  const days = [];
  for (const p of planned) {
    const day = brtDay(p.at);
    const last = days[days.length - 1];
    if (last && last.day === day) last.items.push(p);
    else days.push({ day, items: [p] });
  }

  const postById = new Map(posts.map(p => [p.id, p]));
  const published = state.items
    .filter(i => i.posted_at)
    .sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at))
    .slice(0, 10);
  const accountById = new Map(accounts.map(a => [a.id, a]));

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
    <section className="card stack" aria-label="Publicação automática">
      <div className="actions-row">
        <h2>Publicação automática</h2>
        <button type="button" className="btn btn--small" onClick={toggle} disabled={busy}>
          {state.enabled ? 'Pausar' : 'Ligar'}
        </button>
      </div>
      <p>
        <span className={`badge ${state.enabled ? 'badge--ok' : 'badge--warning'}`}>{state.enabled ? 'Ligada' : 'Pausada'}</span>
        {' '}Todo dia: feed às 12h e Reel às 17h (Instagram, Facebook e Threads) e story às 19h (Instagram e Facebook).
      </p>
      <p className="user-detail__meta">
        Resumo da fila: {state.posted} já publicados · faltam {count('feed')} no feed, {count('reel')} em Reels e {count('story')} em stories.
        {state.pending.length === 0 && ' A fila acabou: o painel não publica mais sozinho.'}
      </p>
      {msg && <p role="alert">{msg}</p>}

      <h3>Programado</h3>
      {days.length === 0 && (
        <p className="user-detail__meta">
          {state.enabled ? 'Nada programado.' : 'Pausada: nada sai sozinho. Os posts agendados à mão continuam valendo.'}
        </p>
      )}
      {days.map(d => (
        <div key={d.day} className="stack">
          <h4>{dayLabel(d.items[0].at, today)}</h4>
          <ul className="stack">
            {d.items.map(p => (
              <li key={p.key} className="stack">
                <div><strong>{hourBRT(p.at)}</strong>{p.auto ? ' · automático' : ' · agendado à mão'}</div>
                <Preview item={p.item} format={p.format} accounts={accounts} />
              </li>
            ))}
          </ul>
        </div>
      ))}

      {problems.length > 0 && (
        <>
          <h3>Em andamento ou com problema</h3>
          <ul className="mkt-targets">
            {problems.flatMap(p => p.targets.filter(t => t.status === 'failed' || t.status === 'processing').map(t => {
              const a = accountById.get(t.account_id);
              return (
                <li key={t.id}>
                  <span>{FORMAT_LABEL[p.media?.[0]?.type === 'video' && p.format === 'feed' ? 'reel' : p.format] || p.format} · {(p.caption || '').split('\n')[0].slice(0, 50) || 'story'}</span>
                  <span>{a ? PLATFORMS[a.platform]?.label : 'Conta removida'}</span>
                  <span className={`badge ${STATUS_BADGE[t.status] || ''}`}>{STATUS_LABEL[t.status] || t.status}</span>
                  {t.status === 'failed' && t.error && <span className="user-detail__meta">{t.error}</span>}
                </li>
              );
            }))}
          </ul>
        </>
      )}

      <h3>Já publicado</h3>
      {published.length === 0 && <p className="user-detail__meta">Nada publicado ainda pela fila automática.</p>}
      <ul className="stack">
        {published.map(i => {
          const post = i.post_id ? postById.get(i.post_id) : null;
          return (
            <li key={i.id} className="stack">
              <div>
                <strong>{dayLabel(i.posted_at, today)} às {hourBRT(i.posted_at)}</strong>
                {' · '}{FORMAT_LABEL[i.format]}
              </div>
              <Preview item={i} format={i.format} accounts={accounts} />
              {post && (
                <ul className="mkt-targets">
                  {post.targets.map(t => {
                    const a = accountById.get(t.account_id);
                    return (
                      <li key={t.id}>
                        <span>{a ? PLATFORMS[a.platform]?.label : 'Conta removida'}</span>
                        <span className={`badge ${STATUS_BADGE[t.status] || ''}`}>{STATUS_LABEL[t.status] || t.status}</span>
                        {t.permalink && <a href={t.permalink} target="_blank" rel="noreferrer">ver post</a>}
                        {t.status === 'failed' && t.error && <span className="user-detail__meta">{t.error}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
