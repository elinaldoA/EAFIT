import { db } from './supabase';
import { trackFeature } from './tracking';
import { t } from './i18n';

// Herói da EAFIT Arena (supabase/migrations/20270309010000_arena_hero.sql): o
// personagem da pessoa, o mesmo no Gym e no Run. O servidor guarda só as escolhas
// (números pequenos); aqui está o que cada número desenha. A evolução visual
// (roupa, equipamento e aura) sai do nível, não é guardada.

export const BODIES = [1, 2, 3];
export const HAIR_STYLES = [1, 2, 3, 4, 5, 6];

export const SKIN = ['#FFE0C2', '#F5C9A0', '#E0A878', '#C68642', '#8D5524', '#5C3A1E'];
export const HAIR_COLORS = ['#2B1B12', '#5A3A22', '#B5651D', '#E8C16A', '#C23B22', '#7A7F8C'];
export const OUTFITS = ['#3B82F6', '#EF4444', '#22C55E', '#F59E0B', '#8B5CF6', '#14B8A6'];

export const DEFAULT_HERO = Object.freeze({ body: 2, skin: 2, hair_style: 1, hair_color: 2, outfit: 1 });

const RANGES = { body: 3, skin: 6, hair_style: 6, hair_color: 6, outfit: 6 };

// Garante um herói válido (valores fora da faixa viram o padrão), para a tela
// nunca quebrar com um dado estranho.
export function sanitizeHero(hero) {
  const out = {};
  for (const [key, max] of Object.entries(RANGES)) {
    const n = Number(hero?.[key]);
    out[key] = Number.isInteger(n) && n >= 1 && n <= max ? n : DEFAULT_HERO[key];
  }
  return out;
}

// Faixas de nível do visual: cada uma acrescenta equipamento ao herói.
const TIER_STEPS = [
  { min: 1, name: () => t('Novato') },
  { min: 5, name: () => t('Dedicado') },
  { min: 10, name: () => t('Atleta') },
  { min: 15, name: () => t('Veterano') },
  { min: 20, name: () => t('Elite') },
  { min: 30, name: () => t('Lenda') },
];

// { tier: 1..6, name, next: { level, name } | null } para um nível.
export function heroTier(level) {
  const lv = Math.max(1, Number(level) || 1);
  let index = 0;
  TIER_STEPS.forEach((s, i) => { if (lv >= s.min) index = i; });
  const next = TIER_STEPS[index + 1];
  return {
    tier: index + 1,
    name: TIER_STEPS[index].name(),
    next: next ? { level: next.min, name: next.name() } : null,
  };
}

export async function fetchHero() {
  const { data, error } = await db.rpc('arena_my_hero');
  if (error) throw error;
  return data ? sanitizeHero(data) : null;
}

export async function saveHero(hero) {
  const h = sanitizeHero(hero);
  const { data, error } = await db.rpc('arena_save_hero', {
    p_body: h.body, p_skin: h.skin, p_hair_style: h.hair_style, p_hair_color: h.hair_color, p_outfit: h.outfit,
  });
  if (error) throw error;
  trackFeature('arena_heroi');
  return sanitizeHero(data);
}

// O que mudou desde a última vez que a pessoa abriu a Arena: o herói comemora o
// XP novo (treino ou corrida feitos fora da tela) e sobe de nível com festa.
// `seen` é { xp, level } guardado no aparelho; sem ele não há o que comemorar.
export function celebrationSince(seen, now) {
  const xp = Number(now?.xp) || 0;
  const level = Number(now?.level) || 1;
  if (!seen || !Number.isFinite(Number(seen.xp))) return null;
  const gained = xp - Number(seen.xp);
  if (gained <= 0) return null;
  return { type: level > Number(seen.level) ? 'levelup' : 'xp', amount: gained, level };
}
