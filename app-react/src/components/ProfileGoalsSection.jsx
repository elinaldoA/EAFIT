import { DEFAULT_WATER_GOAL, DEFAULT_WEEKLY_GOAL } from '../data/treinoData';

export function WeeklyGoalSection({ weeklyGoal, setWeeklyGoal, onSave }) {
  return (
    <div className="profile-section">
      <div className="profile-section__title">Meta Semanal de Treinos</div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="weeklyGoal">Treinos por semana</label>
        <input
          type="number" id="weeklyGoal" className="input input--sm" placeholder={String(DEFAULT_WEEKLY_GOAL)}
          min="1" max="7" step="1" value={weeklyGoal} onChange={e => setWeeklyGoal(e.target.value)}
        />
      </div>
      <button className="btn btn--primary btn--full" onClick={onSave}>Salvar meta semanal</button>
    </div>
  );
}

export function MacrosSection({ macroAgua, setMacroAgua, onSave }) {
  return (
    <div className="profile-section">
      <div className="profile-section__title">Meta de Água</div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="macroAgua">Meta de água (L)</label>
        <input
          type="number" id="macroAgua" className="input input--sm" placeholder={String(DEFAULT_WATER_GOAL)}
          min="0" step="0.5" value={macroAgua} onChange={e => setMacroAgua(e.target.value)}
        />
      </div>
      <button className="btn btn--primary btn--full" onClick={onSave}>Salvar meta de água</button>
    </div>
  );
}
