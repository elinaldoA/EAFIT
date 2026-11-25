import { todayName, todayDate } from '../data/treinoData';
import { getDisplayName, parseLocalDate } from '../lib/utils';
import { greeting } from '../lib/coach';
import { goTo } from '../lib/appNav';
import { trackFeature } from '../lib/tracking';
import { t, tFoco, nDias, locale } from '../lib/i18n';

// Atalhos para as outras telas, na ordem de uso: o que se abre logo depois de treinar.
const SHORTCUTS = [
  { key: 'agua', icon: '💧', label: () => t('Água'), target: { tab: 'hidratacao' } },
  { key: 'nutricao', icon: '🍎', label: () => t('Nutrição'), target: { tab: 'nutricao' } },
  { key: 'historico', icon: '📅', label: () => t('Histórico'), target: { tab: 'dash', dashTab: 'historico' } },
  { key: 'recuperacao', icon: '💪', label: () => t('Recuperação'), target: { tab: 'dash', dashTab: 'recuperacao' }, flag: 'recuperacao_muscular' },
  { key: 'evolucao', icon: '📈', label: () => t('Evolução'), target: { tab: 'dash', dashTab: 'treinos' } },
];

// Quem só tem e-mail não é chamado pelo e-mail: a saudação fica sem nome.
function firstName(user) {
  const name = getDisplayName(user);
  return name && !name.includes('@') ? name.split(' ')[0] : '';
}

// Topo da tela de Treino: saudação, dia, sequência, a semana em dias e atalhos.
// `flagOn(flag)`: atalho de recurso que o painel admin pode desligar.
export default function HomeHero({ user, streak = 0, workDays, isDayDone, missedSet, flagOn = () => true }) {
  const name = firstName(user);
  const hello = t(greeting());
  const date = parseLocalDate(todayDate()).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <section className="home-hero" aria-label={t('Resumo do dia')}>
      <div className="home-hero__head">
        <div>
          <h1 className="home-hero__hello">{name ? t('{saudacao}, {nome}', { saudacao: hello, nome: name }) : hello}</h1>
          <p className="home-hero__date">{date}</p>
        </div>
        {streak > 0 && <span className="home-hero__streak">{t('🔥 {n} seguidos', { n: nDias(streak) })}</span>}
      </div>
      <div className="week-strip">
        {workDays.map(d => {
          const isDone = isDayDone(d.dia);
          const isToday = d.dia === todayName();
          const isMissed = missedSet.has(d.dia);
          let status = '';
          if (isDone) status = t('(concluído)');
          else if (isMissed) status = t('(ficou para trás)');
          return (
            <div
              key={d.dia}
              className={`week-strip__day${isDone ? ' week-strip__day--done' : ''}${isToday ? ' week-strip__day--today' : ''}${isMissed ? ' week-strip__day--missed' : ''}`}
              title={`${t(d.dia)} — ${tFoco(d.foco)}${status}`}
            >
              <span className="week-strip__dot" aria-hidden="true">{isDone ? '✓' : ''}</span>
              <span className="week-strip__label">{t(d.dia).slice(0, 3)}</span>
            </div>
          );
        })}
      </div>
      <nav className="home-hero__links" aria-label={t('Atalhos')}>
        {SHORTCUTS.filter(s => !s.flag || flagOn(s.flag)).map(s => (
          <button
            key={s.key} type="button" className="home-link"
            onClick={() => { trackFeature(`atalho_${s.key}`); goTo(s.target); }}
          >
            <span className="home-link__icon" aria-hidden="true">{s.icon}</span>
            <span className="home-link__label">{s.label()}</span>
          </button>
        ))}
      </nav>
    </section>
  );
}
