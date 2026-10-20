import { useEffect, useMemo, useState } from 'react';
import { useAdminAuth } from '../context/useAdminAuth';
import Loading from './Loading';
import { MAX_CAP, buildLoad, fetchPushCap, savePushCap } from '../lib/pushCap';

// Comunicação → Automáticas: teto de avisos por pessoa em 7 dias.
export default function PushCapCard() {
  const { adminUser } = useAdminAuth();
  const [state, setState] = useState({ loading: true, error: '', cap: 0, load: [] });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let active = true;
    fetchPushCap()
      .then(({ cap, load }) => {
        if (!active) return;
        setState({ loading: false, error: '', cap, load });
        setDraft(cap ? String(cap) : '');
      })
      .catch(err => { if (active) setState(s => ({ ...s, loading: false, error: err.message })); });
    return () => { active = false; };
  }, []);

  const next = draft.trim() === '' ? 0 : Number(draft);
  const valid = Number.isInteger(next) && next >= 0 && next <= MAX_CAP;
  const preview = useMemo(() => buildLoad(state.load, valid ? next : 0), [state.load, next, valid]);

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      await savePushCap(next, adminUser?.id);
      setState(s => ({ ...s, cap: next }));
      setMsg(next ? `Salvo: no máximo ${next} aviso(s) por pessoa em 7 dias.` : 'Salvo: sem limite.');
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (state.loading) return <div className="card"><Loading /></div>;

  return (
    <div className="card">
      <h2 className="section-title">Limite por pessoa</h2>
      <p className="card-note" style={{ marginTop: 0 }}>
        Teto de avisos que uma pessoa recebe em 7 dias, somando manuais e automáticos. Quem já chegou ao teto deixa de
        receber as automáticas até a semana “abrir espaço”. Envios manuais sempre saem (o admin decide na hora).
      </p>
      {state.error ? <p className="form-msg form-msg--error">{state.error}</p> : (
        <>
          <div className="actions-row" style={{ alignItems: 'flex-end' }}>
            <label className="field" style={{ maxWidth: 220 }}>
              <span className="field__label">Máximo por semana (vazio = sem limite)</span>
              <input
                className="input" type="number" min={0} max={MAX_CAP} step={1} inputMode="numeric"
                value={draft} onChange={e => setDraft(e.target.value)} aria-label="Máximo de avisos por semana"
              />
            </label>
            <button
              type="button" className="btn btn--primary btn--small"
              disabled={busy || !valid || next === state.cap} onClick={save}
            >{busy ? 'Salvando…' : 'Salvar'}</button>
            <span className="user-detail__meta">Atual: {state.cap ? `${state.cap} por semana` : 'sem limite'}</span>
          </div>
          {!valid && <p className="form-msg form-msg--error">Use um número inteiro de 0 a {MAX_CAP}.</p>}
          {msg && <p className={msg.startsWith('Erro') ? 'form-msg form-msg--error' : 'form-msg'}>{msg}</p>}

          <h3 className="subsection-title">Avisos recebidos nos últimos 7 dias</h3>
          {preview.total === 0 ? <p className="card-note" style={{ marginTop: 0 }}>Ninguém recebeu avisos nos últimos 7 dias.</p> : (
            <>
              <ul className="dist">
                {preview.rows.map(r => (
                  <li key={r.count} className="dist__row">
                    <span className="dist__label">{r.count} aviso(s)</span>
                    <span className="dist__track">
                      <span className="dist__fill" style={{ width: `${Math.max(2, Math.round((r.users / preview.total) * 100))}%` }} />
                    </span>
                    <span className="dist__value">{r.users} pessoa(s)</span>
                  </li>
                ))}
              </ul>
              <p className="card-note">
                {preview.total} pessoa(s) receberam avisos · média de {preview.avg} · máximo de {preview.max}.
                {valid && next > 0 && <> Com teto de {next}, <strong>{preview.atCap}</strong> pessoa(s) já estariam no limite hoje.</>}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
