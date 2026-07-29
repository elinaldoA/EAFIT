import { db } from './supabase';

export const BADGES = [
  { id: 'streak_3', emoji: '🔥', title: 'Sequência de 3 dias', desc: 'Complete treinos em 3 dias seguidos', check: s => s.streakDays >= 3 },
  { id: 'streak_7', emoji: '🔥🔥', title: 'Sequência de 7 dias', desc: 'Complete treinos em 7 dias seguidos', check: s => s.streakDays >= 7 },
  { id: 'streak_30', emoji: '🔥🔥🔥', title: 'Sequência de 30 dias', desc: 'Complete treinos em 30 dias seguidos', check: s => s.streakDays >= 30 },
  { id: 'workouts_10', emoji: '💪', title: '10 treinos concluídos', desc: 'Complete 10 treinos', check: s => s.totalTreinos >= 10 },
  { id: 'workouts_50', emoji: '🏋️', title: '50 treinos concluídos', desc: 'Complete 50 treinos', check: s => s.totalTreinos >= 50 },
  { id: 'workouts_100', emoji: '🏆', title: '100 treinos concluídos', desc: 'Complete 100 treinos', check: s => s.totalTreinos >= 100 },
  { id: 'photo_first', emoji: '📸', title: 'Primeira foto de progresso', desc: 'Adicione uma foto de progresso', check: s => s.totalPhotos >= 1 },
  { id: 'weight_10', emoji: '⚖️', title: '10 registros de peso', desc: 'Registre seu peso 10 vezes', check: s => s.totalWeightLogs >= 10 },
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
