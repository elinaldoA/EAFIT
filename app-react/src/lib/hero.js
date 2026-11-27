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

// ── Forma física: o corpo do herói reflete o treino ──
// O servidor calcula a forma (0 a 100) em cima dos treinos e corridas reais
// (supabase/migrations/20270310010000_arena_form.sql). Aqui a forma vira corpo,
// na direção do objetivo da pessoa (`meta` do perfil): quem quer massa ou força
// fica largo e volumoso; quem quer emagrecer, definição ou resistência fica
// enxuto e marcado. Forma baixa é igual para todos: barriga, braço fino,
// postura caída e olheiras. Sem forma calculada o herói fica neutro.
const BUILD = {
  massa: { shoulder: [0.84, 1.36], arm: [0.68, 1.75], fatMin: 0.12, defMax: 0.6 },
  forca: { shoulder: [0.84, 1.38], arm: [0.68, 1.7], fatMin: 0.15, defMax: 0.5 },
  definicao: { shoulder: [0.86, 1.2], arm: [0.72, 1.4], fatMin: 0, defMax: 1 },
  emagrecer: { shoulder: [0.86, 1.04], arm: [0.7, 1.05], fatMin: 0, defMax: 0.75 },
  saude: { shoulder: [0.86, 1.18], arm: [0.74, 1.3], fatMin: 0.04, defMax: 0.7 },
  resistencia: { shoulder: [0.86, 1.04], arm: [0.72, 1.05], fatMin: 0, defMax: 0.65 },
};

const clamp01 = n => Math.min(1, Math.max(0, n));
const lerp = ([a, b], f) => a + (b - a) * f;

export const NEUTRAL_PHYSIQUE = Object.freeze({ shoulder: 1, arm: 1, waist: 1, belly: 0, abs: 0, bicep: 0, slump: 0, tired: 0 });

// Medidas do corpo para uma forma (0 a 100) e um objetivo. Todas variam
// de forma contínua: cada treino a mais mexe um pouco no corpo.
export function physique(score, goal) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return NEUTRAL_PHYSIQUE;
  const f = clamp01(Number(score) / 100);
  const b = BUILD[goal] || BUILD.saude;
  const fat = lerp([1, b.fatMin], f);
  return {
    shoulder: lerp(b.shoulder, f),
    arm: lerp(b.arm, f),
    waist: 1 + 0.55 * fat - 0.14 * f,
    belly: fat,
    abs: clamp01((f - 0.4) / 0.6) * b.defMax * (1 - fat),
    bicep: clamp01((f - 0.3) / 0.7),
    slump: clamp01((0.3 - f) / 0.3),
    tired: clamp01((0.25 - f) / 0.25),
  };
}

// Nome da fase do corpo, para a pessoa entender onde está.
export function formTier(score, goal) {
  if (score === null || score === undefined) return null;
  const s = Number(score);
  if (!Number.isFinite(s)) return null;
  const bulk = goal === 'massa' || goal === 'forca';
  const steps = [
    { min: 0, key: 'sem', name: t('Fora de forma') },
    { min: 20, key: 'voltando', name: t('Voltando à rotina') },
    { min: 45, key: 'forma', name: t('Em forma') },
    { min: 70, key: 'forte', name: bulk ? t('Forte') : t('Definido') },
    { min: 90, key: 'auge', name: t('No auge') },
  ];
  let i = 0;
  steps.forEach((st, idx) => { if (s >= st.min) i = idx; });
  return { key: steps[i].key, name: steps[i].name, next: steps[i + 1] ? { score: steps[i + 1].min, name: steps[i + 1].name } : null };
}

// Meta e objetivo do perfil, lidos como o resto do app (conta ou cópia do aparelho).
export function trainingProfile(profile) {
  const days = parseInt(profile?.weeklyGoal, 10);
  return { goal: profile?.meta || 'massa', weeklyGoal: days >= 1 && days <= 7 ? days : 5 };
}

let formCache = { at: 0, key: '', value: null };
const FORM_TTL_MS = 60_000;

// { score, target, this_week, weeks } ou null se não deu para calcular.
// Guarda por 1 minuto: o cartão da Arena e o do chefão usam o mesmo número.
export async function fetchHeroForm(weeklyGoal = 5) {
  const key = String(weeklyGoal);
  if (formCache.key === key && Date.now() - formCache.at < FORM_TTL_MS) return formCache.value;
  const { data, error } = await db.rpc('arena_my_form', { p_weekly_goal: weeklyGoal });
  if (error) throw error;
  formCache = { at: Date.now(), key, value: data || null };
  return formCache.value;
}

export function resetFormCache() {
  formCache = { at: 0, key: '', value: null };
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
