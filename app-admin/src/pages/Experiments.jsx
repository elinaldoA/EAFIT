import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '../context/useAdminAuth';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import {
  AUDIENCE_LABELS, FLAG_OPTIONS, KIND_LABELS, STATUS_LABELS,
  buildExperimentRow, buildResults, createExperiment, deleteExperiment, fetchExperimentResults, fetchExperiments,
  rolloutVariants, updateExperiment,
} from '../lib/experiments';

const STATUS_BADGE = { rascunho: 'badge', rodando: 'badge badge--ok', encerrado: 'badge badge--warning' };
const EMPTY = {
  key: '', name: '', description: '', kind: 'rollout', flag: FLAG_OPTIONS[0]?.key || '', onPct: 10,
  variants: [{ key: 'a', weight: 50 }, { key: 'b', weight: 50 }], audience: 'todos',
};
const fmtPct = v => (v == null ? '—' : `${String(v).replace('.', ',')}%`);
const fmtDate = iso => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const flagLabel = key => FLAG_OPTIONS.find(f => f.key === key)?.label || key;

function NewExperiment({ onSaved, onCancel }) {
  const { adminUser } = useAdminAuth();
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = patch => setDraft(d => ({ ...d, ...patch }));
  const setVariant = (i, patch) => set({ variants: draft.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) });

  async function submit(e) {
    e.preventDefault();
    const { error: err, row } = buildExperimentRow(draft);
    if (err) { setError(err); return; }
    setBusy(true);
    setError('');
    try {
      await createExperiment(row, adminUser?.id);
      onSaved();
    } catch (ex) {
      setError(ex.message.includes('duplicate') ? 'Já existe um experimento com essa chave.' : ex.message);
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="section-title" style={{ margin: 0 }}>Novo experimento</h2>
      <div className="seg" role="group" aria-label="Tipo">
        {Object.entries(KIND_LABELS).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={draft.kind === k} className={`seg__btn${draft.kind === k ? ' seg__btn--active' : ''}`} onClick={() => set({ kind: k })}>{l}</button>
        ))}
      </div>
      <div className="two-col">
        <label className="field">
          <span className="field__label">Nome</span>
          <input className="input" value={draft.name} maxLength={80} onChange={e => set({ name: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Chave (o código do app lê por ela)</span>
          <input className="input" value={draft.key} maxLength={40} placeholder="ex.: desafios_gradual" onChange={e => set({ key: e.target.value.toLowerCase() })} />
        </label>
      </div>
      <label className="field">
        <span className="field__label">Hipótese ou descrição (opcional)</span>
        <textarea className="input" rows={2} maxLength={500} value={draft.description} onChange={e => set({ description: e.target.value })} />
      </label>

      {draft.kind === 'rollout' ? (
        <div className="two-col">
          <label className="field">
            <span className="field__label">Funcionalidade</span>
            <select className="input" value={draft.flag} onChange={e => set({ flag: e.target.value })}>
              {FLAG_OPTIONS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Ligada para {draft.onPct}% do público</span>
            <input type="range" min={0} max={100} step={5} value={draft.onPct} aria-label="Percentual ligado" onChange={e => set({ onPct: Number(e.target.value) })} />
          </label>
        </div>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          <span className="field__label">Variantes (a primeira é a referência; pesos somam 100)</span>
          {draft.variants.map((v, i) => (
            <div key={i} className="actions-row">
              <input className="input" style={{ maxWidth: 160 }} value={v.key} maxLength={20} aria-label={`Variante ${i + 1}`} onChange={e => setVariant(i, { key: e.target.value.toLowerCase() })} />
              <input className="input" style={{ maxWidth: 100 }} type="number" min={0} max={100} value={v.weight} aria-label={`Peso ${i + 1}`} onChange={e => setVariant(i, { weight: e.target.value })} />
              <span className="user-detail__meta">%</span>
              {draft.variants.length > 2 && <button type="button" className="btn btn--ghost btn--small" onClick={() => set({ variants: draft.variants.filter((_, j) => j !== i) })}>Remover</button>}
            </div>
          ))}
          {draft.variants.length < 4 && (
            <button type="button" className="btn btn--ghost btn--small" style={{ alignSelf: 'flex-start' }}
              onClick={() => set({ variants: [...draft.variants, { key: String.fromCharCode(97 + draft.variants.length), weight: 0 }] })}>
              + Variante
            </button>
          )}
        </div>
      )}

      <label className="field" style={{ maxWidth: 360 }}>
        <span className="field__label">Público</span>
        <select className="input" value={draft.audience} onChange={e => set({ audience: e.target.value })}>
          {Object.entries(AUDIENCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      {error && <p className="form-msg form-msg--error">{error}</p>}
      <div className="actions-row">
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Salvando…' : 'Criar como rascunho'}</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
      </div>
      <p className="card-note" style={{ margin: 0 }}>
        Cada pessoa cai sempre na mesma variante. Na liberação gradual, quem cai em “ligada” vê a funcionalidade mesmo se
        ela estiver desligada em Configurações, e quem cai em “desligada” não vê. Fora do público, vale a configuração
        normal. No teste A/B, a variante só muda algo no app se o código ler a chave (useExperiment). Admins ficam de fora.
      </p>
    </form>
  );
}

function Results({ experiment }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    let active = true;
    fetchExperimentResults(experiment.key)
      .then(rows => { if (active) setState({ loading: false, data: buildResults(experiment, rows), error: '' }); })
      .catch(err => { if (active) setState({ loading: false, data: null, error: err.message }); });
    return () => { active = false; };
  }, [experiment]);

  if (state.loading) return <Loading />;
  if (state.error) return <p className="form-msg form-msg--error">{state.error}</p>;
  const r = state.data;
  const label = v => (experiment.kind === 'rollout' ? (v === 'on' ? 'Ligada' : 'Desligada') : v.toUpperCase());

  return (
    <>
      <div className="table-wrap">
        <table className="resp-table">
          <thead>
            <tr>
              <th>Variante</th><th>Pessoas</th><th>Abriram o app</th><th>Treinaram</th><th>Diferença</th><th>Dias/semana</th>
              <th>Contas novas ativadas</th>{experiment.flag && <th>Usaram a função</th>}
            </tr>
          </thead>
          <tbody>
            {r.variants.map((v, i) => (
              <tr key={v.key}>
                <td data-label="Variante"><strong>{label(v.key)}</strong> <span className="user-detail__meta">({v.weight}%)</span>{i === 0 && <div className="user-detail__meta">referência</div>}</td>
                <td data-label="Pessoas">{v.users}</td>
                <td data-label="Abriram o app">{fmtPct(v.openedPct)}</td>
                <td data-label="Treinaram">{fmtPct(v.trainedPct)}</td>
                <td data-label="Diferença">
                  {v.liftPct == null ? '—' : `${v.liftPct > 0 ? '+' : ''}${String(v.liftPct).replace('.', ',')} p.p.`}
                  {v.vsBase && (
                    <div className={v.vsBase.significant ? 'badge badge--ok' : 'user-detail__meta'}>
                      {v.vsBase.significant ? 'significativa (95%)' : 'ainda inconclusiva'}
                    </div>
                  )}
                </td>
                <td data-label="Dias/semana">{v.daysPerWeek ?? '—'}</td>
                <td data-label="Contas novas ativadas">{v.newUsers ? `${fmtPct(v.activationPct)} de ${v.newUsers}` : '—'}</td>
                {experiment.flag && <td data-label="Usaram a função">{fmtPct(v.featurePct)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="card-note">
        Desde {fmtDate(experiment.startedAt)}{experiment.endedAt ? ` até ${fmtDate(experiment.endedAt)}` : ''} ({r.days} dia(s)), entre as
        pessoas do público hoje. “Treinaram” = ao menos um treino no período; a diferença é contra a referência, com teste de
        duas proporções. Contas novas ativadas = criadas depois do início e treinaram nos 7 primeiros dias.
        {experiment.flag && ' “Usaram a função” só conta funções que o app registra (Comportamento → Adoção).'}
      </p>
    </>
  );
}

function ExperimentCard({ experiment, onChanged }) {
  const [open, setOpen] = useState(experiment.status !== 'rascunho');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [onPct, setOnPct] = useState(experiment.variants.find(v => v.key === 'on')?.weight ?? 0);
  const rollout = experiment.kind === 'rollout';

  async function run(patch, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError('');
    try {
      await updateExperiment(experiment.key, patch);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Apagar o experimento "${experiment.name}"?`)) return;
    try { await deleteExperiment(experiment.key); onChanged(); } catch (err) { setError(err.message); }
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>
            {experiment.name} <span className={STATUS_BADGE[experiment.status]}>{STATUS_LABELS[experiment.status]}</span>
          </h2>
          <p className="user-detail__meta" style={{ margin: '4px 0 0' }}>
            {KIND_LABELS[experiment.kind]}{rollout ? ` · ${flagLabel(experiment.flag)} ligada para ${experiment.variants.find(v => v.key === 'on')?.weight}%` : ` · ${experiment.variants.map(v => `${v.key.toUpperCase()} ${v.weight}%`).join(' / ')}`}
            {' · '}{AUDIENCE_LABELS[experiment.audience]} · chave <code>{experiment.key}</code>
            {experiment.winner && <> · vencedora: <strong>{experiment.winner}</strong></>}
          </p>
          {experiment.description && <p className="card-note" style={{ margin: '4px 0 0' }}>{experiment.description}</p>}
        </div>
        <div className="actions-row">
          {experiment.status === 'rascunho' && (
            <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={() => run({ status: 'rodando' }, 'Iniciar agora? O sorteio passa a valer no app em até 5 minutos.')}>Iniciar</button>
          )}
          {experiment.status === 'rodando' && experiment.variants.map(v => (
            <button key={v.key} type="button" className="btn btn--ghost btn--small" disabled={busy}
              onClick={() => run({ status: 'encerrado', winner: v.key }, `Encerrar com "${v.key}" como vencedora? O app volta à configuração normal.`)}>
              Encerrar: {rollout ? (v.key === 'on' ? 'ligada' : 'desligada') : v.key.toUpperCase()} vence
            </button>
          ))}
          {experiment.status !== 'rodando' && <button type="button" className="btn btn--ghost btn--small" onClick={remove}>Apagar</button>}
          {experiment.status !== 'rascunho' && <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(o => !o)}>{open ? 'Ocultar resultados' : 'Resultados'}</button>}
        </div>
      </div>

      {rollout && experiment.status === 'rodando' && (
        <div className="actions-row" style={{ marginTop: 8 }}>
          <label className="field" style={{ minWidth: 240 }}>
            <span className="field__label">Ajustar: ligada para {onPct}%</span>
            <input type="range" min={0} max={100} step={5} value={onPct} aria-label="Ajustar percentual" onChange={e => setOnPct(Number(e.target.value))} />
          </label>
          <button type="button" className="btn btn--small" disabled={busy || onPct === experiment.variants.find(v => v.key === 'on')?.weight}
            onClick={() => run({ variants: rolloutVariants(onPct) })}>Aplicar</button>
          <span className="user-detail__meta">Aumentar só acrescenta pessoas: quem já tinha a função continua com ela.</span>
        </div>
      )}
      {error && <p className="form-msg form-msg--error">{error}</p>}
      {open && experiment.status !== 'rascunho' && <Results experiment={experiment} />}
      {experiment.status === 'encerrado' && rollout && experiment.winner === 'on' && (
        <p className="card-note">Para deixar a função ligada para todos, confira a chave em Configurações do app.</p>
      )}
    </div>
  );
}

// Sistema → Experimentos.
export default function Experiments() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    fetchExperiments().then(rows => { setItems(rows); setError(''); }).catch(err => setError(err.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Experimentos</h1>
          <p className="page-subtitle">
            Libere uma funcionalidade aos poucos (para 10%, 50%…) ou compare versões com um teste A/B, e veja se quem
            recebeu treina mais.
          </p>
        </div>
        {!creating && <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>Novo experimento</button>}
      </div>
      {error && <p className="form-msg form-msg--error">{error}</p>}
      {creating && <NewExperiment onSaved={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />}
      {!items && !error && <Loading />}
      {items && items.length === 0 && !creating && <EmptyState icon="🧪" label="Nenhum experimento ainda." />}
      {items && items.map(e => <ExperimentCard key={`${e.key}-${e.status}-${JSON.stringify(e.variants)}`} experiment={e} onChanged={load} />)}
    </div>
  );
}
