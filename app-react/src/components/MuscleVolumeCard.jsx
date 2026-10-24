import { useEffect, useState } from 'react';
import { MUSCLE_LABELS } from '../data/bodyMuscleMap';
import {
  MUSCLES, WEEKLY_MIN, WEEKLY_MAX, countSetsByMuscle, volumeLevel, behindMuscles, plannedMuscles,
  fetchLibraryMap, fetchWeekSets,
} from '../lib/muscleVolume';
import BodyAvatar from './BodyAvatar';
import Skeleton from './Skeleton';

import { t } from '../lib/i18n';

// Escala das barras: um pouco além do teto da faixa, para "acima" aparecer.
const SCALE_MAX = WEEKLY_MAX + 6;

// Volume semanal por grupo muscular (ver lib/muscleVolume.js): o corpo pintado
// pelo volume dos últimos 7 dias, uma barra por músculo com a faixa de 10–20
// séries marcada e quem do plano está ficando para trás.
export default function MuscleVolumeCard({ userId, planDays, active }) {
  const [data, setData] = useState(null); // { counts, planned }
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!active || !userId) return undefined;
    let cancelled = false;
    Promise.all([fetchWeekSets(userId), fetchLibraryMap()])
      .then(([sets, libMap]) => {
        if (cancelled) return;
        setData({ counts: countSetsByMuscle(sets, libMap), planned: plannedMuscles(planDays, libMap) });
        setError(false);
      })
      .catch(err => {
        console.error('MuscleVolumeCard:', err);
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, [active, userId, planDays]);

  const counts = data?.counts;
  const levels = counts ? Object.fromEntries(MUSCLES.map(m => [m, volumeLevel(counts[m])])) : null;
  const behind = counts ? behindMuscles(counts, data.planned) : [];
  const total = counts ? MUSCLES.reduce((a, m) => a + counts[m], 0) : 0;

  return (
    <div className="dash-card">
      <div className="dash-card__title">{t('Volume da semana por músculo')}</div>
      <p className="dash-card__subtitle">
        {t('Séries concluídas nos últimos 7 dias. A faixa marcada ({min}–{max} séries) é a referência para ganhar massa.', { min: WEEKLY_MIN, max: WEEKLY_MAX })}
      </p>
      {error && <p className="dash-empty">{t('⚠️ Não deu para carregar o volume agora.')}</p>}
      {!error && !counts && <Skeleton height={160} />}
      {counts && total === 0 && <p className="dash-empty">{t('Nenhuma série concluída nos últimos 7 dias.')}</p>}
      {counts && total > 0 && (
        <>
          {behind.length > 0 && (
            <p className="volume__behind">
              {t('Ficando para trás: {lista}', { lista: behind.slice(0, 3).map(m => MUSCLE_LABELS[m]).join(', ') })}
            </p>
          )}
          <BodyAvatar levels={levels} />
          <ul className="volume__list">
            {MUSCLES.filter(m => counts[m] > 0 || data.planned.has(m)).sort((a, b) => counts[b] - counts[a]).map(m => (
              <li key={m} className={`volume__row volume__row--${levels[m]}`}>
                <span className="volume__name">{MUSCLE_LABELS[m]}</span>
                <span className="volume__track" aria-hidden="true">
                  <span className="volume__band" style={{ left: `${(WEEKLY_MIN / SCALE_MAX) * 100}%`, width: `${((WEEKLY_MAX - WEEKLY_MIN) / SCALE_MAX) * 100}%` }} />
                  <span className="volume__fill" style={{ width: `${Math.min(100, (counts[m] / SCALE_MAX) * 100)}%` }} />
                </span>
                <span className="volume__count">{t('{n} séries', { n: counts[m] })}</span>
              </li>
            ))}
          </ul>
          <p className="volume__note">{t('Conta só o músculo principal de cada exercício.')}</p>
        </>
      )}
    </div>
  );
}
