import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/useAdminAuth';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { todayStr } from '../lib/community';
import { downloadCsv, toCsv } from '../lib/csv';
import {
  AUDIENCE_LABELS, BREAKDOWNS, KIND_LABELS, MAX_OPTIONS, NPS_QUESTION, STATUS_LABELS,
  buildResults, buildSurveyRow, deleteSurvey, fetchSurveyAnswers, fetchSurveys, saveSurvey, setSurveyActive, surveyStatus,
} from '../lib/surveys';

const STATUS_BADGE = { no_ar: 'badge badge--ok', agendada: 'badge badge--warning', encerrada: 'badge', pausada: 'badge' };
const EMPTY = {
  kind: 'nps', question: NPS_QUESTION, questionEn: 'From 0 to 10, how likely are you to recommend EAFIT to a friend?',
  options: ['', ''], audience: 'todos', minAccountDays: 7, startsOn: '', endsOn: '', active: true,
};
const fmtDate = iso => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const fmtDay = d => (d ? d.split('-').reverse().join('/') : '');

function SurveyForm({ initial, onSaved, onCancel }) {
  const { adminUser } = useAdminAuth();
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = patch => setDraft(d => ({ ...d, ...patch }));

  function changeKind(kind) {
    const wasDefault = draft.question === NPS_QUESTION;
    set({ kind, ...(kind !== 'nps' && wasDefault ? { question: '', questionEn: '' } : {}), ...(kind === 'nps' && !draft.question ? { question: NPS_QUESTION } : {}) });
  }

  async function submit(e) {
    e.preventDefault();
    const { error: err, row } = buildSurveyRow(draft);
    if (err) { setError(err); return; }
    setBusy(true);
    setError('');
    try {
      await saveSurvey(initial.id, row, adminUser?.id);
      onSaved();
    } catch (ex) {
      setError(ex.message);
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="section-title" style={{ margin: 0 }}>{initial.id ? 'Editar pesquisa' : 'Nova pesquisa'}</h2>
      <div className="two-col">
        <label className="field">
          <span className="field__label">Tipo</span>
          <select className="input" value={draft.kind} onChange={e => changeKind(e.target.value)} disabled={!!initial.id && initial.answers > 0}>
            {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Público</span>
          <select className="input" value={draft.audience} onChange={e => set({ audience: e.target.value })}>
            {Object.entries(AUDIENCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field__label">Pergunta</span>
        <input className="input" value={draft.question} maxLength={200} onChange={e => set({ question: e.target.value })} />
      </label>
      <label className="field">
        <span className="field__label">Pergunta em inglês (opcional — para quem usa o app em inglês)</span>
        <input className="input" value={draft.questionEn} maxLength={200} onChange={e => set({ questionEn: e.target.value })} />
      </label>
      {draft.kind === 'escolha' && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="field__label">Opções (de 2 a {MAX_OPTIONS})</span>
          {draft.options.map((o, i) => (
            <div key={i} className="actions-row">
              <input
                className="input" value={o} maxLength={80} aria-label={`Opção ${i + 1}`}
                onChange={e => set({ options: draft.options.map((x, j) => (j === i ? e.target.value : x)) })}
              />
              {draft.options.length > 2 && (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => set({ options: draft.options.filter((_, j) => j !== i) })}>Remover</button>
              )}
            </div>
          ))}
          {draft.options.length < MAX_OPTIONS && (
            <button type="button" className="btn btn--ghost btn--small" style={{ alignSelf: 'flex-start' }} onClick={() => set({ options: [...draft.options, ''] })}>
              + Opção
            </button>
          )}
        </div>
      )}
      <div className="two-col">
        <label className="field">
          <span className="field__label">Só para contas com pelo menos (dias)</span>
          <input className="input" type="number" min={0} max={365} value={draft.minAccountDays} onChange={e => set({ minAccountDays: e.target.value })} />
        </label>
        <div className="actions-row">
          <label className="field">
            <span className="field__label">Começa em</span>
            <input className="input" type="date" value={draft.startsOn} onChange={e => set({ startsOn: e.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Termina em</span>
            <input className="input" type="date" value={draft.endsOn} onChange={e => set({ endsOn: e.target.value })} />
          </label>
        </div>
      </div>
      <label className="actions-row" style={{ gap: 6 }}>
        <input type="checkbox" checked={draft.active} onChange={e => set({ active: e.target.checked })} />
        <span>Ativa (aparece no app dentro do período)</span>
      </label>
      {error && <p className="form-msg form-msg--error">{error}</p>}
      <div className="actions-row">
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
      </div>
      <p className="card-note" style={{ margin: 0 }}>
        O app mostra uma pesquisa por vez (a mais antiga no ar), na tela de Treino. “Agora não” volta a perguntar em 3
        dias. Cada pessoa responde uma vez. Admins não veem.
      </p>
    </form>
  );
}

function Results({ survey }) {
  const [answers, setAnswers] = useState(null);
  const [error, setError] = useState('');
  const [breakdown, setBreakdown] = useState('meta');

  useEffect(() => {
    let active = true;
    setAnswers(null);
    fetchSurveyAnswers(survey.id)
      .then(a => { if (active) setAnswers(a); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [survey.id]);

  const r = useMemo(() => (answers ? buildResults(survey, answers, breakdown) : null), [survey, answers, breakdown]);

  if (error) return <p className="form-msg form-msg--error">{error}</p>;
  if (!r) return <Loading />;
  if (!r.total) return <EmptyState icon="🗳️" label="Ninguém respondeu ainda." />;

  function exportCsv() {
    downloadCsv('respostas-pesquisa.csv', toCsv(answers.map(a => ({ ...a, personal: a.personal ? 'sim' : 'não', active30: a.active30 ? 'sim' : 'não' })), [
      { key: 'at', label: 'Quando' }, { key: 'name', label: 'Nome' }, { key: 'email', label: 'Email' },
      { key: 'score', label: 'Nota' }, { key: 'choice', label: 'Escolha' }, { key: 'comment', label: 'Comentario' },
      { key: 'meta', label: 'Objetivo' }, { key: 'nivel', label: 'Nivel' }, { key: 'local', label: 'Local' },
      { key: 'personal', label: 'Personal' }, { key: 'active30', label: 'Treinou30d' }, { key: 'accountDays', label: 'DiasDeConta' },
    ]));
  }

  return (
    <div className="stack">
      <div className="tile-grid">
        <div className="tile"><div className="tile__value">{r.total}</div><div className="tile__label">respostas</div></div>
        {r.nps && (
          <>
            <div className="tile"><div className="tile__value">{r.nps.nps}</div><div className="tile__label">NPS (−100 a 100)</div></div>
            <div className="tile"><div className="tile__value">{r.nps.promoters}</div><div className="tile__label">promotores (9–10)</div></div>
            <div className="tile"><div className="tile__value">{r.nps.passives}</div><div className="tile__label">neutros (7–8)</div></div>
            <div className="tile"><div className="tile__value">{r.nps.detractors}</div><div className="tile__label">detratores (0–6)</div></div>
          </>
        )}
      </div>

      {r.distribution && (
        <ul className="dist">
          {r.distribution.map(d => (
            <li key={d.key} className="dist__row">
              <span className="dist__label">{d.label}</span>
              <span className="dist__track"><span className="dist__fill" style={{ width: `${Math.max(d.total ? 2 : 0, d.pct ?? 0)}%` }} /></span>
              <span className="dist__value">{d.total} · {d.pct}%</span>
            </li>
          ))}
        </ul>
      )}

      <div className="card-head">
        <h3 className="subsection-title" style={{ margin: 0 }}>Por segmento</h3>
        <div className="seg" role="group" aria-label="Recorte">
          {BREAKDOWNS.map(b => (
            <button
              key={b.key} type="button" aria-pressed={breakdown === b.key}
              className={`seg__btn${breakdown === b.key ? ' seg__btn--active' : ''}`}
              onClick={() => setBreakdown(b.key)}
            >{b.label}</button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="resp-table">
          <thead><tr><th>Grupo</th><th>Respostas</th>{survey.kind === 'nps' && <th>NPS</th>}{survey.kind === 'escolha' && <th>Mais escolhida</th>}</tr></thead>
          <tbody>
            {r.breakdown.map(g => (
              <tr key={g.label}>
                <td data-label="Grupo">{g.label}</td>
                <td data-label="Respostas">{g.total}</td>
                {survey.kind === 'nps' && <td data-label="NPS">{g.nps ?? '—'}</td>}
                {survey.kind === 'escolha' && <td data-label="Mais escolhida">{g.top || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {r.weekly.length > 1 && (
        <>
          <h3 className="subsection-title" style={{ margin: 0 }}>Por semana</h3>
          <div className="table-wrap">
            <table className="resp-table">
              <thead><tr><th>Semana de</th><th>Respostas</th>{survey.kind === 'nps' && <th>NPS</th>}</tr></thead>
              <tbody>
                {r.weekly.map(w => (
                  <tr key={w.week}>
                    <td data-label="Semana de">{fmtDay(w.week)}</td>
                    <td data-label="Respostas">{w.total}</td>
                    {survey.kind === 'nps' && <td data-label="NPS">{w.nps ?? '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="card-head">
        <h3 className="subsection-title" style={{ margin: 0 }}>Comentários ({r.comments.length})</h3>
        <button type="button" className="btn btn--ghost btn--small" onClick={exportCsv}>Exportar CSV</button>
      </div>
      {r.comments.length === 0 ? <p className="card-note" style={{ margin: 0 }}>Nenhum comentário.</p> : (
        <div className="table-wrap">
          <table className="resp-table">
            <thead><tr><th>Quando</th><th>Quem</th><th>Resposta</th><th>Comentário</th></tr></thead>
            <tbody>
              {r.comments.map(a => (
                <tr key={a.id}>
                  <td data-label="Quando">{fmtDate(a.at)}</td>
                  <td data-label="Quem"><Link to={`/users/${a.userId}`}>{a.name}</Link></td>
                  <td data-label="Resposta">{a.score ?? a.choice ?? '—'}</td>
                  <td data-label="Comentário">{a.comment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Acompanhamento → Pesquisas.
export default function Surveys() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState(null);
  const today = todayStr();

  const load = useCallback(() => {
    fetchSurveys()
      .then(rows => { setItems(rows); setError(''); })
      .catch(err => setError(err.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(s) {
    try { await setSurveyActive(s.id, !s.active); load(); } catch (err) { setError(err.message); }
  }

  async function remove(s) {
    if (!window.confirm(`Apagar a pesquisa "${s.question}" e as ${s.answers} resposta(s)?`)) return;
    try { await deleteSurvey(s.id); if (openId === s.id) setOpenId(null); load(); } catch (err) { setError(err.message); }
  }

  const open = items?.find(s => s.id === openId) || null;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pesquisas</h1>
          <p className="page-subtitle">
            Perguntas curtas dentro do app: NPS, múltipla escolha ou texto livre, para um público e um período. Os
            resultados podem ser recortados por objetivo, nível, local, personal, atividade e tempo de conta.
          </p>
        </div>
        {!editing && <button type="button" className="btn btn--primary" onClick={() => setEditing(EMPTY)}>Nova pesquisa</button>}
      </div>

      {error && <p className="form-msg form-msg--error">{error}</p>}
      {editing && (
        <SurveyForm
          key={editing.id || 'new'} initial={editing}
          onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)}
        />
      )}

      {!items && !error && <Loading />}
      {items && items.length === 0 && !editing && <EmptyState icon="🗳️" label="Nenhuma pesquisa criada ainda." />}

      {items && items.length > 0 && (
        <div className="table-wrap">
          <table className="resp-table">
            <thead><tr><th>Pergunta</th><th>Tipo</th><th>Público</th><th>Período</th><th>Situação</th><th>Respostas</th><th /></tr></thead>
            <tbody>
              {items.map(s => {
                const st = surveyStatus(s, today);
                return (
                  <tr key={s.id}>
                    <td data-label="Pergunta">{s.question}</td>
                    <td data-label="Tipo">{KIND_LABELS[s.kind]}</td>
                    <td data-label="Público">{AUDIENCE_LABELS[s.audience]}{s.minAccountDays ? ` · ${s.minAccountDays}+ dias de conta` : ''}</td>
                    <td data-label="Período">{s.startsOn || s.endsOn ? `${fmtDay(s.startsOn) || '…'} a ${fmtDay(s.endsOn) || '…'}` : 'sem prazo'}</td>
                    <td data-label="Situação"><span className={STATUS_BADGE[st]}>{STATUS_LABELS[st]}</span></td>
                    <td data-label="Respostas">{s.answers}</td>
                    <td data-label="">
                      <div className="actions-row">
                        <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                          {openId === s.id ? 'Fechar' : 'Resultados'}
                        </button>
                        <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing({ ...s, options: s.options.length ? s.options : ['', ''] })}>Editar</button>
                        <button type="button" className="btn btn--ghost btn--small" onClick={() => toggle(s)}>{s.active ? 'Pausar' : 'Ativar'}</button>
                        <button type="button" className="btn btn--ghost btn--small" onClick={() => remove(s)}>Apagar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="card">
          <h2 className="section-title">{open.question}</h2>
          <Results survey={open} />
        </div>
      )}
    </div>
  );
}
