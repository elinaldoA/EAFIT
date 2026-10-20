import { useEffect, useMemo, useState } from 'react';
import { compareVersions, isVersion, saveSetting } from '../lib/appSettings';
import { fetchClientBreakdown } from '../lib/behavior';

// Configurações do app → Versão mínima. Abaixo dela, o app avisa (faixa com
// "Atualizar agora") ou bloqueia (tela cheia). Ver app-react/src/components/ForceUpdate.jsx.
export function versionShare(rows, min) {
  const list = (rows || []).filter(r => r.dimension === 'app_version' && r.value)
    .map(r => ({ version: r.value, users: Number(r.users) || 0 }))
    .sort((a, b) => compareVersions(b.version, a.version));
  const total = list.reduce((a, r) => a + r.users, 0);
  const below = min && isVersion(min) ? list.filter(r => compareVersions(r.version, min) < 0).reduce((a, r) => a + r.users, 0) : 0;
  return { list, total, below, latest: list[0]?.version || '' };
}

export default function MinVersionCard({ saved, adminId, onSaved }) {
  const [draft, setDraft] = useState(saved);
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let active = true;
    fetchClientBreakdown(30).then(r => { if (active) setRows(r); }).catch(() => { if (active) setRows([]); });
    return () => { active = false; };
  }, []);

  const share = useMemo(() => versionShare(rows, draft.version.trim()), [rows, draft.version]);
  const v = draft.version.trim();
  const valid = v === '' || isVersion(v);
  const dirty = v !== saved.version || draft.mode !== saved.mode || draft.message.trim() !== saved.message;

  async function save() {
    if (v && draft.mode === 'block' && !window.confirm(`Bloquear o app para quem está abaixo da ${v} (${share.below} pessoa(s) nos últimos 30 dias) até atualizar?`)) return;
    setBusy(true);
    setMsg('');
    try {
      await saveSetting('min_version', { version: v, mode: draft.mode, message: draft.message.trim() }, adminId);
      setMsg('Salvo.');
      await onSaved();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack" style={{ gap: 14 }}>
      <div>
        <h2 className="section-title" style={{ margin: 0 }}>
          Versão mínima
          <span className={`badge ${saved.version ? (saved.mode === 'block' ? 'badge--danger' : 'badge--warning') : 'badge--ok'}`}>
            {saved.version ? `${saved.mode === 'block' ? 'bloqueia' : 'avisa'} abaixo da ${saved.version}` : 'desligada'}
          </span>
        </h2>
        <p className="user-detail__meta" style={{ margin: '4px 0 0' }}>
          Para quem ficou preso numa versão antiga do app (o PWA às vezes não atualiza sozinho). “Atualizar agora” limpa o
          cache do app no aparelho e recarrega. Vazio = desligado.
        </p>
      </div>
      <div className="two-col">
        <label className="field">
          <span className="field__label">Versão mínima (ex.: 0.3.4)</span>
          <input className="input" value={draft.version} placeholder={share.latest || '0.0.0'} onChange={e => setDraft({ ...draft, version: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Abaixo dela</span>
          <select className="input" value={draft.mode} onChange={e => setDraft({ ...draft, mode: e.target.value })}>
            <option value="warn">Avisar com uma faixa</option>
            <option value="block">Bloquear até atualizar</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field__label">Mensagem (opcional)</span>
        <input className="input" maxLength={200} value={draft.message} placeholder="Atualize para receber a correção do cronômetro." onChange={e => setDraft({ ...draft, message: e.target.value })} />
      </label>
      {!valid && <p className="form-msg form-msg--error">Use o formato 1, 1.4 ou 1.4.2.</p>}

      {rows === null ? <p className="card-note" style={{ margin: 0 }}>Carregando versões…</p> : share.list.length === 0 ? (
        <p className="card-note" style={{ margin: 0 }}>Nenhum acesso com versão registrada nos últimos 30 dias.</p>
      ) : (
        <div>
          <ul className="dist">
            {share.list.map(r => (
              <li key={r.version} className="dist__row">
                <span className="dist__label">{r.version}{v && isVersion(v) && compareVersions(r.version, v) < 0 ? ' ⚠️' : ''}</span>
                <span className="dist__track"><span className="dist__fill" style={{ width: `${Math.max(2, Math.round((r.users / share.total) * 100))}%` }} /></span>
                <span className="dist__value">{r.users} pessoa(s)</span>
              </li>
            ))}
          </ul>
          <p className="card-note" style={{ margin: 0 }}>
            Últimos 30 dias, pela versão do último acesso de cada pessoa. Mais nova: <strong>{share.latest}</strong>.
            {v && isVersion(v) && <> Abaixo da {v}: <strong>{share.below}</strong> de {share.total}.</>}
          </p>
        </div>
      )}
      <div className="actions-row">
        <button className={`btn btn--small ${draft.mode === 'block' && v ? 'btn--danger' : 'btn--primary'}`} disabled={busy || !dirty || !valid} onClick={save}>Salvar</button>
        <button className="btn btn--ghost btn--small" disabled={busy || !dirty} onClick={() => { setDraft(saved); setMsg(''); }}>Desfazer</button>
        {msg && <span className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</span>}
      </div>
    </div>
  );
}
