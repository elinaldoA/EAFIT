import { useEffect, useId, useRef, useState } from 'react';
import { MESSAGE_VARS, PUSH_LIMITS, SAMPLE_VARS, fetchUserVars, insertAt, renderMessage, unknownVars, usesVars } from '../lib/messageVars';

const EMOJIS = ['💪', '🔥', '🏆', '🎯', '⏰', '💧', '🎉', '👀'];
const TABS = [
  { key: 'push', label: 'Push' },
  { key: 'caixa', label: 'Caixa do app' },
  { key: 'email', label: 'E-mail' },
];

function Counter({ value, max }) {
  const n = value.length;
  return <span className={`msg-editor__count${n > max ? ' msg-editor__count--over' : ''}`}>{n}/{max}</span>;
}

// Título + mensagem com variáveis e prévia (Comunicação → Enviar notificação).
// users: lista para escolher de quem são os valores da prévia.
export default function MessageEditor({ title, body, onTitle, onBody, users = [], email = false }) {
  const id = useId();
  const titleRef = useRef(null);
  const bodyRef = useRef(null);
  const [focus, setFocus] = useState('body');
  const [tab, setTab] = useState('push');
  const [who, setWho] = useState('');
  const [vars, setVars] = useState(SAMPLE_VARS);
  const [varsError, setVarsError] = useState('');

  useEffect(() => {
    if (!who) { setVars(SAMPLE_VARS); setVarsError(''); return; }
    let active = true;
    fetchUserVars(who).then(v => { if (active) { setVars(v); setVarsError(''); } })
      .catch(err => { if (active) setVarsError(err.message); });
    return () => { active = false; };
  }, [who]);

  function insert(text) {
    const ref = focus === 'title' ? titleRef : bodyRef;
    const value = focus === 'title' ? title : body;
    const el = ref.current;
    const r = insertAt(value, el?.selectionStart, el?.selectionEnd, text);
    (focus === 'title' ? onTitle : onBody)(r.value);
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(r.caret, r.caret); } });
  }

  const pTitle = renderMessage(title, vars) || 'Título';
  const pBody = renderMessage(body, vars) || 'Mensagem';
  const unknown = unknownVars(title, body);

  return (
    <div className="msg-editor">
      <div className="stack" style={{ gap: 10 }}>
        <div className="field">
          <div><label className="field__label" htmlFor={`${id}-t`}>Título</label><Counter value={title} max={PUSH_LIMITS.title} /></div>
          <input id={`${id}-t`} ref={titleRef} className="input" required value={title} onFocus={() => setFocus('title')} onChange={e => onTitle(e.target.value)} />
        </div>
        <div className="field">
          <div><label className="field__label" htmlFor={`${id}-b`}>Mensagem</label><Counter value={body} max={PUSH_LIMITS.body} /></div>
          <textarea id={`${id}-b`} ref={bodyRef} className="input" rows={3} required value={body} onFocus={() => setFocus('body')} onChange={e => onBody(e.target.value)} />
        </div>
        <div className="actions-row" role="group" aria-label="Inserir variável">
          <span className="field__label">Inserir no {focus === 'title' ? 'título' : 'texto'}:</span>
          {MESSAGE_VARS.map(v => (
            <button key={v.key} type="button" className="btn btn--ghost btn--small" title={v.hint} onClick={() => insert(`{${v.key}}`)}>{`{${v.label}}`}</button>
          ))}
          {EMOJIS.map(e => <button key={e} type="button" className="btn btn--ghost btn--small" aria-label={`Inserir ${e}`} onClick={() => insert(e)}>{e}</button>)}
        </div>
        {unknown.length > 0 && (
          <p className="form-msg form-msg--error">
            {unknown.map(u => `{${u}}`).join(', ')} não é variável: some do texto no envio. Use {MESSAGE_VARS.map(v => `{${v.key}}`).join(', ')}.
          </p>
        )}
        {usesVars(title, body) && (
          <p className="card-note">Cada pessoa recebe com os próprios valores. Variável sem valor (ex.: quem nunca treinou) some do texto.</p>
        )}
      </div>

      <div className="msg-preview">
        <div className="actions-row">
          <div className="seg" role="group" aria-label="Prévia">
            {TABS.map(t => (
              <button key={t.key} type="button" aria-pressed={tab === t.key} className={`seg__btn${tab === t.key ? ' seg__btn--active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>
          <select className="input input--sm" aria-label="Prévia como" value={who} onChange={e => setWho(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="">Exemplo (Ana, 6 treinos, 3 dias)</option>
            {users.slice(0, 500).map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
          </select>
        </div>
        {varsError && <p className="form-msg form-msg--error">{varsError}</p>}

        {tab === 'push' && (
          <div className="msg-preview__push" data-testid="preview-push">
            <div className="msg-preview__app">EAFIT · agora</div>
            <strong className="msg-preview__clip">{pTitle}</strong>
            <div className="msg-preview__clip2">{pBody}</div>
          </div>
        )}
        {tab === 'caixa' && (
          <div className="msg-preview__inbox" data-testid="preview-inbox">
            <div className="msg-preview__dot" aria-hidden="true" />
            <div><strong>{pTitle}</strong><div>{pBody}</div><div className="msg-preview__app">agora</div></div>
          </div>
        )}
        {tab === 'email' && (
          <div className="msg-preview__email" data-testid="preview-email">
            <div className="msg-preview__email-head">Novidades do EAFIT</div>
            <h3>{pTitle}</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{pBody}</p>
            <span className="msg-preview__btn">Abrir o app</span>
            <div className="msg-preview__app">{email ? 'Vai também por e-mail neste envio.' : 'E-mail só sai se marcar "Enviar também por e-mail".'}</div>
          </div>
        )}
      </div>
    </div>
  );
}
