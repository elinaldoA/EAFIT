import { useId, useState } from 'react';

// Campo de senha com botão de mostrar/ocultar — no celular, sem ver o que foi
// digitado, errar a senha no cadastro é o motivo nº 1 de "não consigo entrar".
export default function PasswordInput({ label, value, onChange, autoComplete, autoFocus, minLength, hint }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <div className="password-input">
        <input
          id={id}
          className="input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          minLength={minLength}
          required
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          className="password-input__toggle"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {hint && <p className="field__hint" id={`${id}-hint`}>{hint}</p>}
    </div>
  );
}
