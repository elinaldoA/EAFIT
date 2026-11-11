import { STEP_CHOICES, DELOAD_CHOICES, stepLabel } from '../lib/periodization';

import { t } from '../lib/i18n';
// Periodização do plano: meta semanal de carga e semana leve programada.
// step: '' | número (kg por semana); deloadEvery: '' | número (a cada N semanas).
// Usado no editor do aluno (PlanEditorModal) e na montagem do personal.
export default function PlanProgressionFields({ step, deloadEvery, onChange }) {
  return (
    <div className="plan-row__successors">
      <label className="plan-row__successor-field">
        {t('📈 Meta semanal de carga')}
        <select
          className="input input--sm" value={step ?? ''}
          onChange={e => onChange({ step: e.target.value === '' ? null : Number(e.target.value), deloadEvery: deloadEvery ?? null })}
        >
          <option value="">{t('Nenhuma')}</option>
          {STEP_CHOICES.map(s => <option key={s} value={s}>{stepLabel(s)}</option>)}
        </select>
      </label>
      <label className="plan-row__successor-field">
        {t('🌿 Semana leve (deload)')}
        <select
          className="input input--sm" value={deloadEvery ?? ''}
          onChange={e => onChange({ step: step ?? null, deloadEvery: e.target.value === '' ? null : Number(e.target.value) })}
        >
          <option value="">{t('Nenhuma')}</option>
          {DELOAD_CHOICES.map(n => <option key={n} value={n}>{t('A cada {n} semanas', { n })}</option>)}
        </select>
      </label>
    </div>
  );
}
