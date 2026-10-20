import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '../context/useAdminAuth';
import {
  ACCEPT, PROMO_AUDIENCES, audienceLabel, fetchPromoMaterials, formatSize, promoMaterialUrl, removePromoMaterial,
  uploadPromoMaterial, validatePromoFile,
} from '../lib/promoMaterials';
import { formatDate } from '../lib/userDetailHelpers';

// Pessoas → Embaixadores e influenciadores → Material de divulgação: o que
// embaixadores e influenciadores baixam no app (modo do programa → Divulgar),
// cada material para o público escolhido.
export default function PromoMaterialsAdmin() {
  const { adminUser } = useAdminAuth();
  const [items, setItems] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [audience, setAudience] = useState('todos');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchPromoMaterials());
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
      setItems([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fileError = file ? validatePromoFile(file) : '';

  async function handleUpload(e) {
    e.preventDefault();
    const err = validatePromoFile(file);
    if (err) { setMsg(`Erro: ${err}`); return; }
    setBusy(true);
    setMsg('');
    try {
      await uploadPromoMaterial({ title, description, audience, file, adminId: adminUser?.id });
      setMsg(`Material publicado para: ${audienceLabel(audience).toLowerCase()}. Já aparece no app.`);
      setTitle('');
      setDescription('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (error) {
      setMsg(`Erro: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(item) {
    if (!window.confirm(`Remover "${item.title}"? Ele some do app de quem via o material.`)) return;
    setBusy(true);
    setMsg('');
    try {
      await removePromoMaterial({ item, adminId: adminUser?.id });
      setMsg('Material removido.');
      await load();
    } catch (error) {
      setMsg(`Erro: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleOpen(item) {
    try {
      window.open(await promoMaterialUrl(item), '_blank', 'noopener');
    } catch (error) {
      setMsg(`Erro: ${error.message}`);
    }
  }

  return (
    <div className="card stack">
      <div>
        <h2 className="section-title" style={{ margin: 0 }}>Material de divulgação</h2>
        <p className="card-note" style={{ margin: '4px 0 0' }}>
          Logos, imagens, vídeos e PDFs para baixar no app (modo Embaixador/Influenciador → Divulgar). Escolha o
          público de cada material; só quem está ativo no programa vê. Até 50 MB por arquivo.
        </p>
      </div>

      <form className="form-grid" onSubmit={handleUpload}>
        <label className="field">
          <span className="field__label">Título</span>
          <input className="input" value={title} maxLength={80} required placeholder="Ex.: Logo EAFIT (fundo escuro)"
            onChange={e => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Descrição (opcional)</span>
          <input className="input" value={description} maxLength={300} placeholder="Ex.: Para stories, 1080×1920"
            onChange={e => setDescription(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Para</span>
          <select className="input" value={audience} onChange={e => setAudience(e.target.value)}>
            {PROMO_AUDIENCES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Arquivo</span>
          <input ref={fileRef} className="input" type="file" accept={ACCEPT} required
            onChange={e => setFile(e.target.files?.[0] || null)} />
        </label>
        <div className="form-grid__actions">
          <span className={`card-note ${fileError ? 'form-msg--error' : ''}`} style={{ margin: 0 }}>
            {fileError || (file ? `${file.name} · ${formatSize(file.size)}` : 'Imagem, vídeo, PDF ou ZIP.')}
          </span>
          <button className="btn btn--primary" type="submit" disabled={busy || !title.trim() || !file || !!fileError}>
            {busy ? 'Enviando…' : 'Publicar material'}
          </button>
        </div>
      </form>

      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}

      {items && items.length === 0 && <p className="card-note" style={{ margin: 0 }}>Nenhum material publicado ainda.</p>}
      {items && items.length > 0 && (
        <div className="table-wrap">
          <table className="resp-table">
            <thead><tr><th>Título</th><th>Para</th><th>Arquivo</th><th>Tamanho</th><th>Publicado</th><th /></tr></thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td data-label="Título">
                    <strong>{item.title}</strong>
                    {item.description && <div className="user-detail__meta">{item.description}</div>}
                  </td>
                  <td data-label="Para">{audienceLabel(item.audience)}</td>
                  <td data-label="Arquivo">{item.file_name}</td>
                  <td data-label="Tamanho">{formatSize(item.size_bytes)}</td>
                  <td data-label="Publicado">{formatDate(item.created_at)}</td>
                  <td>
                    <div className="actions-row">
                      <button className="btn btn--ghost btn--small" onClick={() => handleOpen(item)}>Abrir</button>
                      <button className="btn btn--danger btn--small" disabled={busy} onClick={() => handleRemove(item)}>Remover</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
