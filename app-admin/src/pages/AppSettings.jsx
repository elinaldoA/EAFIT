import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '../context/useAdminAuth';
import {
  KNOWN_FLAGS, BANNER_LEVELS, fetchSettings, saveSetting, isValidLink, isValidMovedUrl, nextBannerVersion, bannerWindow,
} from '../lib/appSettings';
import { todayStr } from '../lib/community';
import Loading from '../components/Loading';

function SectionMessage({ msg }) {
  if (!msg) return null;
  return <span className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</span>;
}

function MaintenanceCard({ saved, adminId, onSaved }) {
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const dirty = draft.enabled !== saved.enabled || draft.message !== saved.message;

  async function handleSave() {
    if (draft.enabled && !saved.enabled
      && !window.confirm('Ligar a manutenção BLOQUEIA o app para todos os usuários, inclusive quem está usando agora. Continuar?')) return;
    setBusy(true);
    setMsg('');
    try {
      await saveSetting('maintenance', { enabled: draft.enabled, message: draft.message.trim() }, adminId);
      setMsg('Salvo.');
      await onSaved();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack" style={{ gap: 14, ...(saved.enabled ? { borderColor: 'var(--danger)' } : {}) }}>
      <div className="card-head" style={{ marginBottom: 0 }}>
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>
            Modo manutenção
            <span className={`badge ${saved.enabled ? 'badge--danger' : 'badge--ok'}`}>{saved.enabled ? 'app bloqueado' : 'desligado'}</span>
          </h2>
          <p className="user-detail__meta" style={{ margin: '4px 0 0' }}>
            Quando ligado, o app mostra uma tela de "voltamos em instantes" para todos. Use em migrações ou correções críticas.
            O app consulta esta configuração a cada 5 minutos e quando volta ao primeiro plano.
          </p>
        </div>
        <label className="switch-row">
          <input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />
          <span>Ligado</span>
        </label>
      </div>
      <label className="field">
        <span className="field__label">Mensagem exibida (opcional)</span>
        <textarea
          className="input" rows={2} maxLength={200} value={draft.message}
          placeholder="Estamos fazendo uma manutenção rápida. Voltamos às 14h."
          onChange={e => setDraft({ ...draft, message: e.target.value })}
        />
      </label>
      <div className="actions-row">
        <button className={`btn btn--small ${draft.enabled ? 'btn--danger' : 'btn--primary'}`} disabled={busy || !dirty} onClick={handleSave}>Salvar</button>
        <button className="btn btn--ghost btn--small" disabled={busy || !dirty} onClick={() => { setDraft(saved); setMsg(''); }}>Desfazer</button>
        <SectionMessage msg={msg} />
      </div>
    </div>
  );
}

function BannerCard({ saved, adminId, onSaved }) {
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const dirty = ['enabled', 'message', 'level', 'linkUrl', 'linkLabel', 'startsOn', 'endsOn'].some(k => (draft[k] || '') !== (saved[k] || ''));
  const linkOk = isValidLink(draft.linkUrl);
  const periodOk = !draft.startsOn || !draft.endsOn || draft.startsOn <= draft.endsOn;
  const valid = linkOk && periodOk && (!draft.enabled || draft.message.trim());
  const live = saved.enabled && saved.message;
  const period = bannerWindow(saved, todayStr());
  const statusLabel = !live ? 'desligado' : period === 'agendado' ? 'agendado' : period === 'encerrado' ? 'período encerrado' : 'no ar';

  async function handleSave() {
    setBusy(true);
    setMsg('');
    try {
      const next = {
        enabled: draft.enabled, message: draft.message.trim(), level: draft.level,
        linkUrl: draft.linkUrl.trim(), linkLabel: draft.linkLabel.trim(),
        startsOn: draft.startsOn || '', endsOn: draft.endsOn || '',
      };
      await saveSetting('banner', { ...next, version: nextBannerVersion(saved, next) }, adminId);
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
      <div className="card-head" style={{ marginBottom: 0 }}>
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>
            Aviso no app
            <span className={`badge ${statusLabel === 'no ar' ? 'badge--ok' : 'badge--warning'}`}>{statusLabel}</span>
          </h2>
          <p className="user-detail__meta" style={{ margin: '4px 0 0' }}>
            Faixa no topo do app para comunicar novidades ou avisos. O usuário pode fechar; ao editar o aviso, ele volta a aparecer para todos.
          </p>
        </div>
        <label className="switch-row">
          <input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />
          <span>No ar</span>
        </label>
      </div>

      <label className="field">
        <span className="field__label">Mensagem</span>
        <input className="input" maxLength={160} value={draft.message} onChange={e => setDraft({ ...draft, message: e.target.value })} />
      </label>

      <div className="form-grid">
        <label className="field">
          <span className="field__label">Tipo</span>
          <select className="input" value={draft.level} onChange={e => setDraft({ ...draft, level: e.target.value })}>
            {BANNER_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Link (opcional, https://… ou /caminho)</span>
          <input className="input" value={draft.linkUrl} onChange={e => setDraft({ ...draft, linkUrl: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Texto do link</span>
          <input className="input" maxLength={30} placeholder="Saiba mais" value={draft.linkLabel} onChange={e => setDraft({ ...draft, linkLabel: e.target.value })} />
        </label>
      </div>
      {!linkOk && <p className="form-msg form-msg--error">O link precisa começar com https://, http:// ou /.</p>}

      <div className="form-grid">
        <label className="field">
          <span className="field__label">Mostrar a partir de (opcional)</span>
          <input className="input" type="date" value={draft.startsOn || ''} onChange={e => setDraft({ ...draft, startsOn: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Mostrar até (opcional)</span>
          <input className="input" type="date" value={draft.endsOn || ''} onChange={e => setDraft({ ...draft, endsOn: e.target.value })} />
        </label>
      </div>
      {!periodOk && <p className="form-msg form-msg--error">A data final não pode ser antes da inicial.</p>}

      <div className={`banner-preview banner-preview--${draft.level}`} aria-label="Pré-visualização">
        <span>
          {draft.message.trim() || 'Escreva a mensagem para ver a prévia.'}
          {draft.linkUrl.trim() && linkOk && <strong> {draft.linkLabel.trim() || 'Saiba mais'}</strong>}
        </span>
        <span aria-hidden="true">×</span>
      </div>

      <div className="actions-row">
        <button className="btn btn--primary btn--small" disabled={busy || !dirty || !valid} onClick={handleSave}>Salvar</button>
        <button className="btn btn--ghost btn--small" disabled={busy || !dirty} onClick={() => { setDraft(saved); setMsg(''); }}>Desfazer</button>
        <SectionMessage msg={msg} />
      </div>
    </div>
  );
}

function FlagsCard({ saved, adminId, onSaved }) {
  const [busyKey, setBusyKey] = useState('');
  const [msg, setMsg] = useState('');

  async function toggle(key, on) {
    setBusyKey(key);
    setMsg('');
    try {
      await saveSetting('flags', { ...saved, [key]: on }, adminId);
      setMsg('Salvo.');
      await onSaved();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusyKey('');
    }
  }

  return (
    <div className="card stack" style={{ gap: 6 }}>
      <h2 className="section-title">Recursos do app</h2>
      <p className="user-detail__meta" style={{ margin: '0 0 8px' }}>
        Desligue um recurso sem publicar uma nova versão do app. Vale na próxima leitura da configuração (até 5 minutos).
      </p>
      {KNOWN_FLAGS.map(f => {
        const on = saved[f.key] !== false;
        return (
          <div className="flag-row" key={f.key}>
            <div>
              <strong>{f.label}</strong>
              <div className="user-detail__meta">{f.hint}</div>
            </div>
            <label className="switch-row">
              <input type="checkbox" checked={on} disabled={busyKey === f.key} onChange={e => toggle(f.key, e.target.checked)} />
              <span>{on ? 'Ligado' : 'Desligado'}</span>
            </label>
          </div>
        );
      })}
      <SectionMessage msg={msg} />
    </div>
  );
}

function MovedCard({ saved, adminId, onSaved }) {
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const dirty = draft.enabled !== saved.enabled || draft.url !== saved.url;
  const urlOk = isValidMovedUrl(draft.url);
  const valid = urlOk || (!draft.enabled && !draft.url.trim());

  async function handleSave() {
    if (draft.enabled && !saved.enabled
      && !window.confirm('Ligar a mudança de endereço BLOQUEIA o app para quem abrir por qualquer endereço diferente do novo. Confirme que o endereço novo já está no ar. Continuar?')) return;
    setBusy(true);
    setMsg('');
    try {
      await saveSetting('moved', { enabled: draft.enabled, url: draft.url.trim() }, adminId);
      setMsg('Salvo.');
      await onSaved();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack" style={{ gap: 14, ...(saved.enabled ? { borderColor: 'var(--danger)' } : {}) }}>
      <div className="card-head" style={{ marginBottom: 0 }}>
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>
            Mudança de endereço
            <span className={`badge ${saved.enabled ? 'badge--danger' : 'badge--ok'}`}>{saved.enabled ? 'endereço antigo bloqueado' : 'desligado'}</span>
          </h2>
          <p className="user-detail__meta" style={{ margin: '4px 0 0' }}>
            Quando ligado, quem abrir o app por um endereço diferente do novo vê a tela "O EAFIT mudou de endereço" com um botão para o endereço abaixo.
            Quem já está no endereço novo não vê nada. Ligue só depois que o endereço novo estiver funcionando.
          </p>
        </div>
        <label className="switch-row">
          <input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />
          <span>Ligado</span>
        </label>
      </div>
      <label className="field">
        <span className="field__label">Endereço novo do app (https://…)</span>
        <input className="input" placeholder="https://eafit.com.br/app/" value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} />
      </label>
      {!valid && <p className="form-msg form-msg--error">Informe o endereço completo, começando com https://.</p>}
      <div className="actions-row">
        <button className={`btn btn--small ${draft.enabled ? 'btn--danger' : 'btn--primary'}`} disabled={busy || !dirty || !valid} onClick={handleSave}>Salvar</button>
        <button className="btn btn--ghost btn--small" disabled={busy || !dirty} onClick={() => { setDraft(saved); setMsg(''); }}>Desfazer</button>
        <SectionMessage msg={msg} />
      </div>
    </div>
  );
}

export default function AppSettings() {
  const { adminUser } = useAdminAuth();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setSettings(await fetchSettings());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <p className="form-msg form-msg--error">{error}</p>;
  if (!settings) return <Loading />;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Configurações do app</h1>
          <p className="page-subtitle">Controles que mudam o comportamento do app dos usuários sem publicar uma nova versão. Toda alteração fica registrada na Auditoria.</p>
        </div>
      </div>
      <MaintenanceCard key={`m-${JSON.stringify(settings.maintenance)}`} saved={settings.maintenance} adminId={adminUser?.id} onSaved={load} />
      <BannerCard key={`b-${settings.banner.version}-${settings.banner.enabled}`} saved={settings.banner} adminId={adminUser?.id} onSaved={load} />
      <FlagsCard saved={settings.flags} adminId={adminUser?.id} onSaved={load} />
      <MovedCard key={`mv-${JSON.stringify(settings.moved)}`} saved={settings.moved} adminId={adminUser?.id} onSaved={load} />
    </div>
  );
}
