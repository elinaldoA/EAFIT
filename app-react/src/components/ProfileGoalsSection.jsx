import { DEFAULT_WATER_GOAL, DEFAULT_WEEKLY_GOAL } from '../data/treinoData';

import { t } from '../lib/i18n';
export function WeeklyGoalSection({ weeklyGoal, setWeeklyGoal, onSave }) {
  return (
    <>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="weeklyGoal">{t('Treinos por semana')}</label>
        <input
          type="number" id="weeklyGoal" className="input input--sm" placeholder={String(DEFAULT_WEEKLY_GOAL)}
          min="1" max="7" step="1" value={weeklyGoal} onChange={e => setWeeklyGoal(e.target.value)}
        />
      </div>
      <button className="btn btn--primary btn--full" onClick={onSave}>{t('Salvar meta semanal')}</button>
    </>
  );
}

// suggestedGoal: meta calculada pelo peso (getWaterGoalLiters sem valor
// próprio salvo) — é a que vale enquanto o campo estiver vazio, então é ela
// que aparece como placeholder, não o padrão fixo de 3,5 L.
export function MacrosSection({ macroAgua, setMacroAgua, onSave, suggestedGoal = DEFAULT_WATER_GOAL }) {
  return (
    <>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="macroAgua">{t('Meta de água (L)')}</label>
        <input
          type="number" id="macroAgua" className="input input--sm" placeholder={String(suggestedGoal)}
          min="0" step="0.5" value={macroAgua} onChange={e => setMacroAgua(e.target.value)}
          aria-describedby="macroAguaHint"
        />
        <p className="profile-field__hint" id="macroAguaHint">
          {t('Deixe em branco para usar {v1} L, calculado pelo seu peso (35 ml/kg).', { v1: String(suggestedGoal).replace('.', ',') })}
        </p>
      </div>
      <button className="btn btn--primary btn--full" onClick={onSave}>{t('Salvar meta de água')}</button>
    </>
  );
}
