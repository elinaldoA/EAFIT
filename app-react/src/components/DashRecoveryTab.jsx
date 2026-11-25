import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { todayDate, todayName } from '../data/treinoData';
import { MUSCLE_LABELS } from '../data/bodyMuscleMap';
import { fetchRecentSets, LOOKBACK_DAYS } from '../lib/trainingCoach';
import { fetchLibraryMap, plannedMuscles } from '../lib/muscleVolume';
import { muscleRecovery, musclesIn } from '../lib/muscleRecovery';
import BodyAvatar from './BodyAvatar';
import Skeleton from './Skeleton';

import { t, nDias, nSeries } from '../lib/i18n';

// Recuperação muscular (lib/muscleRecovery.js): o corpo pintado pelo estado de cada
// músculo e a lista de quem está descansando, quase pronto e recuperado. Cada linha
// escreve o estado e quando fica pronto (a cor sozinha não basta).
const GROUPS = [
  { state: 'tired', title: () => t('Descansando') },
  { state: 'recovering', title: () => t('Quase prontos') },
  { state: 'ready', title: () => t('Recuperados') },
];

const joinNames = list => list.map(m => MUSCLE_LABELS[m]).join(', ');

function lastTrained(r) {
  if (r.daysSince === 0) return t('Treinado hoje');
  if (r.daysSince === 1) return t('Treinado ontem');
  return t('Treinado há {n} dias', { n: r.daysSince });
}

function statusLabel(r) {
  return r.state === 'ready' ? t('Pronto') : t('Pronto em {n}', { n: nDias(r.daysLeft) });
}

export default function DashRecoveryTab({ active }) {
  const { user } = useAuth();
  const { activePlanDays } = useWorkout();
  const [data, setData] = useState(null); // { recovery, libMap }
  const [error, setError] = useState(false);
  const userId = user?.id;

  useEffect(() => {
    if (!active || !userId) return undefined;
    let cancelled = false;
    Promise.all([fetchRecentSets(userId), fetchLibraryMap(userId)])
      .then(([sets, libMap]) => {
        if (cancelled) return;
        setData({ recovery: muscleRecovery(sets, todayDate(), libMap), libMap });
        setError(false);
      })
      .catch(err => {
        console.error('DashRecoveryTab:', err);
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, [active, userId]);

  const recovery = data?.recovery;
  const trained = recovery ? Object.values(recovery).some(r => r.state !== 'none') : false;
  // O treino de hoje trabalha músculo que ainda está descansando: é o aviso que importa.
  const todayDay = (activePlanDays || []).find(d => d.dia === todayName());
  const tiredToday = recovery && todayDay
    ? [...plannedMuscles([todayDay], data.libMap)].filter(m => recovery[m].state === 'tired')
    : [];
  const untrained = recovery ? musclesIn(recovery, 'none') : [];
  const readyList = recovery ? musclesIn(recovery, 'ready') : [];
  const restingList = recovery ? [...musclesIn(recovery, 'tired'), ...musclesIn(recovery, 'recovering')] : [];
  const weeks = LOOKBACK_DAYS / 7;

  return (
    <div className="dash-card">
      <div className="dash-card__title">{t('Recuperação muscular')}</div>
      <p className="dash-card__subtitle">
        {t('Quais músculos já descansaram o bastante para treinar de novo, pelo dia e pelo volume do último treino de cada um.')}
      </p>
      {error && <p className="dash-empty">{t('⚠️ Não deu para carregar a recuperação agora.')}</p>}
      {!error && !recovery && <Skeleton height={220} />}
      {recovery && !trained && (
        <p className="dash-empty">{t('Nenhum treino nas últimas {n} semanas. Conclua um treino e a recuperação aparece aqui.', { n: weeks })}</p>
      )}
      {recovery && trained && (
        <>
          {tiredToday.length > 0 && (
            <p className="recovery__alert" role="status">
              {t('Seu treino de hoje trabalha {lista}, que ainda está descansando. Dá para treinar, mas o rendimento pode cair.', { lista: joinNames(tiredToday) })}
            </p>
          )}
          {/* A resposta primeiro (quem posso treinar), o detalhe depois. */}
          <div className="recovery__summary">
            {readyList.length > 0 && <p><strong>{t('Prontos para treinar:')}</strong> {joinNames(readyList)}</p>}
            {restingList.length > 0 && <p><strong>{t('Ainda descansando:')}</strong> {joinNames(restingList)}</p>}
          </div>
          <BodyAvatar levels={Object.fromEntries(Object.entries(recovery).map(([m, r]) => [m, r.state]))} legend="recovery" />
          {GROUPS.map(({ state, title }) => {
            const list = musclesIn(recovery, state);
            if (!list.length) return null;
            return (
              <section key={state} className="recovery__group" aria-label={title()}>
                <h3 className="recovery__group-title">{title()} <span>{list.length}</span></h3>
                <ul className="recovery__list">
                  {list.map(m => (
                    <li key={m} className={`recovery__row recovery__row--${state}`}>
                      <span className="recovery__name">{MUSCLE_LABELS[m]}</span>
                      <span className="recovery__chip">{statusLabel(recovery[m])}</span>
                      <span className="recovery__detail">{lastTrained(recovery[m])} · {nSeries(recovery[m].sets)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {untrained.length > 0 && (
            <p className="recovery__none">{t('Sem treino nas últimas {n} semanas: {lista}.', { n: weeks, lista: joinNames(untrained) })}</p>
          )}
          <p className="volume__note">{t('É uma estimativa: ombros, braços, abdômen e panturrilha costumam pedir 1 dia; peito, costas e pernas, 2; volume alto soma 1 dia. Dor forte ou cansaço fora do normal pedem mais descanso.')}</p>
        </>
      )}
    </div>
  );
}
