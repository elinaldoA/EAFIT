import { db } from './supabase';
import { trackFeature } from './tracking';

import { t } from './i18n';
// low/high: o que valem as pontas da escala, escrito embaixo dos rostos. O mesmo
// rosto não se repete com sentidos opostos: o 😴 era o 1 da energia (sem
// energia) e o 5 do sono (dormi muito bem).
export const CHECKIN_FIELDS = [
  { key: 'energy', label: t('Energia'), low: t('Sem energia'), high: t('Cheio de energia'), emojis: ['😴', '🥱', '🙂', '😃', '⚡'] },
  { key: 'sleep', label: t('Sono'), low: t('Dormi mal'), high: t('Dormi muito bem'), emojis: ['😵', '😪', '🙂', '😌', '😁'] },
  { key: 'mood', label: t('Humor'), low: t('Para baixo'), high: t('Ótimo'), emojis: ['😞', '😕', '😐', '🙂', '😄'] },
];

export async function fetchCheckins(userId, sinceDate) {
  const { data, error } = await db
    .from('daily_checkins')
    .select('checkin_date, energy, sleep, mood')
    .eq('user_id', userId)
    .gte('checkin_date', sinceDate)
    .order('checkin_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function saveCheckin(userId, checkinDate, { energy, sleep, mood }) {
  trackFeature('checkin');
  const { error } = await db
    .from('daily_checkins')
    .upsert({ user_id: userId, checkin_date: checkinDate, energy, sleep, mood }, { onConflict: 'user_id,checkin_date' });
  if (error) throw error;
}

const avg = arr => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);

// Resumo dos check-ins: médias e comparação "dia que treinou" x "dia que não
// treinou" para energia e humor. `trainedDates` = datas com treino concluído.
// Só devolve a comparação com pelo menos 3 dias de cada lado (senão é ruído).
export function buildCheckinInsights(checkins, trainedDates) {
  if (!checkins.length) return null;
  const trained = new Set(trainedDates);
  const on = checkins.filter(c => trained.has(c.checkin_date));
  const off = checkins.filter(c => !trained.has(c.checkin_date));
  const compare = on.length >= 3 && off.length >= 3
    ? {
        energyOn: avg(on.map(c => c.energy)),
        energyOff: avg(off.map(c => c.energy)),
        moodOn: avg(on.map(c => c.mood)),
        moodOff: avg(off.map(c => c.mood)),
      }
    : null;
  return {
    days: checkins.length,
    energy: avg(checkins.map(c => c.energy)),
    sleep: avg(checkins.map(c => c.sleep)),
    mood: avg(checkins.map(c => c.mood)),
    compare,
  };
}

// Sugestão leve pra tela de treino, a partir da resposta do dia.
export function checkinTip({ energy, sleep }) {
  if (energy <= 2 && sleep <= 2) return t('Dia puxado: considere um treino mais leve e hidrate-se bem.');
  if (energy <= 2) return t('Energia baixa: aqueça um pouco mais e ajuste a carga se precisar.');
  if (sleep <= 2) return t('Dormiu mal: cuidado com cargas máximas hoje.');
  if (energy >= 4) return t('Energia alta: ótimo dia para buscar um recorde!');
  return t('Tudo certo. Bom treino!');
}
