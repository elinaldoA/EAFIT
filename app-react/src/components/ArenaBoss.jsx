import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import {
  bossAmount, bossHitSince, bossHp, bossMine, bossPercent, claimArenaBoss, fetchArena, fetchArenaBoss,
  seasonDaysLeft, shortDate,
} from '../lib/arena';
import { useHeroForm } from '../hooks/useHeroForm';
import { fetchHero } from '../lib/hero';
import { t } from '../lib/i18n';
import ArenaScene from './ArenaScene';
import BossMonster from './BossMonster';
import HeroAvatar from './HeroAvatar';

const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const EVENT_MS = 3600;
const seenKey = userId => `arena_boss_seen_${userId}`;

function readSeen(userId) {
  try { return JSON.parse(localStorage.getItem(seenKey(userId)) || 'null'); } catch { return null; }
}
function writeSeen(userId, boss) {
  try { localStorage.setItem(seenKey(userId), JSON.stringify({ id: boss.id, value: boss.value, defeated: boss.defeated })); } catch { /* sem storage */ }
}

// O encontro: o herói de um lado, o monstro do outro, a barra de vida no alto.
// Quando a comunidade avançou desde a última visita, o monstro leva o golpe
// (treme, pisca e mostra o dano); derrotado, cai e deixa o baú do bônus.
function BossStage({ boss, hero, level, form, event }) {
  const hp = bossHp(boss);
  const mood = boss.defeated ? 'defeated' : event?.type === 'hit' ? 'hit' : hp <= 25 ? 'hurt' : 'idle';
  return (
    <div className={`arena-stage arena-stage--boss${event?.type === 'defeat' ? ' arena-stage--levelup' : ''}`}>
      <ArenaScene sport="boss" />
      <div className="boss-hp" aria-hidden="true">
        <div className="boss-hp__bar"><i style={{ width: `${hp}%` }} /></div>
        <span className="boss-hp__label">{t('Vida {hp}%', { hp })}</span>
      </div>
      <HeroAvatar hero={hero} level={level} form={form?.form} goal={form?.goal} mood={event ? 'cheer' : 'idle'} className="boss-stage__hero" label={t('Seu herói')} />
      <BossMonster metric={boss.metric} mood={mood} className="boss-stage__monster" label={boss.title} />
      {event?.type === 'hit' && <span className="boss-dmg" role="status">{t('−{dmg}% de vida', { dmg: event.dmg })}</span>}
      {event?.type === 'defeat' && (
        <>
          <span className="arena-float" role="status">{t('Chefão derrotado!')}</span>
          <div className="arena-burst" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ '--a': `${i * 30}deg` }} />)}
          </div>
        </>
      )}
      {boss.defeated && boss.can_claim && <span className="boss-loot" aria-hidden="true">🎁</span>}
    </div>
  );
}

// Chefão da semana da EAFIT Arena: uma meta coletiva (todo mundo soma), sem expor
// ninguém. Quem contribuiu resgata o bônus de XP quando a meta é batida.
// Some com a Arena desligada, sem a função publicada, sem chefão na semana ou, no
// Run, com o módulo ainda não liberado.
export default function ArenaBoss({ sport }) {
  const toast = useToast();
  const { user } = useAuth();
  const userId = user?.id;
  const form = useHeroForm();
  const [data, setData] = useState(null);
  const [hero, setHero] = useState(null);
  const [level, setLevel] = useState(1);
  const [event, setEvent] = useState(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const timer = useRef(null);
  const firstLoad = useRef(true);

  const reload = useCallback(async () => {
    try {
      const res = await fetchArenaBoss();
      if (!alive.current) return;
      setData(res);
      if (res?.enabled && res.boss && userId) {
        if (firstLoad.current) {
          const found = bossHitSince(readSeen(userId), res.boss);
          if (found) {
            setEvent(found);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => { if (alive.current) setEvent(null); }, EVENT_MS);
          }
        }
        writeSeen(userId, res.boss);
      }
      firstLoad.current = false;
    } catch {
      if (alive.current) setData({ enabled: false });
    }
  }, [userId]);

  useEffect(() => {
    alive.current = true;
    reload();
    fetchHero().then(h => { if (alive.current) setHero(h); }).catch(() => {});
    fetchArena().then(a => { if (alive.current && a?.level) setLevel(a.level); }).catch(() => {});
    return () => { alive.current = false; clearTimeout(timer.current); };
  }, [reload]);

  async function claim(boss) {
    setBusy(true);
    try {
      const { xp } = await claimArenaBoss(boss.id);
      toast(t('⭐ +{xp} XP!', { xp }));
      await reload();
    } catch {
      toast(t('Não foi possível resgatar agora. Tente de novo.'));
      await reload();
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  if (!data?.enabled || !data.boss) return null;
  if (sport === 'run' && !data.run_released) return null;

  const { boss, last } = data;
  const pct = bossPercent(boss);
  const left = seasonDaysLeft(boss.ends_on, todayIso());

  return (
    <div className="dash-card arena" aria-label={t('Chefão da semana')}>
      <div className="dash-card__title">{boss.emoji} {boss.title}</div>
      <p className="challenge__meta">
        {t('Chefão da semana')} · {t('Até {data}', { data: shortDate(boss.ends_on) })} · {left === 0 ? t('Último dia') : t('Faltam {n} dias', { n: left })}
      </p>
      <BossStage boss={boss} hero={hero} level={level} form={form} event={event} />
      {boss.description && <p className="dash-empty">{boss.description}</p>}

      <div className="arena__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        aria-label={t('Progresso do chefão')}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <p className="challenge__meta">
        {bossAmount(boss)} · {t('{n} pessoas na batalha', { n: boss.participants })}
      </p>
      <p className="challenge__meta">{t('Sua parte: {parte}', { parte: bossMine(boss) })}</p>

      {boss.defeated && <p className="arena__streak">{t('🎉 Chefão derrotado!')}</p>}
      {boss.claimed ? (
        <p className="challenge__meta">{t('✅ Bônus resgatado')}</p>
      ) : boss.can_claim ? (
        <div className="challenge__actions">
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => claim(boss)}>
            {t('Resgatar +{xp} XP', { xp: boss.reward_xp })}
          </button>
        </div>
      ) : (
        <p className="challenge__meta">
          {boss.defeated
            ? t('Só quem contribuiu resgata o bônus.')
            : t('Bata a meta juntos e quem contribuiu leva +{xp} XP.', { xp: boss.reward_xp })}
        </p>
      )}

      {last && (
        <p className="challenge__meta">
          {last.defeated
            ? t('Semana passada: {emoji} {title} foi derrotado!', { emoji: last.emoji, title: last.title })
            : t('Semana passada: {emoji} {title} resistiu.', { emoji: last.emoji, title: last.title })}
        </p>
      )}
    </div>
  );
}
