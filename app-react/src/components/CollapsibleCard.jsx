import { useId, useState } from 'react';

// Card com cabeçalho clicável: fechado mostra só título + resumo de uma linha
// (ex.: "80kg · 178cm · IMC 25,2"), aberto mostra o formulário.
export default function CollapsibleCard({ icon, title, summary, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <div className={`collapse${open ? ' collapse--open' : ''}`}>
      <button
        type="button" className="collapse__head"
        aria-expanded={open} aria-controls={bodyId}
        onClick={() => setOpen(o => !o)}
      >
        {icon && <span className="collapse__icon" aria-hidden="true">{icon}</span>}
        <span className="collapse__text">
          <span className="collapse__title">{title}</span>
          {summary && <span className="collapse__summary">{summary}</span>}
        </span>
        <span className="collapse__chevron" aria-hidden="true">›</span>
      </button>
      {open && <div className="collapse__body" id={bodyId}>{children}</div>}
    </div>
  );
}
