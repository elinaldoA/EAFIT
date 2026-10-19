import { GROUP_LETTERS } from '../lib/supersets';

import { t } from '../lib/i18n';
// Campos de bi-set/circuito e aquecimento de um exercício do plano, usados no
// editor do aluno (PlanEditorModal) e na montagem do personal (PlanBuilder).
// grupo: '' | 'A'..'F'; aquecimento: '' (automático) | 0..3.
// onChange recebe só o campo alterado, já no formato do banco (null = vazio).
export default function ExerciseExtras({ grupo, aquecimento, onChange }) {
  const warm = aquecimento === null || aquecimento === undefined ? '' : String(aquecimento);
  return (
    <div className="plan-ex-row__extras">
      <label className="plan-ex-row__extra">
        <span>{t('🔗 Bi-set')}</span>
        <select
          className="input input--sm" value={grupo || ''}
          title={t('Exercícios seguidos com a mesma letra são feitos em sequência, sem descanso entre eles')}
          onChange={e => onChange({ grupo: e.target.value || null })}
        >
          <option value="">{t('Não')}</option>
          {GROUP_LETTERS.map(l => <option key={l} value={l}>{t('Grupo {l}', { l })}</option>)}
        </select>
      </label>
      <label className="plan-ex-row__extra">
        <span>{t('🔥 Aquecimento')}</span>
        <select
          className="input input--sm" value={warm}
          onChange={e => onChange({ aquecimento: e.target.value === '' ? null : Number(e.target.value) })}
        >
          <option value="">{t('Automático')}</option>
          <option value="0">{t('Nenhum')}</option>
          <option value="1">{t('1 série')}</option>
          <option value="2">{t('2 séries')}</option>
          <option value="3">{t('3 séries')}</option>
        </select>
      </label>
    </div>
  );
}
