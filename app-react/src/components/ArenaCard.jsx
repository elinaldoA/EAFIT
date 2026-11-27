import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { claimMission, dailyLabel, fetchArena, progressLabel, visibleMissions } from '../lib/arena';
import { celebrationSince, fetchHero, saveHero } from '../lib/hero';
import { t } from '../lib/i18n';
import ArenaStage from './ArenaStage';
import HeroCreator from './HeroCreator';

const CELEBRATE_MS = 3600;
const seenKey = userId => `arena_seen_${userId}`;

function readSeen(userId) {
  try { return JSON.parse(localStorage.getItem(seenKey(userId)) || 'null'); } catch { return null; }
}
function writeSeen(userId, arena) {
  try { localStorage.setItem(seenKey(userId), JSON.stringify({ xp: arena.xp, level: arena.level })); } catch { /* sem storage */ }
}

// EAFIT Arena: o herói, o nível, a sequência e as missões. Vale para os dois
// módulos (o mesmo herói soma XP de treino e de corrida); `sport` ('gym' | 'run')
// escolhe o cenário e quais missões aparecem. Quando a pessoa volta depois de
// treinar ou correr, o herói comemora o XP novo, e sobe de nível com festa. Some
// quando a Arena está desligada, a função ainda não foi publicada ou, no Run, o
// módulo ainda não foi liberado.
export default function ArenaCard({ sport }) {
  const toast = useToast();
  const { user } = useAuth();
  const userId = user?.id;
  const [data, setData] = useState(null);
  const [hero, setHero] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [celebrate, setCelebrate] = useState(null);
  const [busyId, setBusyId] = useState('');
  const alive = useRef(true);
  const timer = useRef(null);
  const firstLoad = useRef(true);

  const party = useCallback(value => {
    setCelebrate(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (alive.current) setCelebrate(null); }, CELEBRATE_MS);
  }, []);

  const reload = useCallback(async () => {
    try {
      const next = await fetchArena();
      if (!alive.current) return next;
      setData(next);
      if (next?.enabled && userId) {
        if (firstLoad.current) {
          const found = celebrationSince(readSeen(userId), next);
          if (found) party(found);
        }
        writeSeen(userId, next);
      }
      firstLoad.current = false;
      return next;
    } catch {
      if (alive.current) setData({ enabled: false });
      return null;
    }
  }, [party, userId]);

  useEffect(() => {
    alive.current = true;
    reload();
    fetchHero().then(h => { if (alive.current) setHero(h); }).catch(() => {});
    return () => { alive.current = false; clearTimeout(timer.current); };
  }, [reload]);

  async function claim(mission) {
    setBusyId(mission.id);
    const levelBefore = data?.level || 1;
    try {
      const { xp } = await claimMission(mission.id);
      toast(t('⭐ +{xp} XP!', { xp }));
      const next = await reload();
      if (next?.level > levelBefore) {
        toast(t('🎉 Você chegou ao nível {level}!', { level: next.level }), 6000);
        party({ type: 'levelup', amount: xp, level: next.level });
      } else {
        party({ type: 'xp', amount: xp, level: next?.level });
      }
    } catch {
      toast(t('Não foi possível resgatar agora. Tente de novo.'));
      await reload();
    } finally {
      if (alive.current) setBusyId('');
    }
  }

  async function save(next) {
    setSaving(true);
    try {
      setHero(await saveHero(next));
      toast(t('✨ Herói salvo!'));
      setEditing(false);
    } catch {
      toast(t('Não foi possível salvar o herói. Tente de novo.'));
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  if (!data?.enabled) return null;
  // A Arena do Run só existe depois que o módulo Run é liberado (servidor: run_released).
  if (sport === 'run' && !data.run_released) return null;

  if (editing) {
    return <HeroCreator initial={hero} level={data.level} saving={saving} onSave={save} onCancel={() => setEditing(false)} />;
  }

  const missions = visibleMissions(data, sport);

  return (
    <div className="dash-card arena" aria-label={t('EAFIT Arena')}>
      <div className="dash-card__title">{t('⚔️ EAFIT Arena')}</div>

      <ArenaStage arena={data} hero={hero} sport={sport} celebrate={celebrate} onEdit={() => setEditing(true)} />
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
