import { useEffect, useState } from 'react';
import Loading from './Loading';
import { PLATFORMS, STATUS_LABEL, NUTRI_SLOTS, autopostSchedule, brtDay, fetchAutopost, laneLabel, setAutopostEnabled, splitCaption } from '../lib/marketing';

const FORMAT_LABEL = { feed: 'Feed', reel: 'Reel', story: 'Story' };
const STATUS_BADGE = { published: 'badge--ok', failed: 'badge--danger', processing: 'badge--warning', pending: '', canceled: '' };
const TZ = 'America/Sao_Paulo';
const UPCOMING_OPEN_DAYS = 2; // dias à vista; o resto fica num "ver mais"
const PUBLISHED_SHOWN = 5;

function hourBRT(date) {
  const d = new Date(date);
  const hour = d.toLocaleTimeString('pt-BR', { hour: '2-digit', hour12: false, timeZone: TZ }).replace(/\D/g, '').replace(/^0(?=\d)/, '');
  const minute = Number(d.toLocaleTimeString('pt-BR', { minute: '2-digit', timeZone: TZ }).replace(/\D/g, ''));
  return minute ? `${hour}h${String(minute).padStart(2, '0')}` : `${hour}h`;
}

function dayLabel(date, today) {
  const day = brtDay(date);
  if (day === today) return 'Hoje';
  const tomorrow = new Date(new Date(`${today}T12:00:00Z`).getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const long = new Date(date).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: TZ });
  return day === tomorrow ? `Amanhã · ${long}` : long;
}

// Redes que recebem a publicação automática (as contas conectadas e ok).
function networksFor(format, accounts) {
  const names = (accounts || [])
    .filter(a => a.status === 'ok' && ['facebook', 'instagram'].includes(a.platform))
    .map(a => PLATFORMS[a.platform].label);
  return [...new Set(names)];
}

function Thumb({ media = [] }) {
  const first = media[0];
  if (!first) return <span className="mkt-row__thumb mkt-row__thumb--empty" aria-hidden="true" />;
  return first.type === 'video'
    ? <video className="mkt-row__thumb" src={`${first.url}#t=1`} muted playsInline preload="metadata" />
    : <img className="mkt-row__thumb" src={first.url} alt="" loading="lazy" />;
}

// Uma linha da agenda: horário, miniatura, formato e a primeira linha da
// legenda; a legenda inteira e as hashtags abrem sob demanda.
function Row({ when, format, label, item, accounts, note, statuses, tools }) {
  const { body, tags } = splitCaption(item.caption);
  const media = item.media || [];
  const networks = networksFor(format, accounts);
  const first = format === 'story' ? 'Só a imagem, sem legenda.' : (body.split('\n')[0] || '(sem legenda)');
  return (
    <li className="mkt-row">
      <div className="mkt-row__time">{when}</div>
      <Thumb media={media} />
      <div className="mkt-row__main">
        <div className="mkt-row__title">
          <span className="badge">{label || FORMAT_LABEL[format]}</span>
          {media.length > 1 && <span className="user-detail__meta">carrossel de {media.length}</span>}
          {note && <span className="user-detail__meta">{note}</span>}
        </div>
        <div className="mkt-row__caption">{first}</div>
        {statuses || (networks.length > 0 && <div className="user-detail__meta">{networks.join(' · ')}</div>)}
        {format !== 'story' && (
          <details className="mkt-row__more">
            <summary>Legenda e hashtags</summary>
            <div className="mkt-planned__caption">{body || <em>(sem legenda)</em>}</div>
            {tags.length > 0 && <div className="user-detail__meta">Hashtags: {tags.join(' ')}</div>}
          </details>
        )}
        {tools}
      </div>
    </li>
  );
}

