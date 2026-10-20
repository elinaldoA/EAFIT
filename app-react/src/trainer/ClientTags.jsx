import { useState } from 'react';
import { useToast } from '../context/useToast';
import { MAX_TAGS, TAG_MAX_LEN, normalizeTags, setClientTags, friendlyRosterError } from '../lib/trainerRoster';

import { t } from '../lib/i18n';
// Etiquetas do aluno (Online, Presencial, Plano anual...): só o personal vê e
// usa para filtrar a lista. Cada mudança é salva na hora.
export default function ClientTags({ clientId, initial = [] }) {
  const toast = useToast();
  const [tags, setTags] = useState(initial);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(next) {
    const prev = tags;
    const clean = normalizeTags(next);
    setTags(clean); setBusy(true);
    try { setTags(await setClientTags(clientId, clean)); }
    catch (err) { setTags(prev); toast(`❌ ${friendlyRosterError(err)}`); }
    finally { setBusy(false); }
  }

  function handleAdd(e) {
    e.preventDefault();
    if (!text.trim()) return;
    save([...tags, text]);
    setText('');
  }

  return (
    <div className="client-tags">
      {tags.map(x => (
        <span key={x} className="tag-chip tag-chip--static">
          {x}
          <button type="button" aria-label={t('Remover etiqueta {tag}', { tag: x })} disabled={busy} onClick={() => save(tags.filter(y => y !== x))}>✕</button>
        </span>
      ))}
      {tags.length < MAX_TAGS && (
        <form className="client-tags__add" onSubmit={handleAdd}>
          <input className="input input--sm" maxLength={TAG_MAX_LEN} placeholder={t('+ etiqueta')} aria-label={t('Nova etiqueta')}
            value={text} disabled={busy} onChange={e => setText(e.target.value)} />
        </form>
      )}
    </div>
  );
}
