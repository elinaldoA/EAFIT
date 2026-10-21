import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/supabase';
import { useAdminAuth } from '../context/useAdminAuth';
import { useAdminAccess } from '../context/useAdminAccess';
import { useTheme } from '../context/useTheme';
import { ROLE_LABELS, AREA_LABELS, effectiveAreas } from '../lib/adminAccess';
import { ACTION_LABEL } from '../lib/auditActions';
import { fetchMyPrefs, savePrefs } from '../lib/digest';

const MIN_PASSWORD = 8;

const fmtDateTime = v => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const fmtDate = v => (v ? new Date(v).toLocaleDateString('pt-BR') : '—');

function initials(name, email) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`;
  return (parts[0]?.[0] || email?.[0] || '?');
}

// Fator do autenticador (verificação em duas etapas). Sem ele o admin nem
// chegaria aqui, mas a data e o nome ajudam a saber qual celular está ligado.
async function fetchFactor() {
  const { data, error } = await db.auth.mfa.listFactors();
  if (error) throw error;
  return data.totp.find(f => f.status === 'verified') || null;
}

// Últimas ações deste admin na auditoria (a busca por e-mail também traz as
// ações em que ele foi o alvo, então filtra pelo autor).
async function fetchMyActions(email) {
  const { data, error } = await db.rpc('admin_search_audit_log', { page_size: 20, page_offset: 0, p_action: null, p_search: email });
  if (error) throw error;
  return (data || []).filter(r => r.admin_email === email).slice(0, 5);
}

export default function Profile() {
  const { adminUser, updateProfile, updatePassword, logout } = useAdminAuth();
  const access = useAdminAccess();
  const md = adminUser?.user_metadata || {};
  const email = adminUser?.email || '';

  const [nome, setNome] = useState(md.nome || '');
  const [sobrenome, setSobrenome] = useState(md.sobrenome || '');
  const [profileMsg, setProfileMsg] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const fullName = [md.nome, md.sobrenome].filter(Boolean).join(' ');
  const role = access.role;
  const areas = role ? effectiveAreas(role, access.extraAreas) : [];

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg('');
    const fields = sobrenome.trim() || md.sobrenome ? { nome, sobrenome } : { nome };
    const { error } = await updateProfile(fields);
    setProfileMsg(error ? `Erro: ${error}` : 'Perfil atualizado.');
    setSavingProfile(false);
  }

  return (
    <div className="stack">
      <section className="card profile-hero">
        <div className="profile-hero__avatar" aria-hidden="true">{initials(fullName, email)}</div>
        <div className="profile-hero__id">
          <h1 className="page-title">{fullName || 'Meu perfil'}</h1>
          <p className="user-detail__meta">{email}</p>
          <div className="profile-hero__badges">
            {role && <span className="badge badge--admin">{ROLE_LABELS[role] || role}</span>}
            <span className="badge badge--ok">Verificação em duas etapas ativa</span>
          </div>
        </div>
        <dl className="profile-hero__facts">
          <div><dt>Conta criada em</dt><dd>{fmtDate(adminUser?.created_at)}</dd></div>
          <div><dt>Último acesso</dt><dd>{fmtDateTime(adminUser?.last_sign_in_at)}</dd></div>
        </dl>
        <button type="button" className="btn btn--ghost profile-hero__logout" onClick={logout}>Sair</button>
      </section>

      <div className="two-col">
        <div className="stack">
          <form className="card stack" onSubmit={handleSaveProfile}>
            <div>
              <h2 className="section-title" style={{ margin: 0 }}>Dados pessoais</h2>
              <p className="card-note" style={{ margin: '4px 0 0' }}>Seu nome aparece no topo do painel e na auditoria.</p>
            </div>
            <div className="form-grid">
              <label className="field">
                <span className="field__label">Nome</span>
                <input className="input" value={nome} onChange={e => setNome(e.target.value)} />
              </label>
              <label className="field">
                <span className="field__label">Sobrenome</span>
                <input className="input" value={sobrenome} onChange={e => setSobrenome(e.target.value)} />
              </label>
              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span className="field__label">E-mail</span>
                <input className="input" value={email} disabled />
              </label>
              <div className="form-grid__actions">
                <span className={`form-msg ${profileMsg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{profileMsg}</span>
                <button className="btn btn--primary" type="submit" disabled={savingProfile}>Salvar perfil</button>
              </div>
            </div>
          </form>

          <SecurityCard updatePassword={updatePassword} />
        </div>

        <div className="stack">
          <AccessCard role={role} areas={areas} hiddenCount={access.hiddenScreens?.length || 0} />
          <EmailPrefsCard adminId={adminUser?.id} />
          <PreferencesCard />
        </div>
      </div>

      <RecentActionsCard email={email} />
    </div>
  );
}