// Aba "Agenda": o que sai hoje, os próximos dias e o que já saiu, com a
// publicação automática (horários em AUTOPOST_LANES, Brasília).
// `posts` e `accounts` vêm da página; `onOpenHistory` leva à aba de histórico.
export default function MarketingAutopost({ posts = [], accounts = [], onOpenHistory, renderTools }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let alive = true;
    fetchAutopost().then(s => { if (alive) setState(s); }).catch(() => { if (alive) setState(false); });
    return () => { alive = false; };
  }, []);

  if (state === null) return <Loading />;
  if (state === false) return <p className="user-detail__meta">A agenda automática ainda não está disponível neste ambiente (migration ou permissão).</p>;

  const now = new Date();
  const today = brtDay(now);
  const count = format => state.pending.filter(i => i.format === format && !i.slot).length;
  const countGeneral = () => state.pending.filter(i => i.format === 'story' && !i.slot).length;
  const countNutri = () => state.pending.filter(i => i.format === 'story' && NUTRI_SLOTS.includes(i.slot)).length;
  const countEngage = () => state.pending.filter(i => i.format === 'story' && i.slot && !NUTRI_SLOTS.includes(i.slot)).length;
  const problems = posts.filter(p => p.targets?.some(t => t.status === 'failed' || t.status === 'processing'));
  const accountById = new Map(accounts.map(a => [a.id, a]));
  const postById = new Map(posts.map(p => [p.id, p]));

  // Fila automática (se ligada) + posts agendados à mão e ainda não publicados.
  // Itens de temporada só entram nos dias em que o tema está no ar no app.
  const schedule = autopostSchedule(state.pending, now, state.season, (state.items || []).filter(i => i.posted_at));
  const scheduledIds = new Set(schedule.map(s => s.item.id));
  const waitingSeason = state.pending.filter(i => i.season && !scheduledIds.has(i.id));
  const planned = [
    ...(state.enabled ? schedule.map(s => ({ key: s.item.id, at: s.at, format: s.format, item: s.item, auto: true })) : []),
    ...posts
      .filter(p => p.scheduled_at && new Date(p.scheduled_at) > now && p.targets?.some(t => t.status === 'pending'))
      .map(p => ({ key: p.id, at: new Date(p.scheduled_at), format: p.format === 'feed' && p.media?.[0]?.type === 'video' ? 'reel' : p.format, item: p, auto: false })),
  ].sort((a, b) => a.at - b.at);
  const days = [];
  for (const p of planned) {
    const day = brtDay(p.at);
    const last = days[days.length - 1];
    if (last && last.day === day) last.items.push(p);
    else days.push({ day, items: [p] });
  }
  const todayItems = days.find(d => d.day === today)?.items || [];
  const nextDays = days.filter(d => d.day !== today);

  const published = state.items
    .filter(i => i.posted_at)
    .sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at));

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

  const planRow = (p, when) => (
    <Row key={p.key} when={when} format={p.format} label={p.auto ? laneLabel(p.item) : undefined} item={p.item} accounts={accounts} note={p.auto ? 'automático' : 'agendado à mão'} />
  );

  const dayBlock = d => (
    <div key={d.day} className="stack">
      <h4 className="mkt-day">{dayLabel(d.items[0].at, today)}</h4>
      <ul className="mkt-list">{d.items.map(p => planRow(p, hourBRT(p.at)))}</ul>
    </div>
  );

  const publishedRow = i => {
    const post = i.post_id ? postById.get(i.post_id) : null;
    const statuses = post && (
      <div className="mkt-row__nets">
        {post.targets.map(t => {
          const a = accountById.get(t.account_id);
          return (
            <span key={t.id} className="mkt-net">
              {a ? PLATFORMS[a.platform]?.label : 'Conta removida'}
              <span className={`badge ${STATUS_BADGE[t.status] || ''}`}>{STATUS_LABEL[t.status] || t.status}</span>
              {t.permalink && <a href={t.permalink} target="_blank" rel="noreferrer">ver post</a>}
            </span>
          );
        })}
      </div>
    );
    // Editar e excluir o que já saiu; se o post foi apagado, a fila só guarda o registro.
    const tools = post && renderTools
      ? renderTools(post)
      : (!post && <span className="user-detail__meta">{i.post_id ? 'Mais antigo: veja no Histórico.' : 'Post excluído.'}</span>);
    return <Row key={i.id} when={`${dayLabel(i.posted_at, today)} ${hourBRT(i.posted_at)}`} format={i.format} label={laneLabel(i)} item={i} accounts={accounts} statuses={statuses} tools={tools} />;
  };

  return (
    <div className="stack">
      <section className="card stack" aria-label="Publicação automática">
        <div className="mkt-stats">
          <div className="mkt-stat"><span className="mkt-stat__n">{todayItems.length}</span><span className="mkt-stat__l">saem hoje</span></div>
          <div className="mkt-stat"><span className="mkt-stat__n">{state.pending.length}</span><span className="mkt-stat__l">na fila</span></div>
          <div className="mkt-stat"><span className="mkt-stat__n">{state.posted}</span><span className="mkt-stat__l">já publicados</span></div>
          <div className="mkt-stat mkt-stat--switch">
            <span className={`badge ${state.enabled ? 'badge--ok' : 'badge--warning'}`}>{state.enabled ? 'Ligada' : 'Pausada'}</span>
            <button type="button" className="btn btn--small" onClick={toggle} disabled={busy}>{state.enabled ? 'Pausar' : 'Ligar'}</button>
          </div>
        </div>
        <p className="user-detail__meta">
          Publicação automática no Instagram e no Facebook, nos horários de maior alcance (Brasília):
          {' '}de segunda a sexta, feed às 11h30 e Reel às 20h45; no sábado e no domingo, feed às 10h30 e Reel às 18h30.
          {' '}Stories: bom dia às 7h30 (8h no fim de semana), café às 6h30 (9h no fim de semana), criar conta às 10h, hidratação às 15h, hora do treino às 16h30 e três stories gerais, às 12h30, 17h30 e 19h30.
          {' '}Fila: faltam {count('feed')} no feed, {count('reel')} em Reels, {countGeneral()} em stories, {countNutri()} de nutrição e {countEngage()} de bom dia, treino e criar conta.
          {(state.skipped || []).length > 0 && ` ${state.skipped.length} pulado(s) por repetição.`}
          {' '}Peças de temporada só saem enquanto o tema estiver no ar no app e, nesse período, passam na frente.
          {waitingSeason.length > 0 && ` ${waitingSeason.length} esperando uma temporada que não está programada no app.`}
          {state.pending.length === 0 && ' A fila acabou: o painel não publica mais sozinho.'}
        </p>
        {msg && <p role="alert" className="form-msg form-msg--error">{msg}</p>}
      </section>

      {problems.length > 0 && (
        <section className="card stack mkt-alert" aria-label="Atenção">
          <h3 className="section-title">Atenção: {problems.length} post(s) em andamento ou com problema</h3>
          <ul className="mkt-targets">
            {problems.flatMap(p => p.targets.filter(t => t.status === 'failed' || t.status === 'processing').map(t => {
              const a = accountById.get(t.account_id);
              const kind = p.media?.[0]?.type === 'video' && p.format === 'feed' ? 'reel' : p.format;
              return (
                <li key={t.id}>
                  <span>{FORMAT_LABEL[kind] || p.format} · {(p.caption || '').split('\n')[0].slice(0, 50) || 'story'}</span>
                  <span>{a ? PLATFORMS[a.platform]?.label : 'Conta removida'}</span>
                  <span className={`badge ${STATUS_BADGE[t.status] || ''}`}>{STATUS_LABEL[t.status] || t.status}</span>
                  {t.status === 'failed' && t.error && <span className="user-detail__meta">{t.error}</span>}
                </li>
              );
            }))}
          </ul>
          {onOpenHistory && <div className="actions-row"><button type="button" className="btn btn--small" onClick={onOpenHistory}>Ver no histórico</button></div>}
        </section>
      )}

      <section className="card stack" aria-label="Hoje">
        <h3 className="section-title">Hoje</h3>
        {todayItems.length > 0
          ? <ul className="mkt-list">{todayItems.map(p => planRow(p, hourBRT(p.at)))}</ul>
          : (
            <p className="user-detail__meta">
              {state.enabled ? 'Nada mais programado para hoje.' : 'Pausada: nada sai sozinho. Os posts agendados à mão continuam valendo.'}
            </p>
          )}
      </section>

      <section className="card stack" aria-label="Próximos dias">
        <h3 className="section-title">Próximos dias</h3>
        {nextDays.length === 0 && <p className="user-detail__meta">Nada programado.</p>}
        {nextDays.slice(0, UPCOMING_OPEN_DAYS).map(dayBlock)}
        {nextDays.length > UPCOMING_OPEN_DAYS && (
          <details className="mkt-more">
            <summary>Ver mais {nextDays.length - UPCOMING_OPEN_DAYS} dia(s)</summary>
            <div className="stack">{nextDays.slice(UPCOMING_OPEN_DAYS).map(dayBlock)}</div>
          </details>
        )}
      </section>

      <section className="card stack" aria-label="Já publicado">
        <h3 className="section-title">Já publicado</h3>
        {published.length === 0 && <p className="user-detail__meta">Nada publicado ainda pela fila automática.</p>}
        <ul className="mkt-list">{published.slice(0, PUBLISHED_SHOWN).map(publishedRow)}</ul>
        {published.length > PUBLISHED_SHOWN && (
          <details className="mkt-more">
            <summary>Ver mais {published.length - PUBLISHED_SHOWN}</summary>
            <ul className="mkt-list">{published.slice(PUBLISHED_SHOWN).map(publishedRow)}</ul>
          </details>
        )}
      </section>
    </div>
  );
}
