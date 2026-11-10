import { useState } from 'react';
import { buildRunProgram, SESSION_TITLE, describeSession } from './program';

import { t } from '../../lib/i18n';
const ICON = { leve: '🟢', longao: '🔵', intervalado: '🔴', ritmo: '🟠', corre_caminha: '🚶', prova: '🏁', cross: '🚴', descanso: '·', livre: '🟢' };
const WEEKDAYS = [t('Seg'), t('Ter'), t('Qua'), t('Qui'), t('Sex'), t('Sáb'), t('Dom')];

// Programa inteiro, semana a semana: o que tem em cada dia, a semana de hoje
// em destaque e a legenda dos símbolos. Fechado por padrão.
export default function ProgramCalendar({ program, currentWeek }) {
  const [open, setOpen] = useState(false);
  const weeks = buildRunProgram(program).weeks;
  if (!weeks.length) return null;
  const used = [...new Set(weeks.flatMap(w => w.days.map(d => d.type)))].filter(type => type !== 'descanso');
  return (
    <div className="run-calendar">
      <button type="button" className="btn btn--ghost btn--sm" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {open ? t('Esconder o programa completo') : t('📆 Ver o programa completo')}
      </button>
      {open && (
        <div className="dash-card">
          <div className="run-calendar__head" aria-hidden="true">
            <span />
            {WEEKDAYS.map(d => <span key={d}>{d}</span>)}
          </div>
          <ol className="run-calendar__weeks">
            {weeks.map(w => (
              <li key={w.week} className={`run-calendar__week${w.week === currentWeek ? ' run-calendar__week--now' : ''}`} aria-current={w.week === currentWeek ? 'true' : undefined}>
                <span className="run-calendar__num">{w.week}</span>
                {w.days.map((d, i) => (
                  <span key={i} className="run-calendar__day" role="img" aria-label={`${WEEKDAYS[i]}: ${SESSION_TITLE[d.type]}. ${describeSession(d)}`} title={describeSession(d)}>
                    {ICON[d.type] || '·'}
                  </span>
                ))}
              </li>
            ))}
          </ol>
          <p className="profile-field__hint">
            {used.map(type => `${ICON[type]} ${SESSION_TITLE[type]}`).join(' · ')}
          </p>
        </div>
      )}
    </div>
  );
}
