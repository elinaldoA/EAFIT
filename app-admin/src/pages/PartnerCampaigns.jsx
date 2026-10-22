import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '../context/useAdminAuth';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import {
  AUDIENCES, GOAL_MAX, KIND_LABELS, STATUS, TEXT_MAX, TITLE_MAX,
  audienceLabel, campaignStatus, deleteCampaign, draftFrom, emptyDraft, fetchCampaignMaterials, fetchCampaignResults,
  fetchCampaigns, linkExample, noticeFor, notifyPartners, saveCampaign, slugify, uploadCampaignMaterial, validateDraft,
} from '../lib/partnerCampaigns';
import { ACCEPT, formatSize, promoMaterialUrl, removePromoMaterial, validatePromoFile } from '../lib/promoMaterials';
import { MESSAGE_BODY_MAX, MESSAGE_TITLE_MAX } from '../lib/ambassadors';

const fmtDay = iso => (iso ? iso.split('-').reverse().join('/') : '');
const period = c => (c.ends_on ? `${fmtDay(c.starts_on)} a ${fmtDay(c.ends_on)}` : `Desde ${fmtDay(c.starts_on)}`);
const pct = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');

function CampaignForm({ initial, onSaved, onCancel }) {
  const { adminUser } = useAdminAuth();
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = patch => setD(prev => ({ ...prev, ...patch }));
  const locked = initial.published; // publicada: o endereço já está nos links

  function setTitle(title) {
    set(d.slugTouched || locked ? { title } : { title, slug: slugify(title) });
  }

  function toggleAudience(key) {
    set({ audiences: d.audiences.includes(key) ? d.audiences.filter(k => k !== key) : [...d.audiences, key] });
  }

  async function submit(publish) {
    const problem = validateDraft(d);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError('');
    try {
      const saved = await saveCampaign(d, adminUser?.id, publish);
      onSaved(saved, publish === true && !initial.published);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={e => { e.preventDefault(); submit(undefined); }}>
      <h2 className="section-title" style={{ margin: 0 }}>{d.id ? 'Editar campanha' : 'Nova campanha'}</h2>
      <div className="form-grid">
        <label className="field">
          <span className="field__label">Título</span>
          <input className="input" value={d.title} maxLength={TITLE_MAX} required placeholder="Ex.: Verão 2026 — traga um amigo"
            onChange={e => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Endereço da campanha (vai no link)</span>
          <input className="input" value={d.slug} maxLength={40} disabled={locked} placeholder="verao-2026"
            onChange={e => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''), slugTouched: true })} />
          <span className="card-note" style={{ margin: 0 }}>
            {locked ? 'Não muda depois de publicada.' : linkExample(d.slug)}
          </span>
        </label>
        <label className="field">
          <span className="field__label">Começa em</span>
          <input className="input" type="date" value={d.startsOn} onChange={e => set({ startsOn: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Termina em (opcional)</span>
          <input className="input" type="date" value={d.endsOn} onChange={e => set({ endsOn: e.target.value })} />
        </label>
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field__label">Para quem</legend>
        <div className="actions-row">
          {AUDIENCES.map(a => (
            <label key={a.key} className="actions-row" style={{ gap: 6 }}>
              <input type="checkbox" checked={d.audiences.includes(a.key)} onChange={() => toggleAudience(a.key)} />
              <span>{a.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span className="field__label">Descrição (o que é a campanha e o que o parceiro deve fazer)</span>
        <textarea className="input" rows={3} value={d.description} maxLength={TEXT_MAX}
          placeholder="Ex.: Em janeiro, divulgue o EAFIT para quem quer voltar a treinar depois das festas."
          onChange={e => set({ description: e.target.value })} />
      </label>
      <label className="field">
        <span className="field__label">Texto sugerido para o post</span>
        <textarea className="input" rows={3} value={d.caption} maxLength={TEXT_MAX}
          placeholder="Ex.: Ano novo, treino novo! Monte seu treino grátis no EAFIT 👉 {link}"
          onChange={e => set({ caption: e.target.value })} />
        <span className="card-note" style={{ margin: 0 }}>
          Escreva <code>{'{link}'}</code> onde o link de cada parceiro deve entrar (sem isso, o link vai no fim).
        </span>
      </label>
      <label className="field">
        <span className="field__label">Meta ou prêmio (opcional)</span>
        <input className="input" value={d.goal} maxLength={GOAL_MAX} placeholder="Ex.: 10 cadastros no mês = comissão em dobro"
          onChange={e => set({ goal: e.target.value })} />
      </label>
      {error && <p className="form-msg form-msg--error">{error}</p>}
      <div className="actions-row">
        {!initial.published && (
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => submit(true)}>
            {busy ? 'Salvando…' : 'Salvar e publicar'}
          </button>
        )}
        <button type="submit" className={`btn ${initial.published ? 'btn--primary' : 'btn--ghost'}`} disabled={busy}>
          {initial.published ? 'Salvar' : 'Salvar rascunho'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
      </div>
      <p className="card-note" style={{ margin: 0 }}>
        Publicada, a campanha aparece no app de cada parceiro do público a partir do início (modo Embaixador/Influenciador →
        Divulgar; modo Personal → Painel), com o link dele já marcado. Encerrada, ainda fica 30 dias visível só com os números.
      </p>
    </form>
  );
}

function Materials({ campaign }) {
  const { adminUser } = useAdminAuth();
  const [items, setItems] = useState(null);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(() => {
    fetchCampaignMaterials(campaign.id).then(setItems).catch(err => { setMsg(`Erro: ${err.message}`); setItems([]); });
  }, [campaign.id]);
  useEffect(() => { load(); }, [load]);

  const fileError = file ? validatePromoFile(file) : '';

  async function upload(e) {
    e.preventDefault();
    if (validatePromoFile(file)) return;
    setBusy(true);
    setMsg('');
    try {
      await uploadCampaignMaterial({ campaignId: campaign.id, title, description: '', file, adminId: adminUser?.id });
      setTitle('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(item) {
    if (!window.confirm(`Remover "${item.title}" da campanha?`)) return;
    try {
      await removePromoMaterial({ item, adminId: adminUser?.id });
      load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    }
  }

  async function open(item) {
    try { window.open(await promoMaterialUrl(item), '_blank', 'noopener'); } catch (err) { setMsg(`Erro: ${err.message}`); }
  }

  return (
    <div className="stack">
      <h3 className="subsection-title" style={{ margin: 0 }}>Material da campanha</h3>
      <form className="form-grid" onSubmit={upload}>
        <label className="field">
          <span className="field__label">Título</span>
          <input className="input" value={title} maxLength={80} required placeholder="Ex.: Arte para stories" onChange={e => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Arquivo (até 50 MB)</span>
          <input ref={fileRef} className="input" type="file" accept={ACCEPT} required onChange={e => setFile(e.target.files?.[0] || null)} />
        </label>
        <div className="form-grid__actions">
          <span className={`card-note ${fileError ? 'form-msg--error' : ''}`} style={{ margin: 0 }}>
            {fileError || (file ? `${file.name} · ${formatSize(file.size)}` : 'Imagem, vídeo, PDF ou ZIP.')}
          </span>
          <button className="btn btn--primary" type="submit" disabled={busy || !title.trim() || !file || !!fileError}>
            {busy ? 'Enviando…' : 'Adicionar material'}
          </button>
        </div>
      </form>
      {msg && <p className="form-msg form-msg--error">{msg}</p>}
      {items === null ? <Loading /> : items.length === 0
        ? <p className="card-note" style={{ margin: 0 }}>Nenhum material nesta campanha.</p>
        : (
          <ul className="dist" style={{ gap: 6 }}>
            {items.map(item => (
              <li key={item.id} className="actions-row" style={{ justifyContent: 'space-between' }}>
                <span><strong>{item.title}</strong> · {item.file_name} · {formatSize(item.size_bytes)}</span>
                <span className="actions-row">
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => open(item)}>Abrir</button>
                  <button type="button" className="btn btn--danger btn--small" onClick={() => remove(item)}>Remover</button>
                </span>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

function Notify({ campaign, onDone }) {
  const [notice, setNotice] = useState(() => noticeFor(campaign));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function send(e) {
    e.preventDefault();
    const who = campaign.audiences.map(audienceLabel).join(', ').toLowerCase();
    if (!window.confirm(`Enviar o aviso para ${who}? Eles recebem notificação no celular.`)) return;
    setBusy(true);
    setMsg('');
    try {
      const n = await notifyPartners(campaign, notice);
      setMsg(`Aviso enviado para ${n} parceiro(s).`);
      onDone?.();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={send}>
      <h3 className="subsection-title" style={{ margin: 0 }}>Avisar os parceiros</h3>
      <p className="card-note" style={{ margin: 0 }}>
        Notificação no celular e recado no app (embaixadores e influenciadores: aba Recados; personais: avisos).
      </p>
      <label className="field">
        <span className="field__label">Título</span>
        <input className="input" value={notice.title} maxLength={MESSAGE_TITLE_MAX} onChange={e => setNotice({ ...notice, title: e.target.value })} />
      </label>
      <label className="field">
        <span className="field__label">Mensagem</span>
        <textarea className="input" rows={3} value={notice.body} maxLength={MESSAGE_BODY_MAX} onChange={e => setNotice({ ...notice, body: e.target.value })} />
      </label>
      <div className="actions-row">
        <button type="submit" className="btn btn--primary" disabled={busy || !notice.title.trim() || !notice.body.trim()}>
          {busy ? 'Enviando…' : 'Enviar aviso'}
        </button>
        {msg && <span className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</span>}
      </div>
    </form>
  );
}

function Results({ campaign }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetchCampaignResults(campaign.id)
      .then(r => { if (active) setRows(r); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [campaign.id]);

  if (error) return <p className="form-msg form-msg--error">{error}</p>;
  if (!rows) return <Loading />;
  const engaged = rows.filter(r => r.visits > 0 || r.signups > 0).length;
  return (
    <div className="stack">
      <h3 className="subsection-title" style={{ margin: 0 }}>Resultado por parceiro</h3>
      <p className="card-note" style={{ margin: 0 }}>
        {engaged} de {rows.length} parceiros já trouxeram visitas. Cliques = visitas pelo link da campanha (no máximo 1 por dia por
        navegador). Ativados = treinaram nos 7 primeiros dias.
      </p>
      {rows.length === 0 ? <p className="card-note" style={{ margin: 0 }}>Nenhum parceiro ativo neste público.</p> : (
        <div className="table-wrap">
          <table className="resp-table">
            <thead><tr><th>Parceiro</th><th>Tipo</th><th>Código</th><th>Cliques</th><th>Cadastros</th><th>Conversão</th><th>Ativados</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.kind}-${r.code}`}>
                  <td data-label="Parceiro"><strong>{r.name}</strong></td>
                  <td data-label="Tipo">{KIND_LABELS[r.kind] || r.kind}</td>
                  <td data-label="Código"><code>{r.code}</code></td>
                  <td data-label="Cliques">{r.visits}</td>
                  <td data-label="Cadastros">{r.signups}</td>
                  <td data-label="Conversão">{pct(r.signups, r.visits)}</td>
                  <td data-label="Ativados">{r.activated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PartnerCampaigns() {
  const { adminUser } = useAdminAuth();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [notifyId, setNotifyId] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    fetchCampaigns().then(setList).catch(err => { setError(err.message); setList([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  function handleSaved(saved, justPublished) {
    setEditing(null);
    setOpenId(saved.id);
    setNotifyId(justPublished ? saved.id : null);
    setMsg(justPublished ? 'Campanha publicada. Se quiser, avise os parceiros abaixo.' : 'Campanha salva.');
    load();
  }

  async function togglePublish(c) {
    const publish = !c.published_at;
    if (!publish && !window.confirm(`Tirar "${c.title}" do ar? Ela some do app dos parceiros; os links continuam funcionando.`)) return;
    try {
      await saveCampaign(draftFrom(c), adminUser?.id, publish);
      setMsg(publish ? 'Campanha publicada.' : 'Campanha voltou a rascunho.');
      if (publish) { setOpenId(c.id); setNotifyId(c.id); }
      load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    }
  }

  async function remove(c) {
    if (!window.confirm(`Excluir "${c.title}" e o material dela? Os números somem do painel e do app dos parceiros.`)) return;
    try {
      await deleteCampaign(c, adminUser?.id);
      setMsg('Campanha excluída.');
      if (openId === c.id) setOpenId(null);
      load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Campanhas de parceiros</h1>
          <p className="page-subtitle">
            Crie campanhas para embaixadores, influenciadores e personais divulgarem. Cada um recebe no app o próprio link
            da campanha, o texto e o material, e aqui você vê quem trouxe visitas, cadastros e gente treinando.
          </p>
        </div>
        {!editing && <button type="button" className="btn btn--primary" onClick={() => { setMsg(''); setEditing(emptyDraft()); }}>Nova campanha</button>}
      </div>

      {editing && <CampaignForm key={editing.id || 'nova'} initial={editing} onSaved={handleSaved} onCancel={() => setEditing(null)} />}
      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {list === null ? <Loading /> : list.length === 0 ? (
        <EmptyState icon="📣" label="Nenhuma campanha ainda. Crie a primeira: ela aparece no app dos parceiros quando for publicada." />
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="resp-table">
              <thead><tr><th>Campanha</th><th>Para</th><th>Período</th><th>Situação</th><th>Cliques</th><th>Cadastros</th><th>Ativados</th><th /></tr></thead>
              <tbody>
                {list.map(c => {
                  const status = STATUS[campaignStatus(c)];
                  return (
                    <tr key={c.id}>
                      <td data-label="Campanha"><strong>{c.title}</strong><div className="user-detail__meta"><code>{c.slug}</code></div></td>
                      <td data-label="Para">{c.audiences.map(audienceLabel).join(', ')}</td>
                      <td data-label="Período">{period(c)}</td>
                      <td data-label="Situação"><span className={`badge ${status.badge}`}>{status.label}</span></td>
                      <td data-label="Cliques">{c.visits}</td>
                      <td data-label="Cadastros">{c.signups}</td>
                      <td data-label="Ativados">{c.activated}</td>
                      <td>
                        <div className="actions-row">
                          <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                            {openId === c.id ? 'Fechar' : 'Detalhes'}
                          </button>
                          <button type="button" className="btn btn--ghost btn--small" onClick={() => { setMsg(''); setEditing(draftFrom(c)); }}>Editar</button>
                          <button type="button" className="btn btn--ghost btn--small" onClick={() => togglePublish(c)}>
                            {c.published_at ? 'Tirar do ar' : 'Publicar'}
                          </button>
                          <button type="button" className="btn btn--danger btn--small" onClick={() => remove(c)}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {list?.filter(c => c.id === openId).map(c => (
        <div key={c.id} className="card stack">
          <h2 className="section-title" style={{ margin: 0 }}>{c.title}</h2>
          {c.description && <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{c.description}</p>}
          {c.goal && <p style={{ margin: 0 }}>🎯 {c.goal}</p>}
          <p className="card-note" style={{ margin: 0 }}>
            Link de exemplo: <code>{linkExample(c.slug, c.audiences.includes('personal') && c.audiences.length === 1 ? 'personal' : 'embaixador')}</code>
          </p>
          <Results campaign={c} />
          <Materials campaign={c} />
          {c.published_at && (notifyId === c.id
            ? <Notify campaign={c} />
            : <button type="button" className="btn btn--ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setNotifyId(c.id)}>Avisar os parceiros</button>)}
        </div>
      ))}
    </div>
  );
}
