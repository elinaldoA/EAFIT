import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../lib/modalRoot';
import { useBackToClose } from '../hooks/useBackToClose';
import { DURATION_CHOICES, buildPlanPayload, draftFromPlan } from '../lib/trainerPlan';
import { LEVELS, saveProgram, friendlyInfluencerError } from '../lib/influencers';
import PlanDaysEditor, { DayChips } from './PlanDaysEditor';

import { t } from '../lib/i18n';
// Montagem de um programa do influenciador: nome, descrição, nível, duração e
// os dias (o mesmo editor do personal). Salvar guarda o rascunho; ir ao ar
// depende de "Enviar para revisão" e da aprovação da equipe (ProfileInfluencerSection).
// program: o item de my_influencer().programs, ou null para um novo.
export default function InfluencerProgramEditor({ program, onClose, onSaved }) {
  useBackToClose(onClose);
  const source = program?.draft || null;
  const [draft, setDraft] = useState(() => ({
    ...draftFromPlan(source ? { name: source.name, duration_weeks: source.weeks, days: source.days } : null),
    description: source?.description || '',
    level: source?.level || 'iniciante',
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  async function handleSave() {
    const payload = buildPlanPayload(draft);
    if (!payload.ok) { setError(payload.error); return; }
    const description = String(draft.description || '').trim();
    if (description.length > 500) { setError(t('A descrição pode ter até 500 caracteres.')); return; }
    setSaving(true); setError('');
    try {
      const id = await saveProgram(program?.id, {
        name: payload.name, description, level: draft.level, weeks: payload.weeks, days: payload.days,
      });
      onSaved(id);
    } catch (err) {
      setError(friendlyInfluencerError(err));
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="plan-modal" role="dialog" aria-modal="true" aria-labelledby="infProgTitle">
      <div className="plan-modal__backdrop" onClick={onClose} />
      <div className="plan-modal__panel">
        <div className="plan-modal__header">
          <h2 className="plan-modal__title" id="infProgTitle">{program ? t('Editar programa') : t('Novo programa')}</h2>
          <button type="button" className="plan-modal__close" aria-label={t('Fechar')} onClick={onClose}>✕</button>
        </div>
        <div className="plan-modal__body inf-editor">
          {program?.live && (
            <p className="inf-note">{t('A versão que está no ar continua valendo para os seguidores até a equipe aprovar esta edição.')}</p>
          )}
          <div className="dash-card">
            <div className="profile-field">
              <label className="profile-field__label" htmlFor="infProgName">{t('Nome do programa')}</label>
              <input id="infProgName" className="input input--sm" maxLength={60} placeholder={t('Ex: Glúteo em 4 semanas')}
                value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            </div>
            <div className="profile-field">
              <label className="profile-field__label" htmlFor="infProgDesc">{t('Descrição')}</label>
              <textarea id="infProgDesc" className="input input--sm inf-editor__desc" maxLength={500} rows={3}
                placeholder={t('Para quem é, o que trabalha e o que esperar')}
                value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
            </div>
            <div className="inf-editor__row">
              <div className="profile-field">
                <label className="profile-field__label" htmlFor="infProgLevel">{t('Nível')}</label>
                <select id="infProgLevel" className="input input--sm" value={draft.level} onChange={e => setDraft(d => ({ ...d, level: e.target.value }))}>
                  {LEVELS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
              </div>
              <div className="profile-field">
                <label className="profile-field__label" htmlFor="infProgWeeks">{t('Duração')}</label>
                <select id="infProgWeeks" className="input input--sm" value={draft.weeks} onChange={e => setDraft(d => ({ ...d, weeks: e.target.value }))}>
                  {DURATION_CHOICES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <DayChips draft={draft} setDraft={setDraft} />
          </div>

          <PlanDaysEditor draft={draft} setDraft={setDraft} />

          {error && <p className="profile-field__hint" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
          <button type="button" className="btn btn--primary btn--full" disabled={saving} onClick={handleSave}>
            {saving ? t('Salvando…') : t('💾 Salvar rascunho')}
          </button>
        </div>
      </div>
    </div>,
    getModalRoot()
  );
}
