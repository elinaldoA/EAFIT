import { useCallback, useEffect, useState } from 'react';
import {
  LEGAL_DOCS, currentVersions, legalUrl, validateLegalVersion, friendlyLegalError,
  fetchLegalVersions, publishLegalVersion, fetchTermsAcceptance,
} from '../lib/ops';
import { todayStr, formatDay } from '../lib/community';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const DOC_LABEL = Object.fromEntries(LEGAL_DOCS.map(d => [d.key, d.label]));

function VersionForm({ onPublished }) {
  const [form, setForm] = useState({ doc: LEGAL_DOCS[0].key, version: '', effectiveDate: todayStr(), summary: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const problem = validateLegalVersion(form);
    if (problem) { setMsg(`Erro: ${problem}`); return; }
    setBusy(true);
    setMsg('');
    try {
      await publishLegalVersion(form);
      setMsg('Versão registrada.');
      setForm({ ...form, version: '', summary: '' });
      await onPublished();
    } catch (err) {
      setMsg(`Erro: ${friendlyLegalError(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" style={{ gap: 14 }} onSubmit={handleSubmit}>
      <div>
        <h2 className="section-title" style={{ margin: 0 }}>Registrar nova versão</h2>
        <p className="user-detail__meta" style={{ margin: '4px 0 0' }}>
          Faça isso sempre que o texto publicado mudar. O registro não altera o texto: ele continua nos arquivos do app
          e precisa de uma nova publicação para mudar.
        </p>
      </div>
      <div className="form-grid">
        <label className="field">
          <span className="field__label">Documento</span>
          <select className="input" value={form.doc} onChange={e => setForm({ ...form, doc: e.target.value })}>
            {LEGAL_DOCS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Versão</span>
          <input className="input" maxLength={30} placeholder="2026-10" value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Em vigor desde</span>
          <input className="input" type="date" value={form.effectiveDate} onChange={e => setForm({ ...form, effectiveDate: e.target.value })} />
        </label>
      </div>
      <label className="field">
        <span className="field__label">O que mudou (opcional)</span>
        <textarea className="input" rows={2} maxLength={500} value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} />
      </label>
      <div className="actions-row">
        <button className="btn btn--primary btn--small" type="submit" disabled={busy}>Registrar versão</button>
        {msg && <span className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</span>}
      </div>
    </form>
  );
}

export default function Legal() {
  const [versions, setVersions] = useState(null);
  const [acceptance, setAcceptance] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await fetchLegalVersions();
      setVersions(list);
      // O aceite do cadastro vale para os dois documentos: compara com a
      // mudança mais recente entre eles.
      const dates = Object.values(currentVersions(list)).filter(Boolean).map(v => v.effective_date).sort();
      setAcceptance(await fetchTermsAcceptance(dates[dates.length - 1] || null));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <p className="form-msg form-msg--error">{error}</p>;
  if (!versions) return <Loading />;

  const current = currentVersions(versions);

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Termos e privacidade</h1>
          <p className="page-subtitle">
            Qual versão de cada documento está em vigor e quantos usuários aceitaram os termos. A data de aceite de cada
            pessoa aparece no detalhe do usuário.
          </p>
        </div>
      </div>

      <div className="two-col">
        {LEGAL_DOCS.map(d => {
          const v = current[d.key];
          return (
            <div className="card" key={d.key}>
              <h2 className="section-title">
                {d.label}
                <span className={`badge ${v ? 'badge--ok' : 'badge--warning'}`}>{v ? `versão ${v.version}` : 'sem versão registrada'}</span>
              </h2>
              <p style={{ margin: '0 0 10px' }}>
                {v ? <>Em vigor desde <strong>{formatDay(v.effective_date)}</strong>.</> : 'Registre a versão que está publicada hoje para começar o histórico.'}
              </p>
              {v?.summary && <p className="user-detail__meta" style={{ margin: '0 0 10px' }}>{v.summary}</p>}
              <a className="btn btn--small" href={legalUrl(d.file)} target="_blank" rel="noopener noreferrer">Abrir o texto publicado</a>
            </div>
          );
        })}
      </div>

      {acceptance && (
        <div className="card">
          <h2 className="section-title">Aceite dos termos</h2>
          <div className="tile-grid">
            <div className="tile"><div className="tile__value">{acceptance.accepted}</div><div className="tile__label">de {acceptance.users} usuários têm aceite registrado</div></div>
            <div className="tile"><div className="tile__value">{acceptance.before}</div><div className="tile__label">aceitaram antes da versão atual</div></div>
            <div className="tile"><div className="tile__value">{acceptance.never}</div><div className="tile__label">sem registro de aceite</div></div>
          </div>
          <p className="card-note">
            O aceite é gravado no cadastro (checkbox obrigatório) e vale para os dois documentos. O app ainda não pede
            um novo aceite quando o texto muda: quem aparece em "aceitaram antes da versão atual" concordou com o texto
            anterior. Contas "sem registro" foram criadas antes do checkbox existir.
          </p>
        </div>
      )}

      <VersionForm onPublished={load} />

      <div className="card">
        <h2 className="section-title">Histórico de versões</h2>
        {versions.length === 0 ? <EmptyState icon="📄" label="Nenhuma versão registrada ainda." /> : (
          <div className="table-wrap">
            <table className="resp-table">
              <thead><tr><th>Documento</th><th>Versão</th><th>Em vigor desde</th><th>O que mudou</th></tr></thead>
              <tbody>
                {versions.map(v => (
                  <tr key={v.id}>
                    <td data-label="Documento">{DOC_LABEL[v.doc] || v.doc}</td>
                    <td data-label="Versão">
                      {v.version}
                      {current[v.doc]?.id === v.id && <span className="badge badge--ok">atual</span>}
                    </td>
                    <td data-label="Em vigor desde">{formatDay(v.effective_date)}</td>
                    <td data-label="O que mudou">{v.summary || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
