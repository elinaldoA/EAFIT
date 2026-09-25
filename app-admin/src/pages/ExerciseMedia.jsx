import { useEffect, useMemo, useRef, useState } from 'react';
import { useAdminAuth } from '../context/useAdminAuth';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import {
  ACCEPT, fetchMediaScreen, normalizeName, publicUrl,
  removeExerciseMedia, uploadExerciseMedia, validateMediaFile,
} from '../lib/exerciseMedia';

const FILTERS = [
  { value: 'todos', label: 'Todos' },
  { value: 'com', label: 'Com mídia própria' },
  { value: 'sem', label: 'Sem mídia própria' },
];

function Preview({ media }) {
  const url = publicUrl(media.storage_path);
  return media.media_type === 'video'
    ? <video className="media-thumb" src={url} muted loop autoPlay playsInline preload="metadata" />
    : <img className="media-thumb" src={url} alt="" loading="lazy" />;
}

// Envio de GIF/imagem/vídeo curto mostrando a execução correta de cada
// exercício. No app, a mídia enviada aqui substitui a demonstração padrão
// (Free Exercise DB) do botão "Ver execução".
export default function ExerciseMedia() {
  const { adminUser } = useAdminAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(null); // nome em envio/remoção
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('todos');
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [customName, setCustomName] = useState('');
  const fileRef = useRef(null);
  const targetRef = useRef(null);

  async function load() {
    try {
      setRows(await fetchMediaScreen());
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const q = normalizeName(search).toLowerCase();
    return rows.filter(r =>
      (!q || r.nome.toLowerCase().includes(q))
      && (filter === 'todos' || (filter === 'com' ? r.media : !r.media)));
  }, [rows, search, filter]);

  const withMedia = rows.filter(r => r.media).length;

  function pickFile(row) {
    targetRef.current = row;
    fileRef.current.value = '';
    fileRef.current.click();
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    const row = targetRef.current;
    if (!file || !row) return;
    const invalid = validateMediaFile(file);
    if (invalid) { setMsg({ ok: false, text: invalid }); return; }
    setBusy(row.nome);
    setMsg(null);
    try {
      await uploadExerciseMedia({ nome: row.nome, file, previousPath: row.media?.storage_path, adminId: adminUser.id });
      setMsg({ ok: true, text: `Mídia de "${row.nome}" salva. Aparece no app na próxima vez que ele carregar.` });
      setCustomName('');
      await load();
    } catch (err) {
      setMsg({ ok: false, text: `Não foi possível enviar: ${err.message}` });
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove(row) {
    setConfirmRemove(null);
    setBusy(row.nome);
    setMsg(null);
    try {
      await removeExerciseMedia({ nome: row.nome, path: row.media.storage_path, adminId: adminUser.id });
      setMsg({ ok: true, text: `Mídia de "${row.nome}" removida. O app volta a usar a demonstração padrão, se houver.` });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: `Não foi possível remover: ${err.message}` });
    } finally {
      setBusy(null);
    }
  }

  function handleCustomName(e) {
    e.preventDefault();
    const nome = normalizeName(customName);
    if (!nome) return;
    pickFile(rows.find(r => r.nome === nome) || { nome, grupo: null, media: null });
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Demonstrações de exercícios</h1>
          <p className="page-subtitle">
            Envie um GIF, imagem ou vídeo curto (até 15MB) com a execução correta. No app, ele substitui a
            demonstração padrão do botão "Ver execução". {!loading && `${withMedia} de ${rows.length} com mídia própria.`}
          </p>
        </div>
      </div>

      <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={handleFile} />

      <div className="card media-toolbar">
        <input
          className="input search-input" type="search" placeholder="Buscar exercício…"
          value={search} onChange={e => setSearch(e.target.value)} aria-label="Buscar exercício"
        />
        <div className="actions-row" role="group" aria-label="Filtro">
          {FILTERS.map(f => (
            <button
              key={f.value} type="button" aria-pressed={filter === f.value}
              className={`btn btn--small${filter === f.value ? ' btn--primary' : ' btn--ghost'}`}
              onClick={() => setFilter(f.value)}
            >{f.label}</button>
          ))}
        </div>
        <form className="media-custom" onSubmit={handleCustomName}>
          <input
            className="input" placeholder="Outro nome (exatamente como aparece no plano)"
            value={customName} onChange={e => setCustomName(e.target.value)} aria-label="Nome do exercício fora da biblioteca"
          />
          <button type="submit" className="btn btn--small" disabled={!customName.trim() || !!busy}>Enviar mídia</button>
        </form>
      </div>

      {msg && <p className={`form-msg ${msg.ok ? 'form-msg--ok' : 'form-msg--error'}`} role="status">{msg.text}</p>}
      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {!loading && !error && (
        <table className="resp-table">
          <thead><tr><th>Exercício</th><th>Grupo</th><th>Mídia própria</th><th>Ações</th></tr></thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.nome}>
                <td data-label="Exercício">{r.nome}</td>
                <td data-label="Grupo">{r.grupo ? r.grupo.replace('_', ' ') : <span className="badge">fora da biblioteca</span>}</td>
                <td data-label="Mídia própria">
                  {r.media ? <Preview media={r.media} /> : <span className="muted">Padrão (se houver)</span>}
                </td>
                <td data-label="Ações">
                  {confirmRemove === r.nome ? (
                    <div className="actions-row">
                      <button type="button" className="btn btn--danger btn--small" onClick={() => handleRemove(r)}>Confirmar remoção</button>
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => setConfirmRemove(null)}>Cancelar</button>
                    </div>
                  ) : (
                    <div className="actions-row">
                      <button type="button" className="btn btn--small" disabled={!!busy} onClick={() => pickFile(r)}>
                        {busy === r.nome ? 'Enviando…' : r.media ? 'Trocar' : 'Enviar'}
                      </button>
                      {r.media && (
                        <button type="button" className="btn btn--ghost btn--small" disabled={!!busy} onClick={() => setConfirmRemove(r.nome)}>Remover</button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={4}><EmptyState icon="🎬" label="Nenhum exercício com esse filtro." /></td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
