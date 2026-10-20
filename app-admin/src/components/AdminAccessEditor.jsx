import { useState } from 'react';
import { AREA_LABELS, ROLE_AREAS, ROLE_LABELS, SCREENS, saveAccess, setRole } from '../lib/adminAccess';

// Sistema → Administradores → Permissões de uma pessoa (só superadmin edita).
export default function AdminAccessEditor({ admin, adminId, canEdit, onSaved }) {
  const [role, setRoleDraft] = useState(admin.role);
  const [extra, setExtra] = useState(admin.extraAreas);
  const [hidden, setHidden] = useState(admin.hiddenScreens);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const fromRole = ROLE_AREAS[role] || [];
  const isSuper = role === 'superadmin';

  function toggle(list, setList, value) {
    setList(list.includes(value) ? list.filter(x => x !== value) : [...list, value]);
  }

  async function save() {
    setBusy(true); setMsg('');
    try {
      if (role !== admin.role) await setRole(admin.id, role, adminId);
      await saveAccess(admin.id, { extraAreas: extra.filter(a => !fromRole.includes(a)), hiddenScreens: isSuper ? [] : hidden }, adminId);
      setMsg('Permissões salvas.');
      onSaved();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <label className="field" style={{ maxWidth: 260 }}>
        <span className="field__label">Papel</span>
        <select className="input" value={role} disabled={!canEdit} onChange={e => setRoleDraft(e.target.value)} aria-label={`Papel de ${admin.email}`}>
          {Object.entries(ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>

      <fieldset className="field" disabled={!canEdit || isSuper}>
        <legend className="field__label">Pode alterar (escrita no banco)</legend>
        {Object.entries(AREA_LABELS).map(([k, l]) => (
          <label key={k} style={{ display: 'flex', gap: 8 }}>
            <input type="checkbox" aria-label={`Pode alterar: ${l}`} checked={fromRole.includes(k) || extra.includes(k)} disabled={fromRole.includes(k)} onChange={() => toggle(extra, setExtra, k)} />
            {l}{fromRole.includes(k) ? ' (pelo papel)' : ''}
          </label>
        ))}
        <span className="user-detail__meta">Ver dados vale para qualquer admin. Promover admins e mudar papéis é só do superadmin.</span>
      </fieldset>

      {!isSuper && (
        <fieldset className="field" disabled={!canEdit}>
          <legend className="field__label">Telas ocultas no menu ({hidden.length})</legend>
          <div className="access-grid">
            {SCREENS.map(s => (
              <div key={s.key}>
                <strong>{s.label}</strong>
                {s.tabs.map(t => (
                  <label key={t.to} style={{ display: 'flex', gap: 8 }}>
                    <input type="checkbox" checked={hidden.includes(t.to)} onChange={() => toggle(hidden, setHidden, t.to)} aria-label={`Ocultar ${s.label} / ${t.label}`} />
                    {t.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
          <span className="user-detail__meta">Ocultar tira do menu e bloqueia a tela no painel; é organização da equipe, não proteção dos dados.</span>
        </fieldset>
      )}

      {canEdit && (
        <div className="actions-row">
          <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={save}>Salvar permissões</button>
          {msg && <span className={msg.startsWith('Erro') ? 'form-msg form-msg--error' : 'form-msg form-msg--ok'}>{msg}</span>}
        </div>
      )}
    </div>
  );
}
