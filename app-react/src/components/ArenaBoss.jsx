import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../context/useToast';
import { bossAmount, bossMine, bossPercent, claimArenaBoss, fetchArenaBoss, seasonDaysLeft, shortDate } from '../lib/arena';
import { t } from '../lib/i18n';

const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// Chefão da semana da EAFIT Arena: uma meta coletiva (todo mundo soma), sem expor
// ninguém. Quem contribuiu resgata o bônus de XP quando a meta é batida.
// Some com a Arena desligada, sem a função publicada, sem chefão na semana ou, no
// Run, com o módulo ainda não liberado.
export default function ArenaBoss({ sport }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const res = await fetchArenaBoss();
      if (alive.current) setData(res);
    } catch {
      if (alive.current) setData({ enabled: false });
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    reload();
    return () => { alive.current = false; };
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
