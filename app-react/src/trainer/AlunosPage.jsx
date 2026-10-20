import { useCallback, useEffect, useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { useToast } from '../context/useToast';
import { clientAttention, fetchTrainerCode } from '../lib/trainer';
import {
  FILTERS, SORTS, fetchRoster, filterRoster, sortRoster, matchesFilter, allTags, planStatus, adherence, weeklyTarget,
  recentStrip, initials, setClientTags, normalizeTags, friendlyRosterError, TAG_MAX_LEN,
} from '../lib/trainerRoster';
import { fetchUnreadReplies } from '../lib/trainerMessages';
import { shareTrainerInvite } from '../lib/trainerInvite';
import Skeleton from '../components/Skeleton';
import MessageComposer from './MessageComposer';
import ClientDetail from './ClientDetail';

import { t } from '../lib/i18n';

// Carteira de alunos: busca, filtros, ordenação, etiquetas e ações em lote.
// `openClient` (vindo do Painel) abre direto a ficha daquele aluno.
export default function AlunosPage({ onClientsLoaded, openClient, onClientOpened }) {
  const toast = useToast();
  const [roster, setRoster] = useState(null);
  const [code, setCode] = useState('');
  const [filter, setFilter] = useState('todos');
  const [tag, setTag] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('prioridade');
  const [selected, setSelected] = useState(null);
  const [replies, setReplies] = useState({});
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState([]);
  const [bulk, setBulk] = useState(null); // 'recado' | 'etiqueta' | null
  const [bulkTag, setBulkTag] = useState('');
  const [busy, setBusy] = useState(false);
  const today = todayDate();

  const reload = useCallback(async () => {
    try {
      const list = await fetchRoster();
      setRoster(list);
      fetchUnreadReplies().then(setReplies).catch(() => { /* migration pendente */ });
      onClientsLoaded?.(list.filter(c => ['risco', 'atencao'].includes(clientAttention(c, todayDate()).level)).length);
    } catch (err) {
      console.error('fetchRoster:', err);
      setRoster([]);
    }
  }, [onClientsLoaded]);

  useEffect(() => {
    reload();
    fetchTrainerCode().then(setCode).catch(err => console.error('fetchTrainerCode:', err));
  }, [reload]);

  useEffect(() => {
    if (!openClient) return;
    setSelected(openClient);
    onClientOpened?.();
  }, [openClient, onClientOpened]);

  const list = useMemo(() => roster || [], [roster]);
  const tags = useMemo(() => allTags(list), [list]);
  const visible = useMemo(
    () => sortRoster(filterRoster(list, { filter, query, tag }, today), sort, today),
    [list, filter, query, tag, sort, today],
  );
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map(f => [f.key, list.filter(c => matchesFilter(c, f.key, today)).length])),
    [list, today],
  );
  const legacy = list.some(c => c.legacy);

  async function handleShare() {
    const result = await shareTrainerInvite(code);
    if (result === 'copied') toast(t('📋 Convite copiado'));
    else if (result === 'failed') toast(t('Seu código: {code}', { code }));
  }

  const togglePick = id => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  function stopPicking() {
    setPicking(false); setPicked([]); setBulk(null); setBulkTag('');
  }

  async function handleBulkTag() {
    const value = bulkTag.trim();
    if (!value) return;
    setBusy(true);
    let failed = 0;
    for (const c of list.filter(x => picked.includes(x.id))) {
      try { await setClientTags(c.id, normalizeTags([...(c.tags || []), value])); }
      catch (err) { failed += 1; console.error('setClientTags:', friendlyRosterError(err)); }
    }
    setBusy(false);
    toast(failed ? t('⚠️ Etiqueta aplicada, mas {n} aluno(s) falharam', { n: failed }) : t('🏷️ Etiqueta "{tag}" aplicada', { tag: value }));
    stopPicking();
    reload();
  }

  if (selected) {
    return (
      <ClientDetail
        client={selected}
        onBack={() => { setSelected(null); reload(); }}
        onRemoved={() => { setSelected(null); reload(); }}
      />
    );
  }

  return (
    <section className="page active trainer-page">
      {roster && roster.length > 0 && (
        <>
          <div className="roster-toolbar">
            <input
              type="search" className="input input--sm" placeholder={t('Buscar por nome, e-mail ou etiqueta')}
              aria-label={t('Buscar aluno')} value={query} onChange={e => setQuery(e.target.value)}
            />
            <select className="input input--sm roster-toolbar__sort" aria-label={t('Ordenar por')} value={sort} onChange={e => setSort(e.target.value)}>
              {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>

          <div className="measure-chips roster-chips" role="group" aria-label={t('Filtro de alunos')}>
            {FILTERS.map(f => (
              <button
                key={f.key} type="button" aria-pressed={filter === f.key}
                className={filter === f.key ? 'recap__btn recap__btn--active' : 'recap__btn'}
                onClick={() => setFilter(f.key)}
              >{f.label} <span className="chip-count">{counts[f.key]}</span></button>
            ))}
          </div>
          {tags.length > 0 && (
            <div className="measure-chips roster-chips" role="group" aria-label={t('Filtrar por etiqueta')}>
              {tags.map(x => (
                <button key={x} type="button" aria-pressed={tag === x}
                  className={tag === x ? 'tag-chip tag-chip--active' : 'tag-chip'}
                  onClick={() => setTag(tag === x ? '' : x)}>🏷️ {x}</button>
              ))}
            </div>
          )}

          <div className="roster-head">
            <span>{t('{n} de {total} aluno(s)', { n: visible.length, total: list.length })}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn--ghost btn--sm" disabled={!code} onClick={handleShare}>{t('📤 Convidar')}</button>
              <button type="button" className="btn btn--outline btn--sm" aria-pressed={picking} onClick={() => (picking ? stopPicking() : setPicking(true))}>
                {picking ? t('Cancelar') : t('Selecionar')}
              </button>
            </div>
          </div>
          {legacy && <p className="profile-field__hint">{t('Plano, etiquetas e últimos dias aparecem quando o servidor for atualizado.')}</p>}
        </>
      )}

      {!roster && <Skeleton height={86} />}
      {roster && roster.length === 0 && (
        <div className="dash-card">
          <p className="dash-empty">{t('Nenhum aluno vinculado ainda. Compartilhe seu código para começar.')}</p>
          <button type="button" className="btn btn--primary btn--sm" disabled={!code} onClick={handleShare}>{t('📤 Convidar aluno')}</button>
        </div>
      )}
      {roster && roster.length > 0 && visible.length === 0 && <p className="dash-empty">{t('Nenhum aluno neste filtro.')}</p>}

      {visible.map(c => {
        const att = clientAttention(c, today);
        const plan = planStatus(c, today);
        const adh = adherence(c);
        const target = weeklyTarget(c);
        const isPicked = picked.includes(c.id);
        return (
          <button
            type="button" key={c.id}
            className={`dash-card client-row${isPicked ? ' client-row--picked' : ''}`}
            aria-pressed={picking ? isPicked : undefined}
            onClick={() => (picking ? togglePick(c.id) : setSelected(c))}
          >
            <div className="client-row__main">
              <span className="client-row__who">
                {picking
                  ? <span className={`pick-box${isPicked ? ' pick-box--on' : ''}`} aria-hidden="true">{isPicked ? '✓' : ''}</span>
                  : <span className="avatar" aria-hidden="true">{initials(c.name)}</span>}
                <strong>{c.name}</strong>
              </span>
              <span className={`client-badge client-badge--${att.level}`}>{att.label}</span>
            </div>

            {(c.tags.length > 0 || c.pain7 > 0 || replies[c.id] > 0) && (
              <div className="client-row__tags">
                {c.pain7 > 0 && <span className="reason-chip reason-chip--alert">{t('🩹 Dor relatada')}</span>}
                {replies[c.id] > 0 && <span className="client-row__reply">💬 {replies[c.id]} {t('resposta(s) nova(s)')}</span>}
                {c.tags.map(x => <span key={x} className="tag-chip tag-chip--static">{x}</span>)}
              </div>
            )}

            {!c.legacy && (
              <div className="strip" aria-label={t('Dias treinados nas últimas 2 semanas')}>
                {recentStrip(c, today).map(d => <span key={d.date} className={d.trained ? 'strip__day strip__day--on' : 'strip__day'} title={d.date} />)}
              </div>
            )}

            <div className="client-row__meta">
              <span>
                {target ? t('{n}/{target} treinos na semana', { n: c.days7, target }) : t('{days7} treino(s) nos últimos 7 dias', { days7: c.days7 })}
                {adh !== null && <strong className={adh >= 80 ? 'adh adh--ok' : adh >= 50 ? 'adh adh--mid' : 'adh adh--low'}> · {adh}%</strong>}
              </span>
              <span>{c.days30} {t('em 30 dias')}</span>
              {!c.legacy && (
                <span className={`plan-chip plan-chip--${plan.level}`}>
                  📋 {c.planName ? `${c.planName} · ${plan.label}` : plan.label}
                </span>
              )}
            </div>
          </button>
        );
      })}

      {picking && (
        <div className="bulk-bar" role="region" aria-label={t('Ações em lote')}>
          <div className="bulk-bar__head">
            <strong>{t('{n} selecionado(s)', { n: picked.length })}</strong>
            <button type="button" className="btn btn--ghost btn--sm"
              onClick={() => setPicked(picked.length === visible.length ? [] : visible.map(c => c.id))}>
              {picked.length === visible.length && visible.length > 0 ? t('Limpar') : t('Todos da lista')}
            </button>
          </div>
          {bulk === null && (
            <div className="bulk-bar__actions">
              <button type="button" className="btn btn--primary btn--sm" disabled={!picked.length} onClick={() => setBulk('recado')}>{t('💬 Recado')}</button>
              <button type="button" className="btn btn--outline btn--sm" disabled={!picked.length} onClick={() => setBulk('etiqueta')}>{t('🏷️ Etiqueta')}</button>
            </div>
          )}
          {bulk === 'recado' && (
            <MessageComposer
              clientIds={picked}
              label={t('Enviar para {length} aluno(s)', { length: picked.length })}
              onSent={stopPicking}
            />
          )}
          {bulk === 'etiqueta' && (
            <div className="bulk-bar__actions">
              <input className="input input--sm" maxLength={TAG_MAX_LEN} placeholder={t('Ex.: Online, Presencial, Plano anual')}
                aria-label={t('Etiqueta')} value={bulkTag} onChange={e => setBulkTag(e.target.value)} list="roster-tags" />
              <datalist id="roster-tags">{tags.map(x => <option key={x} value={x} />)}</datalist>
              <button type="button" className="btn btn--primary btn--sm" disabled={busy || !bulkTag.trim()} onClick={handleBulkTag}>
                {busy ? t('Aplicando…') : t('Aplicar')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
