import { db } from './supabase';

export const METAS = ['massa', 'forca', 'emagrecer', 'definicao', 'saude', 'resistencia'];
export const NIVEIS = ['iniciante', 'intermediario', 'avancado'];

// Espelha os ids de app-react/src/lib/achievements.js (BADGES) — os dois apps
// não compartilham build, então o rótulo é duplicado aqui só pra exibição.
export const BADGE_LABELS = {
  streak_3: '🔥 Sequência de 3 dias', streak_7: '🔥🔥 Sequência de 7 dias', streak_30: '🔥🔥🔥 Sequência de 30 dias',
  streak_14: '🔥🔥 Sequência de 14 dias',
  workouts_25: '💪 25 treinos concluídos', workouts_200: '👑 200 treinos concluídos',
  photo_5: '🖼️ 5 fotos de progresso', weight_30: '📉 30 registros de peso',
  workouts_10: '💪 10 treinos concluídos', workouts_50: '🏋️ 50 treinos concluídos', workouts_100: '🏆 100 treinos concluídos',
  photo_first: '📸 Primeira foto de progresso',
  weight_10: '⚖️ 10 registros de peso',
  halloween_2026: '🎃 Treino das Bruxas 2026',
  novembro_azul_2026: '💙 Novembro Azul 2026',
  outubro_rosa_2026: '💗 Outubro Rosa 2026',
};

// Conquistas de temporada têm uma por ano (outubro_rosa_<ano>, halloween_<ano>, novembro_azul_<ano>, ver
// app-react/src/lib/achievements.js): anos sem rótulo acima saem pelo padrão.
export function badgeLabel(id, labels = BADGE_LABELS) {
  if (labels[id]) return labels[id];
  const halloween = /^halloween_(\d{4})$/.exec(id || '');
  if (halloween) return `🎃 Treino das Bruxas ${halloween[1]}`;
  const rosa = /^outubro_rosa_(\d{4})$/.exec(id || '');
  if (rosa) return `💗 Outubro Rosa ${rosa[1]}`;
  const azul = /^novembro_azul_(\d{4})$/.exec(id || '');
  return azul ? `💙 Novembro Azul ${azul[1]}` : id;
}

export const SEVERITY_BADGE = { leve: 'badge--ok', moderada: 'badge--warning', forte: 'badge--danger', lesao: 'badge--danger' };
export const SEVERITY_LABEL = { leve: 'Leve', moderada: 'Moderada', forte: 'Forte', lesao: 'Lesão' };

// Formulário da aba Perfil a partir do user_metadata, com os mesmos campos que
// o app grava em Perfil (Dados pessoais, Meu corpo e Metas).
export function profileFormFromMetadata(md = {}) {
  const str = v => (v === undefined || v === null ? '' : String(v));
  return {
    nome: str(md.nome), sobrenome: str(md.sobrenome), apelido: str(md.apelido),
    sexo: str(md.sexo), idade: str(md.idade), peso: str(md.peso), altura: str(md.altura),
    meta: md.meta || 'massa', nivel: md.nivel || 'intermediario', pesoAlvo: str(md.pesoAlvo),
    weeklyGoal: str(md.weeklyGoal), macroAgua: str(md.macroAgua),
  };
}

// Metas em branco não são gravadas: no app, sem valor = padrão (5 treinos por
// semana, água calculada pelo peso); gravar '' trocaria o padrão por nada.
export function profileFieldsToSave(form) {
  const fields = { ...form };
  for (const k of ['weeklyGoal', 'macroAgua']) if (String(fields[k] ?? '').trim() === '') delete fields[k];
  return fields;
}

export function computeImc(peso, altura) {
  const p = parseFloat(peso);
  const a = parseFloat(altura) / 100;
  if (!(p > 0) || !(a > 0)) return null;
  return Math.round((p / (a * a)) * 10) / 10;
}

// Mesmas chaves e textos de app-react/src/components/ProfilePreferencesSection.jsx
// (NOTIFY_PREFS). Sem valor gravado = ligado (isNotifyEnabled do app).
export const NOTIFY_LABELS = {
  notifyEngagement: 'Lembretes e incentivos para treinar',
  notifyStreakRisk: 'Sequência em risco',
  notifyInactivity: 'Voltar a treinar',
  notifyWeeklySummary: 'Resumo semanal',
  notifyWeightUpdate: 'Atualizar peso',
  notifyRecords: 'Recordes e conquistas',
  notifyDiscomfortFollowup: 'Follow-up de desconforto',
};

const LANGS = { pt: 'Português', en: 'Inglês' };
const COACH_TONES = { animado: 'animado', zoeira: 'zoeira', calmo: 'calmo' };
const COACH_FREQ = { full: 'fala tudo', light: 'só o essencial', free: 'à vontade' };

const brDay = d => String(d).slice(0, 10).split('-').reverse().join('/');

