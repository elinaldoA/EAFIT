import { levelProgress } from '../lib/arena';
import { heroTier } from '../lib/hero';
import { t, nDias } from '../lib/i18n';
import ArenaScene from './ArenaScene';
import HeroAvatar from './HeroAvatar';

// Palco da Arena: o herói em pé no cenário do módulo (academia no Gym, pista no
// Run), com o nível, a barra de XP e a sequência. `celebrate` faz o herói
// comemorar: { type: 'xp' | 'levelup', amount, level }.
export default function ArenaStage({ arena, hero, sport, celebrate, onEdit }) {
  const { pct, toNext } = levelProgress(arena);
  const level = arena.level || 1;
  const tier = heroTier(level);
  const streak = Number(arena.streak) || 0;
  const mood = celebrate ? 'cheer' : 'idle';

  return (
    <div className="arena-stage-wrap">
      <div className={`arena-stage${celebrate?.type === 'levelup' ? ' arena-stage--levelup' : ''}`}>
        <ArenaScene sport={sport} />
        <span className="arena-stage__tag">{t('Nível {level}', { level })} · {tier.name}</span>
        <button type="button" className="arena-stage__edit" onClick={onEdit}>
          {hero ? t('✏️ Herói') : t('✨ Criar herói')}
        </button>
        <HeroAvatar hero={hero} level={level} mood={mood} className="arena-stage__hero" label={t('Seu herói')} />
        {celebrate && (
          <>
            <span className="arena-float" role="status">{t('+{xp} XP', { xp: celebrate.amount })}</span>
            {celebrate.type === 'levelup' && (
              <div className="arena-burst" aria-hidden="true">
                {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ '--a': `${i * 30}deg` }} />)}
                <strong className="arena-burst__text">{t('Nível {level}!', { level: celebrate.level })}</strong>
              </div>
            )}
          </>
        )}
      </div>

      <div className="arena__level">
        <div className="arena__level-body">
          <strong>{t('Nível {level}', { level })}</strong>
          <div className="arena__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
            aria-label={t('Progresso para o próximo nível')}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <span className="challenge__meta">
            {t('{xp} XP · faltam {falta} para o nível {next}', { xp: arena.xp, falta: toNext, next: level + 1 })}
          </span>
          {tier.next && (
            <span className="challenge__meta">
              {t('Próximo visual: {name} no nível {level}', { name: tier.next.name, level: tier.next.level })}
            </span>
          )}
        </div>
      </div>

      <p className="arena__streak">
        {streak > 0
          ? t('🔥 Sequência de {dias}', { dias: nDias(streak) })
          : t('🔥 Treine ou corra hoje para começar sua sequência')}
        {arena.best_streak > streak && (
          <span className="challenge__meta"> · {t('recorde: {dias}', { dias: nDias(arena.best_streak) })}</span>
        )}
      </p>
    </div>
  );
}
