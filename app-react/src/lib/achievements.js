import { db } from './supabase';

import { t } from './i18n';
export const BADGES = [
  { id: 'streak_3', emoji: '🔥', title: t('Sequência de 3 dias'), desc: t('Complete treinos em 3 dias seguidos'), check: s => s.streakDays >= 3 },
  { id: 'streak_14', emoji: '🔥🔥', title: t('Sequência de 14 dias'), desc: t('Complete treinos em 14 dias seguidos'), check: s => s.streakDays >= 14 },
  { id: 'streak_7', emoji: '🔥🔥', title: t('Sequência de 7 dias'), desc: t('Complete treinos em 7 dias seguidos'), check: s => s.streakDays >= 7 },
  { id: 'streak_30', emoji: '🔥🔥🔥', title: t('Sequência de 30 dias'), desc: t('Complete treinos em 30 dias seguidos'), check: s => s.streakDays >= 30 },
  { id: 'workouts_10', emoji: '💪', title: t('10 treinos concluídos'), desc: t('Complete 10 treinos'), check: s => s.totalTreinos >= 10 },
  { id: 'workouts_25', emoji: '💪', title: t('25 treinos concluídos'), desc: t('Complete 25 treinos'), check: s => s.totalTreinos >= 25 },
  { id: 'workouts_50', emoji: '🏋️', title: t('50 treinos concluídos'), desc: t('Complete 50 treinos'), check: s => s.totalTreinos >= 50 },
  { id: 'workouts_100', emoji: '🏆', title: t('100 treinos concluídos'), desc: t('Complete 100 treinos'), check: s => s.totalTreinos >= 100 },
  { id: 'workouts_200', emoji: '👑', title: t('200 treinos concluídos'), desc: t('Complete 200 treinos'), check: s => s.totalTreinos >= 200 },
  { id: 'photo_first', emoji: '📸', title: t('Primeira foto de progresso'), desc: t('Adicione uma foto de progresso'), check: s => s.totalPhotos >= 1 },
  { id: 'photo_5', emoji: '🖼️', title: t('5 fotos de progresso'), desc: t('Adicione 5 fotos de progresso'), check: s => s.totalPhotos >= 5 },
  { id: 'weight_10', emoji: '⚖️', title: t('10 registros de peso'), desc: t('Registre seu peso 10 vezes'), check: s => s.totalWeightLogs >= 10 },
  { id: 'weight_30', emoji: '📉', title: t('30 registros de peso'), desc: t('Registre seu peso 30 vezes'), check: s => s.totalWeightLogs >= 30 },
];

export async function fetchUnlockedAchievements(userId) {
  const { data, error } = await db
    .from('achievements')
    .select('badge_id, unlocked_at')
    .eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

// Verifica quais badges o usuário já bateu, grava os novos (sem duplicar) e
// retorna o conjunto completo de ids desbloqueados + os que acabaram de ser batidos agora.
export async function syncAchievements(userId, stats) {
  const unlocked = await fetchUnlockedAchievements(userId);
  const unlockedIds = new Set(unlocked.map(a => a.badge_id));

  const newlyEarned = BADGES.filter(b => !unlockedIds.has(b.id) && b.check(stats));
  if (newlyEarned.length > 0) {
    const { error } = await db
      .from('achievements')
      .upsert(
        newlyEarned.map(b => ({ user_id: userId, badge_id: b.id })),
        { onConflict: 'user_id,badge_id' }
      );
    if (error) throw error;
    newlyEarned.forEach(b => unlockedIds.add(b.id));
  }

  return { unlockedIds, newlyEarned };
}