// O que o app grava na conta além do formulário, em linhas [rótulo, valor]
// para a ficha (aba Perfil → Dados do app).
export function describeAppData(md = {}, detail = {}) {
  const rows = [];
  rows.push(['E-mail confirmado', detail.email_confirmed_at ? `sim, em ${formatDate(detail.email_confirmed_at)}` : 'não']);
  rows.push(['Idioma do app', LANGS[md.lang] || (md.lang ? md.lang : 'Português (padrão)')]);

  const imc = computeImc(md.peso, md.altura);
  rows.push(['IMC', imc == null ? '—' : String(imc).replace('.', ',')]);

  rows.push(['Treinos por semana (meta)', md.weeklyGoal ? String(md.weeklyGoal) : '5 (padrão)']);
  const peso = parseFloat(md.peso);
  const auto = peso > 0 ? Math.round(peso * 0.035 * 10) / 10 : null;
  rows.push(['Meta de água', md.macroAgua
    ? `${String(md.macroAgua).replace('.', ',')} L por dia (definida pelo usuário)`
    : auto ? `${String(auto).replace('.', ',')} L por dia (calculada pelo peso)` : '—']);

  rows.push(['Horário de treino', md.trainingHour === undefined || md.trainingHour === null || md.trainingHour === ''
    ? 'não informado' : `por volta das ${String(md.trainingHour).padStart(2, '0')}h`]);

  const off = Object.entries(NOTIFY_LABELS).filter(([k]) => md[k] === false).map(([, label]) => label);
  rows.push(['Notificações', off.length === 0 ? 'todas ligadas' : `desligadas: ${off.join(', ')}`]);
  rows.push(['E-mails de resumo e novidades', md.notifyEmail === false ? 'desligados' : 'ligados']);

  rows.push(['Treinador por voz', md.coachEnabled
    ? ['ligado', COACH_TONES[md.coachTone] && `tom ${COACH_TONES[md.coachTone]}`,
      COACH_FREQ[md.coachFrequency], Number.isFinite(md.coachRate) && `velocidade ${String(md.coachRate).replace('.', ',')}x`]
      .filter(Boolean).join(' · ')
    : 'desligado']);

  const pauses = (Array.isArray(md.pauses) ? md.pauses : []).filter(p => p?.from && p?.to);
  rows.push(['Pausas', pauses.length === 0 ? 'nenhuma'
    : pauses.slice(-3).reverse().map(p => `${brDay(p.from)} a ${brDay(p.to)}`).join(' · ')
      + (pauses.length > 3 ? ` (+${pauses.length - 3} anteriores)` : '')]);
  return rows;
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

export async function callAdminAction(action, targetUserId, extra = {}) {
  const { data, error } = await db.functions.invoke('admin-users', {
    body: { action, targetUserId, ...extra },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

// Epley — mesma fórmula de app-react/src/lib/records.js (sem pacote
// compartilhado entre os dois apps, duplicação deliberada).
export function estimateOneRepMax(weight, reps) {
  const w = parseFloat(weight);
  const r = parseFloat(reps);
  if (!Number.isFinite(w) || !Number.isFinite(r) || r <= 0) return null;
  if (r === 1) return w;
  return w * (1 + r / 30);
}

// personal_records (tabela) nunca foi escrita por nenhum código — PRs são
// sempre calculados on-the-fly a partir de exercise_sets, igual ao app-react.
export function computePersonalRecords(sets) {
  const bestByExercise = new Map();
  for (const s of sets) {
    const carga = parseFloat(s.carga);
    if (!Number.isFinite(carga)) continue;
    const oneRm = estimateOneRepMax(s.carga, s.reps);
    const prev = bestByExercise.get(s.exercise_name);
    if (!prev || carga > prev.carga) {
      bestByExercise.set(s.exercise_name, { exercise_name: s.exercise_name, carga, oneRm: prev ? Math.max(prev.oneRm ?? 0, oneRm ?? 0) : oneRm });
    } else if (oneRm !== null && oneRm > (prev.oneRm ?? 0)) {
      prev.oneRm = oneRm;
    }
  }
  return [...bestByExercise.values()].sort((a, b) => b.carga - a.carga).slice(0, 12);
}

export async function callGeneratePlan(targetUserId) {
  const { data, error } = await db.functions.invoke('admin-generate-plan', {
    body: { kind: 'workout', targetUserId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

// Fotos novas ficam no Storage privado (storage_path) e precisam de URL
// assinada; as antigas trazem a imagem em image_data. Devolve as fotos com
// image_data pronto para o <img>; sem URL (falha ao assinar), fica null.
const PHOTO_URL_TTL = 3600;

export async function withSignedPhotos(rows) {
  const list = rows || [];
  const paths = list.filter(r => r.storage_path).map(r => r.storage_path);
  const links = {};
  if (paths.length) {
    try {
      const { data } = await db.storage.from('progress-photos').createSignedUrls(paths, PHOTO_URL_TTL);
      (data || []).forEach(x => { if (x.signedUrl) links[x.path] = x.signedUrl; });
    } catch { /* sem link: a foto aparece só com data e nota */ }
  }
  return list.map(r => ({ ...r, image_data: r.storage_path ? links[r.storage_path] || null : r.image_data }));
}

// Correções de suporte no histórico de treino. O admin já tem acesso total a
// workouts/exercise_sets pela policy "admin full access"; aqui só se garante
// que toda correção fica na auditoria.
async function audit(adminId, userId, action, details) {
  const { error } = await db.from('admin_audit_log').insert({ admin_id: adminId, target_user_id: userId, action, details });
  if (error) console.error('audit log:', error.message);
}

// Aceita vírgula decimal; vazio vira null (apaga o valor); inválido/negativo é recusado.
export function parseSetNumber(raw) {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (s === '') return { ok: true, value: null };
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 2000 ? { ok: true, value: n } : { ok: false };
}

export async function fixWorkoutSet(set, fields, adminId, userId) {
  const { error } = await db.from('exercise_sets')
    .update({ ...fields, updated_at: new Date().toISOString() }).eq('id', set.id);
  if (error) throw error;
  await audit(adminId, userId, 'fixWorkoutSet', {
    exercise: set.exercise_name, set: set.set_number,
    from: { carga: set.carga, reps: set.reps }, to: fields,
  });
}

// Apaga o treino e as séries dele (exercise_sets/exercise_logs caem em cascata).
export async function deleteWorkout(workout, adminId, userId) {
  const { error } = await db.from('workouts').delete().eq('id', workout.id);
  if (error) throw error;
  await audit(adminId, userId, 'deleteWorkout', { workout_date: workout.workout_date, day: workout.day_of_week });
}
