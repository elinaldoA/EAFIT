import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { waterStorageKey, getWaterGoalLiters } from '../data/treinoData';
import { readLocalTotals } from '../lib/proteinLog';
import { computeNutritionGoals, nutritionProfile } from '../lib/nutritionGoals';
import { fetchWeightLogs } from '../lib/weightLog';
import { goTo } from '../lib/appNav';
import { trackFeature } from '../lib/tracking';
import { t, locale } from '../lib/i18n';

const fmt = (n, digits = 1) => n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: digits });
const pctOf = (value, goal) => (goal > 0 ? Math.max(0, Math.min(100, Math.round((value / goal) * 100))) : 0);

function Tile({ icon, label, value, unit, hint, pct, tone, onClick, wide }) {
  return (
    <button type="button" className={`home-tile home-tile--${tone}${wide ? ' home-tile--wide' : ''}`} onClick={onClick}>
      <span className="home-tile__label"><span aria-hidden="true">{icon}</span> {label}</span>
      {value && <span className="home-tile__value">{value}{unit && <small> {unit}</small>}</span>}
      {pct != null && (
        <span className="home-tile__bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${pct}%` }} />
        </span>
      )}
      {hint && <span className="home-tile__hint">{hint}</span>}
    </button>
  );
}

// Água, proteína e peso de hoje numa olhada, cada um levando à sua tela. Água e proteína
// vêm do aparelho (mesmos dados das telas Água e Nutrição); o peso vem da conta.
export default function HomeTiles() {
  const { user } = useAuth();
  const userId = user?.id;
  const [weights, setWeights] = useState([]);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    fetchWeightLogs(userId).then(rows => { if (!cancelled) setWeights(rows); }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  const goals = useMemo(() => computeNutritionGoals(nutritionProfile(user?.user_metadata)), [user]);
  const waterMl = parseInt(localStorage.getItem(waterStorageKey()), 10) || 0;
  const waterGoalMl = getWaterGoalLiters(user) * 1000;
  const protein = readLocalTotals().protein || 0;

  const last = weights.at(-1);
  const first = weights.length > 1 ? weights[0] : null;
  const delta = last && first ? Math.round((last.peso - first.peso) * 10) / 10 : null;

  const open = (key, target) => () => { trackFeature(`atalho_${key}`); goTo(target); };

  return (
    <section className="home-tiles" aria-label={t('Hoje em números')}>
      <Tile
        tone="water" icon="💧" label={t('Hidratação')}
        value={fmt(waterMl / 1000, 2)} unit={t('de {n} L', { n: fmt(waterGoalMl / 1000, 1) })}
        pct={pctOf(waterMl, waterGoalMl)}
        hint={waterMl >= waterGoalMl ? t('Meta batida 🎉') : t('Faltam {n} L', { n: fmt(Math.max(0, waterGoalMl - waterMl) / 1000, 2) })}
        onClick={open('agua', { tab: 'hidratacao' })}
      />
      <Tile
        tone="food" icon="🍎" label={t('Proteína')}
        value={fmt(protein, 0)} unit={goals ? t('de {n} g', { n: goals.protein }) : 'g'}
        pct={goals ? pctOf(protein, goals.protein) : null}
        hint={goals ? (protein >= goals.protein ? t('Meta batida 🎉') : t('Faltam {n} g', { n: goals.protein - protein })) : t('Complete o perfil para ver a meta')}
        onClick={open('nutricao', { tab: 'nutricao' })}
      />
      <Tile
        wide tone="weight" icon="⚖️" label={t('Peso')}
        value={last ? fmt(last.peso, 1) : ''} unit={last ? 'kg' : ''}
        hint={last ? (delta ? `${delta > 0 ? '+' : ''}${fmt(delta, 1)} kg ${t('desde o primeiro registro')}` : t('Última pesagem registrada')) : t('Registre seu peso para acompanhar')}
        onClick={open('peso', { tab: 'dash', dashTab: 'corpo' })}
      />
    </section>
  );
}
