import { useEffect, useRef, useState } from 'react';
import { useConfirm } from '../../context/confirmContext';
import {
  fetchMediaInUse, removeMedia, removeMediaBatch, unusedMedia, uploadMedia, validateUpload,
} from '../../lib/marketing';
import {
  PROMO_AUDIENCES, audienceLabel, formatHint, formatSize, partnerTitle, sendMediaToPartners,
} from '../../lib/promoMaterials';
import Loading from '../Loading';
import EmptyState from '../EmptyState';
import { Paged } from '../ShowMore';

// "Minhas mídias": envio de arquivo, limpeza de mídias sem uso, grade e o
// formulário de enviar uma mídia aos parceiros. `share` mora na página porque ela
// esconde a mensagem do topo enquanto esse formulário (que tem a sua) está aberto.
export default function MediaLibrary({ items, shared, load, msg, setMsg, busy, setBusy, adminId, share, setShare }) {
  const ask = useConfirm();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const fileRef = useRef(null);
  const shareRef = useRef(null);

  function openShare(m) {
    setMsg('');
    setShare({ media: m, title: partnerTitle(m.title), description: formatHint(m), audience: 'todos', caption: '' });
  }

  // O formulário abre abaixo da lista: leva a tela até ele, senão o botão parece morto.
  useEffect(() => {
    if (share) shareRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [share?.media?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleShare(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await sendMediaToPartners({ ...share, adminId });
      setMsg(`“${share.title}” enviado para ${audienceLabel(share.audience).toLowerCase()}. Já aparece no app, em Divulgar.`);
      setShare(null);
      await load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    const err = validateUpload(file);
    if (err) { setMsg(`Erro: ${err}`); return; }
    setBusy(true);
    setMsg('');
    try {
      await uploadMedia({ file, title: title || file.name, adminId });
      setMsg('Arquivo adicionado à biblioteca.');
      setFile(null);
      setTitle('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (error) {
      setMsg(`Erro: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  // Limpeza em lote: lista o que nenhum post da fila usa e remove tudo com uma confirmação só.
  const [cleanup, setCleanup] = useState(null); // { list, bytes }

  async function openCleanup() {
    setMsg('');
    setBusy(true);
    try {
      const list = unusedMedia(items, await fetchMediaInUse());
      setCleanup({ list, bytes: list.reduce((s, m) => s + (m.size_bytes || 0), 0) });
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmCleanup() {
    setBusy(true);
    try {
      const { done, failed } = await removeMediaBatch(cleanup.list);
      setCleanup(null);
      setMsg(failed.length
        ? `Erro: ${done} removidas, ${failed.length} falharam (${failed[0].message}).`
        : `${done} mídia${done === 1 ? '' : 's'} sem uso removida${done === 1 ? '' : 's'} da biblioteca e do armazenamento.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(item) {
    if (!await ask(`Remover “${item.title || item.storage_path}” da biblioteca? Posts já publicados não mudam.`)) return;
    try {
      await removeMedia(item);
      await load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    }
  }

  return (
    <section className="card stack">
      <h2 className="section-title">Minhas mídias</h2>
      <form className="form-grid" onSubmit={handleUpload}>
        <label className="field">
          <span className="field__label">Arquivo (JPG, PNG, MP4 ou MOV, até 100 MB)</span>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime" onChange={e => setFile(e.target.files?.[0] || null)} />
        </label>
        <label className="field">
          <span className="field__label">Nome na biblioteca</span>
          <input className="input" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="ex.: Vídeo de lançamento" />
        </label>
        <div className="form-grid__actions">
          <button type="submit" className="btn btn--primary" disabled={busy || !file}>{busy ? 'Enviando…' : 'Adicionar'}</button>
        </div>
      </form>
      {items && items.length > 0 && !cleanup && (
        <div className="form-grid__actions">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={openCleanup}>Limpar mídias sem uso</button>
        </div>
      )}
      {cleanup && (
        <div className="card stack" role="region" aria-label="Limpeza da biblioteca">
          {cleanup.list.length === 0
            ? <p>Nenhuma mídia sem uso: tudo o que está na biblioteca ainda é usado por um post na fila.</p>
            : (
              <>
                <p>
                  <strong>{cleanup.list.length} mídia{cleanup.list.length === 1 ? '' : 's'}</strong> ({formatSize(cleanup.bytes)}) não {cleanup.list.length === 1 ? 'é usada' : 'são usadas'} por
                  nenhum post pendente ou com falha. Vão sair da biblioteca e do armazenamento, <strong>sem volta</strong>. Posts já
                  publicados e o material dos parceiros não mudam.
                </p>
                <ul className="user-detail__meta">
                  {cleanup.list.map(m => <li key={m.id}>{m.title || m.storage_path} · {m.kind === 'video' ? 'vídeo' : 'imagem'}{m.size_bytes ? ` · ${formatSize(m.size_bytes)}` : ''}</li>)}
                </ul>
              </>
            )}
          <div className="form-grid__actions">
            {cleanup.list.length > 0 && (
              <button type="button" className="btn btn--primary" disabled={busy} onClick={confirmCleanup}>
                {busy ? 'Removendo…' : `Remover ${cleanup.list.length} definitivamente`}
              </button>
            )}
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setCleanup(null)}>Fechar</button>
          </div>
        </div>
      )}
      {!items && <Loading />}
      {items && items.length === 0 && <EmptyState icon="🖼️" label="Nada aqui ainda: envie um arquivo ou crie uma arte com um print." />}
      {items && items.length > 0 && (
        <Paged items={items} size={24}>{visible => (
        <div className="mkt-grid">
          {visible.map(m => (
            <figure key={m.id} className="mkt-tile">
              {m.kind === 'video'
                ? <video src={m.url} muted playsInline preload="metadata" className="mkt-tile__media" />
                : <img src={m.url} alt="" loading="lazy" className="mkt-tile__media" />}
              <figcaption>
                <strong>{m.title || 'Sem nome'}</strong>
                <span className="user-detail__meta">
                  {m.kind === 'video' ? 'vídeo' : 'imagem'}{m.width ? ` · ${m.width}×${m.height}` : ''}{m.size_bytes ? ` · ${formatSize(m.size_bytes)}` : ''}
                </span>
                {shared.has(m.id) && (
                  <span className="badge badge--ok" title={shared.get(m.id).map(audienceLabel).join(' · ')}>Com os parceiros</span>
                )}
                <button type="button" className="btn btn--small" onClick={() => openShare(m)}>Enviar aos parceiros</button>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => handleRemove(m)}>Remover</button>
              </figcaption>
            </figure>
          ))}
        </div>
        )}</Paged>
      )}

      {share && (
        <form ref={shareRef} className="mkt-art" onSubmit={handleShare}>
          <div className="stack">
            <h3 className="section-title">Enviar aos parceiros</h3>
            <p className="user-detail__meta">
              Vira material de divulgação no app de embaixadores e influenciadores (Divulgar). O texto pronto aparece com
              o botão “Copiar texto”, já com o link de quem copia.
            </p>
            <label className="field">
              <span className="field__label">Título no app</span>
              <input className="input" value={share.title} maxLength={80} required onChange={e => setShare({ ...share, title: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">Descrição</span>
              <input className="input" value={share.description} maxLength={300} onChange={e => setShare({ ...share, description: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">Para</span>
              <select className="input" value={share.audience} onChange={e => setShare({ ...share, audience: e.target.value })}>
                {PROMO_AUDIENCES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Texto pronto (opcional; o link do parceiro entra no fim)</span>
              <textarea className="input" rows={4} value={share.caption} maxLength={1000}
                placeholder="Ex.: Meu treino agora fala comigo 🎧 Comece agora:"
                onChange={e => setShare({ ...share, caption: e.target.value })} />
            </label>
            {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`} role={msg.startsWith('Erro') ? 'alert' : 'status'}>{msg}</p>}
            <div className="actions-row">
              <button type="submit" className="btn btn--primary" disabled={busy || !share.title.trim()}>{busy ? 'Enviando…' : 'Enviar'}</button>
              <button type="button" className="btn btn--ghost" onClick={() => setShare(null)}>Fechar</button>
            </div>
          </div>
          {share.media.kind === 'video'
            ? <video src={share.media.url} muted playsInline controls className="mkt-art__preview" />
            : <img src={share.media.url} alt="" className="mkt-art__preview" />}
        </form>
      )}
    </section>
  );
}
