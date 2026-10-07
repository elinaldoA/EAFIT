import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../lib/modalRoot';
import { TUTORIAL_EVENT, hasSeenTutorial, markTutorialSeen, stepsFor } from '../lib/tutorial';

import { t } from '../lib/i18n';
const PAD = 6;

// Tutorial guiado: abre sozinho na primeira vez (por usuário e por modo) e
// pode ser reaberto com startTutorial(). Navega pelas abas e destaca o
// elemento do passo quando ele existe na tela.
export default function Tutorial({ role, userId, onNavigate }) {
  const steps = stepsFor(role);
  const [index, setIndex] = useState(null); // null = fechado
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!userId) return undefined;
    let timer;
    if (!hasSeenTutorial(role, userId)) timer = setTimeout(() => setIndex(0), 700);
    const reopen = () => setIndex(0);
    window.addEventListener(TUTORIAL_EVENT, reopen);
    return () => { clearTimeout(timer); window.removeEventListener(TUTORIAL_EVENT, reopen); };
  }, [role, userId]);

  const open = index !== null;
  const step = open ? steps[index] : null;

  const close = useCallback(() => {
    markTutorialSeen(role, userId);
    setIndex(null);
    setRect(null);
  }, [role, userId]);

  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [open]);

  useEffect(() => {
    if (step?.tab) onNavigate(step.tab);
  }, [step, onNavigate]);

  // Mede o alvo depois da troca de aba (as páginas carregam sob demanda).
  useLayoutEffect(() => {
    if (!step) return undefined;
    setRect(null);
    if (!step.target) return undefined;
    let tries = 0;
    let timer;
    function measure() {
      const el = document.querySelector(step.target);
      if (el) {
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else if (tries++ < 8) {
        timer = setTimeout(measure, 150);
      }
    }
    timer = setTimeout(measure, 120);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(timer); window.removeEventListener('resize', measure); };
  }, [step]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape') close(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!step) return null;

  const last = index === steps.length - 1;
  const cardAtTop = rect ? rect.top + rect.height / 2 > window.innerHeight / 2 : false;
  const cardClass = `tutorial__card${rect ? (cardAtTop ? ' tutorial__card--top' : ' tutorial__card--bottom') : ''}`;

  return createPortal(
    <div className="tutorial" role="dialog" aria-modal="true" aria-label={t('Tutorial do app')}>
      {rect
        ? <div className="tutorial__spot" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
        : <div className="tutorial__dim" />}
      <div className={cardClass}>
        <div className="tutorial__icon" aria-hidden="true">{step.icon}</div>
        <div className="tutorial__title">{step.title}</div>
        <p className="tutorial__text">{step.text}</p>
        <div className="tutorial__dots" aria-hidden="true">
          {steps.map((_, i) => <span key={i} className={i === index ? 'tutorial__dot tutorial__dot--on' : 'tutorial__dot'} />)}
        </div>
        <div className="tutorial__actions">
          {last
            ? <span />
            : <button type="button" className="btn btn--ghost btn--sm" onClick={close}>{t('Pular')}</button>}
          <div className="tutorial__nav">
            {index > 0 && <button type="button" className="btn btn--outline btn--sm" onClick={() => setIndex(index - 1)}>{t('Voltar')}</button>}
            <button type="button" className="btn btn--primary btn--sm" onClick={() => (last ? close() : setIndex(index + 1))}>
              {last ? t('Concluir') : t('Próximo')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    getModalRoot(),
  );
}
