import { db } from './supabase';
import { SEASONS, SEASON_CHALLENGES, earnedSeason, seasonToday, seasonWindow } from './season';
import { challengeVars } from './seasonLabels';
import { DIVISIONS, MEDALS, monthLabel, parseLeagueBadge } from './league';

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

// Conquistas de temporada (lib/season.js): uma por edição de cada tema, desde
// a primeira. O id leva o ano em que o desafio termina (ano_novo_2027 é a
// edição que começa em dezembro de 2026); `year` é o da edição, o mesmo do
// período no painel. Só aparecem na grade quando ganhas ou durante o tema.
const BADGE_TITLE = {
  carnaval: v => t('Carnaval {ano}', v),
  pascoa: v => t('Páscoa {ano}', v),
  namorados: v => t('Namorados {ano}', v),
  festa_junina: v => t('Arraiá {ano}', v),
  outubro_rosa: v => t('Outubro Rosa {ano}', v),
  halloween: v => t('Treino das Bruxas {ano}', v),
  novembro_azul: v => t('Novembro Azul {ano}', v),
  natal: v => t('Treino de Natal {ano}', v),
  ano_novo: v => t('Ano Novo {ano}', v),
};

function badgeDesc(theme, w, v) {
  if (theme === 'halloween') return t('Treine em 31/10 ou faça 3 treinos entre 24/10 e 02/11');
  if (theme === 'novembro_azul') return t('Faça {meta} treinos em novembro', v);
  if (w.goal === 1) return t('Treine entre {de} e {ate}', v);
  if (w.day) return t('Treine em {dia} ou faça {meta} treinos entre {de} e {ate}', v);
  return t('Faça {meta} treinos entre {de} e {ate}', v);
}

function seasonBadge(theme, year) {
  const w = seasonWindow(theme, year);
  const v = challengeVars(w);
  return {
    id: `${theme}_${v.ano}`, emoji: SEASONS[theme].emoji, season: theme, year,
    title: BADGE_TITLE[theme](v),
    desc: badgeDesc(theme, w, v),
    check: s => earnedSeason(theme, s.completedDates, year),
  };
}

export function seasonalBadges(today = seasonToday()) {
  const list = [];
  const themes = Object.keys(SEASON_CHALLENGES);
  const last = Number(today.slice(0, 4));
  for (let y = Math.min(...themes.map(k => SEASON_CHALLENGES[k].first)); y <= last; y++) {
    for (const theme of themes) if (y >= SEASON_CHALLENGES[theme].first) list.push(seasonBadge(theme, y));
  }
  return list;
}

// Medalhas da liga mensal (lib/league.js): gravadas pelo servidor no
// fechamento do mês, então só aparecem quando ganhas e nunca são "batidas" aqui.
export function leagueBadges(unlockedIds) {
  return [...unlockedIds].map(id => ({ id, info: parseLeagueBadge(id) })).filter(b => b.info)
    .sort((a, b) => b.info.month.localeCompare(a.info.month))
    .map(({ id, info }) => {
      const v = { position: info.position, division: DIVISIONS[info.division].label, month: monthLabel(info.month) };
      return {
        id, emoji: MEDALS[info.position], league: true,
        title: t('Liga {division} · {position}º', v),
        desc: t('{position}º lugar na divisão {division} da liga de {month}', v),
        check: () => false,
      };
    });
}

// Grade da tela de Evolução: as fixas + as de temporada ganhas ou do tema no ar
// + as da liga ganhas.
export function visibleBadges(unlockedIds, season = { theme: '', year: 0 }, today = seasonToday()) {
  const seasonal = seasonalBadges(today).filter(b =>
    unlockedIds.has(b.id) || (b.season === season.theme && b.year === season.year));
  return [...BADGES, ...seasonal, ...leagueBadges(unlockedIds)];
}

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

  const newlyEarned = [...BADGES, ...seasonalBadges()].filter(b => !unlockedIds.has(b.id) && b.check(stats));
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
