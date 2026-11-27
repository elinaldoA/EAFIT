import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../context/useToast';
import { claimMission, dailyLabel, fetchArena, levelProgress, progressLabel, visibleMissions } from '../lib/arena';
import { t, nDias } from '../lib/i18n';

// EAFIT Arena: nível, sequência e missões. Vale para os dois módulos (o mesmo
// personagem soma XP de treino e de corrida); `sport` ('gym' | 'run') só escolhe
// quais missões aparecem. Some quando a Arena está desligada, a função ainda não
// foi publicada ou, no Run, o módulo ainda não foi liberado.
export default function ArenaCard({ sport }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState('');
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const next = await fetchArena();
      if (alive.current) setData(next);
      return next;
    } catch {
      if (alive.current) setData({ enabled: false });
      return null;
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    reload();
    return () => { alive.current = false; };
  }, [reload]);

  async function claim(mission) {
    setBusyId(mission.id);
    const levelBefore = data?.level || 1;
    try {
      const { xp } = await claimMission(mission.id);
      toast(t('⭐ +{xp} XP!', { xp }));
      const next = await reload();
      if (next?.level > levelBefore) toast(t('🎉 Você chegou ao nível {level}!', { level: next.level }), 6000);
    } catch {
      toast(t('Não foi possível resgatar agora. Tente de novo.'));
      await reload();
    } finally {
      if (alive.current) setBusyId('');
    }
  }

  if (!data?.enabled) return null;
  // A Arena do Run só existe depois que o módulo Run é liberado (servidor: run_released).
  if (sport === 'run' && !data.run_released) return null;

  const { pct, toNext } = levelProgress(data);
  const streak = Number(data.streak) || 0;
  const missions = visibleMissions(data, sport);

  return (
    <div className="dash-card arena" aria-label={t('EAFIT Arena')}>
      <div className="dash-card__title">{t('⚔️ EAFIT Arena')}</div>

      <div className="arena__level">
        <span className="arena__badge" aria-hidden="true">{data.level}</span>
        <div className="arena__level-body">
          <strong>{t('Nível {level}', { level: data.level })}</strong>
          <div className="arena__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
            aria-label={t('Progresso para o próximo nível')}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <span className="challenge__meta">
            {t('{xp} XP · faltam {falta} para o nível {next}', { xp: data.xp, falta: toNext, next: data.level + 1 })}
          </span>
        </div>
      </div>

      <p className="arena__streak">
        {streak > 0
          ? t('🔥 Sequência de {dias}', { dias: nDias(streak) })
          : t('🔥 Treine ou corra hoje para começar sua sequência')}
        {data.best_streak > streak && (
          <span className="challenge__meta"> · {t('recorde: {dias}', { dias: nDias(data.best_streak) })}</span>
        )}
      </p>
      <p className="challenge__meta">{dailyLabel(data)}</p>

      {missions.length > 0 && (
        <>
          <div className="friends__label">{t('Missões')}</div>
          <ul className="arena__missions">
            {missions.map(m => (
              <li key={m.id} className={`arena__mission${m.claimed ? ' arena__mission--done' : ''}`}>
                <div className="arena__mission-body">
                  <span className="arena__mission-title">{m.title}</span>
                  <span className="challenge__meta">
                    {m.period === 'weekly' ? t('Semana') : t('Hoje')} · {progressLabel(m.progress)} · +{m.xp} XP
                  </span>
                </div>
                {m.claimed ? (
                  <span className="challenge__meta">{t('✅ Resgatada')}</span>
                ) : (
                  <button type="button" className="btn btn--primary btn--sm"
                    disabled={!m.done || busyId === m.id} onClick={() => claim(m)}>
                    {t('Resgatar')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="challenge__meta">
        {t('Treinos e corridas rendem XP no mesmo personagem. O XP de atividade tem um teto por dia.')}
      </p>
    </div>
  );
}
