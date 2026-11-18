import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmContext, normalizeConfirm } from '../context/confirmContext';
import { useDialogFocus } from '../lib/useDialogFocus';
import { reauthIsFresh, verifyMfaCode } from '../lib/reauth';

// Diálogo de confirmação único do painel, no lugar do window.confirm.
//  - danger: botão vermelho
//  - requireText: só habilita depois de digitar exatamente esse texto
//  - reauth: pede o código do autenticador (some se foi pedido há < 5 min)
export default function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);
  const [typed, setTyped] = useState('');
  const [code, setCode] = useState('');
  const [values, setValues] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const resolver = useRef(null);
  const formRef = useRef(null);
  useDialogFocus(formRef, !!req);

  const ask = useCallback(opts => new Promise(resolve => {
    resolver.current?.(false);
    resolver.current = resolve;
    const norm = normalizeConfirm(opts);
    setTyped(''); setCode(''); setError(''); setBusy(false);
    setValues(Object.fromEntries((norm.fields || []).map(f => [f.name, f.defaultValue || ''])));
    setReq({ ...normalizeConfirm(opts), needsCode: !!normalizeConfirm(opts).reauth && !reauthIsFresh() });
  }), []);

  const close = useCallback(result => {
    resolver.current?.(result);
    resolver.current = null;
    setReq(null);
  }, []);

  useEffect(() => {
    if (!req) return;
    const onKey = e => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [req, close]);

  async function submit(e) {
    e.preventDefault();
    if (req.needsCode) {
      setBusy(true);
      const r = await verifyMfaCode(code);
      setBusy(false);
      if (r.error) { setError(r.error); return; }
    }
    close(req.fields ? values : true);
  }

  const textOk = !req?.requireText || typed.trim() === req.requireText;
  const fieldsOk = !req?.fields || req.fields.every(f => !f.required || (values[f.name] || '').trim());
  const codeOk = !req?.needsCode || code.replace(/\s/g, '').length === 6;

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {req && (
        <div className="idle-warning" onMouseDown={e => { if (e.target === e.currentTarget) close(false); }}>
          <form ref={formRef} className="idle-warning__box" role="alertdialog" aria-modal="true"
            aria-labelledby="confirm-title" aria-describedby="confirm-msg" onSubmit={submit}>
            <h2 id="confirm-title" className="section-title">{req.title || 'Confirmar'}</h2>
            {req.message && <p id="confirm-msg" style={{ whiteSpace: 'pre-line' }}>{req.message}</p>}
            {req.fields?.map((f, i) => {
              const props = {
                value: values[f.name] ?? '', placeholder: f.placeholder, readOnly: f.readOnly,
                autoFocus: i === 0 && !req.requireText,
                onFocus: f.readOnly ? e => e.target.select() : undefined,
                onChange: e => setValues(v => ({ ...v, [f.name]: e.target.value })),
              };
              return (
                <label key={f.name} className="form-field">
                  <span>{f.label}</span>
                  {f.multiline ? <textarea rows={4} {...props} /> : <input autoComplete="off" {...props} />}
                </label>
              );
            })}
            {req.requireText && (
              <label className="form-field">
                <span>Digite <strong>{req.requireText}</strong> para confirmar</span>
                <input value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" autoFocus />
              </label>
            )}
            {req.needsCode && (
              <label className="form-field">
                <span>Código do aplicativo autenticador (6 números)</span>
                <input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric"
                  autoComplete="one-time-code" maxLength={7} autoFocus={!req.requireText} />
              </label>
            )}
            {error && <p className="form-msg form-msg--error" role="alert">{error}</p>}
            <div className="actions-row">
              <button type="submit" className={`btn ${req.danger ? 'btn--danger' : 'btn--primary'}`}
                disabled={!textOk || !fieldsOk || !codeOk || busy}
                autoFocus={!req.requireText && !req.needsCode && !req.fields}>
                {busy ? 'Conferindo…' : (req.confirmLabel || 'Confirmar')}
              </button>
              <button type="button" className="btn" onClick={() => close(false)} disabled={busy}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