function SecurityCard({ updatePassword }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [factor, setFactor] = useState(undefined);
  const [othersMsg, setOthersMsg] = useState('');

  useEffect(() => {
    let active = true;
    fetchFactor().then(f => { if (active) setFactor(f); }).catch(() => { if (active) setFactor(null); });
    return () => { active = false; };
  }, []);

  const longEnough = password.length >= MIN_PASSWORD;
  const matches = password.length > 0 && password === confirm;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password) return;
    if (confirm && !matches) { setMsg('Erro: as senhas não conferem.'); return; }
    setBusy(true);
    setMsg('');
    const { error } = await updatePassword(password);
    setMsg(error ? `Erro: ${error}` : 'Senha atualizada.');
    if (!error) { setPassword(''); setConfirm(''); }
    setBusy(false);
  }

  async function handleSignOutOthers() {
    if (!window.confirm('Encerrar o acesso ao painel em todos os outros navegadores e celulares? Este continua conectado.')) return;
    setOthersMsg('');
    try {
      const { error } = await db.auth.signOut({ scope: 'others' });
      if (error) throw error;
      setOthersMsg('Pronto: os outros dispositivos foram desconectados.');
    } catch (err) {
      setOthersMsg(`Erro: ${err.message}`);
    }
  }

  return (
    <section className="card stack">
      <div>
        <h2 className="section-title" style={{ margin: 0 }}>Segurança</h2>
        <p className="card-note" style={{ margin: '4px 0 0' }}>Use uma senha só sua, que você não usa em outros sites.</p>
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Nova senha</span>
          <input className="input" type="password" autoComplete="new-password" placeholder={`Mínimo ${MIN_PASSWORD} caracteres`}
            value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Confirmar nova senha</span>
          <input className="input" type="password" autoComplete="new-password"
            value={confirm} onChange={e => setConfirm(e.target.value)} />
        </label>
        {password && (
          <ul className="profile-checks" style={{ gridColumn: '1 / -1' }}>
            <li className={longEnough ? 'is-ok' : ''}>{longEnough ? '✓' : '•'} Pelo menos {MIN_PASSWORD} caracteres</li>
            <li className={matches ? 'is-ok' : ''}>{matches ? '✓' : '•'} As duas senhas iguais</li>
          </ul>
        )}
        <div className="form-grid__actions">
          <span className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</span>
          <button className="btn btn--primary" type="submit" disabled={busy || !password}>Atualizar senha</button>
        </div>
      </form>

      <div className="profile-row">
        <div>
          <strong>Verificação em duas etapas</strong>
          <p className="card-note" style={{ margin: '2px 0 0' }}>
            {factor
              ? `Autenticador ligado em ${fmtDate(factor.created_at)}. O código é pedido a cada login.`
              : 'O código do autenticador é pedido a cada login.'}{' '}
            Trocou de celular? Peça ao responsável técnico para reiniciar o seu autenticador.
          </p>
        </div>
        <span className="badge badge--ok">ativa</span>
      </div>

      <div className="profile-row">
        <div>
          <strong>Outros dispositivos</strong>
          <p className="card-note" style={{ margin: '2px 0 0' }}>
            Esqueceu o painel aberto em outro computador? Desconecte todos, menos este.
          </p>
          {othersMsg && <p className={`form-msg ${othersMsg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{othersMsg}</p>}
        </div>
        <button type="button" className="btn btn--small" onClick={handleSignOutOthers}>Sair dos outros dispositivos</button>
      </div>
    </section>
  );
}

function AccessCard({ role, areas, hiddenCount }) {
  return (
    <section className="card stack">
      <div>
        <h2 className="section-title" style={{ margin: 0 }}>Meu acesso</h2>
        <p className="card-note" style={{ margin: '4px 0 0' }}>
          Todos os admins veem os dados; o papel define o que você pode alterar.
        </p>
      </div>
      {!role ? (
        <p className="card-note" style={{ margin: 0 }}>Não foi possível carregar suas permissões agora.</p>
      ) : (
        <>
          <div className="profile-row">
            <span className="field__label">Papel</span>
            <strong>{ROLE_LABELS[role] || role}</strong>
          </div>
          <div>
            <span className="field__label">Pode alterar</span>
            {areas.length ? (
              <ul className="profile-areas">
                {areas.map(a => <li key={a}>{AREA_LABELS[a] || a}</li>)}
              </ul>
            ) : <p className="card-note" style={{ margin: '4px 0 0' }}>Nada: seu acesso é só de leitura.</p>}
          </div>
          {hiddenCount > 0 && (
            <p className="card-note" style={{ margin: 0 }}>{hiddenCount} tela(s) estão ocultas no seu menu.</p>
          )}
          {role === 'superadmin' && <Link className="card-note" style={{ margin: 0 }} to="/admins">Gerenciar administradores →</Link>}
        </>
      )}
    </section>
  );
}

function EmailPrefsCard({ adminId }) {
  const [prefs, setPrefs] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!adminId) return undefined;
    let active = true;
    fetchMyPrefs(adminId).then(p => { if (active) setPrefs(p); }).catch(() => {});
    return () => { active = false; };
  }, [adminId]);

  if (!prefs) return null;

  async function toggle(key) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setMsg('');
    try {
      await savePrefs(adminId, next);
      setMsg('Salvo.');
    } catch (err) {
      setPrefs(prefs);
      setMsg(`Erro: ${err.message}`);
    }
  }

  return (
    <section className="card stack">
      <div>
        <h2 className="section-title" style={{ margin: 0 }}>E-mails da equipe</h2>
        <p className="card-note" style={{ margin: '4px 0 0' }}>
          Vale só para você. Os limites dos alertas ficam em <Link to="/relatorios">Relatórios e alertas</Link>.
        </p>
      </div>
      <label className="switch-row">
        <input type="checkbox" checked={prefs.weeklyDigest} onChange={() => toggle('weeklyDigest')} />
        Relatório semanal (segunda às 8h)
      </label>
      <label className="switch-row">
        <input type="checkbox" checked={prefs.alerts} onChange={() => toggle('alerts')} />
        Alertas de problemas (e-mail e push)
      </label>
      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
    </section>
  );
}

function PreferencesCard() {
  const themeCtx = useTheme();
  if (!themeCtx) return null;
  const { theme, toggleTheme } = themeCtx;
  return (
    <section className="card stack">
      <div>
        <h2 className="section-title" style={{ margin: 0 }}>Preferências do painel</h2>
        <p className="card-note" style={{ margin: '4px 0 0' }}>Ficam salvas neste navegador.</p>
      </div>
      <div className="profile-row">
        <span className="field__label">Tema</span>
        <div className="seg" role="group" aria-label="Tema">
          {[['dark', 'Escuro'], ['light', 'Claro']].map(([key, label]) => (
            <button key={key} type="button" aria-pressed={theme === key}
              className={`seg__btn${theme === key ? ' seg__btn--active' : ''}`}
              onClick={() => { if (theme !== key) toggleTheme(); }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function RecentActionsCard({ email }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!email) return undefined;
    let active = true;
    fetchMyActions(email).then(r => { if (active) setRows(r); }).catch(() => {});
    return () => { active = false; };
  }, [email]);

  if (!rows) return null;

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="section-title" style={{ margin: 0 }}>Minhas ações recentes</h2>
        <Link className="btn btn--ghost btn--small" to="/auditoria">Ver tudo na Auditoria</Link>
      </div>
      {rows.length === 0 ? (
        <p className="card-note" style={{ margin: 0 }}>Nenhuma ação sua registrada ainda.</p>
      ) : (
        <ul className="profile-timeline">
          {rows.map(r => (
            <li key={r.id}>
              <span className="profile-timeline__when">{fmtDateTime(r.created_at)}</span>
              <span>
                <strong>{ACTION_LABEL[r.action] || r.action}</strong>
                {r.target_email && <span className="user-detail__meta"> · {r.target_email}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
