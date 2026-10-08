import { db } from './supabase';
import { trackFeature } from './tracking';
import { fetchWeightLogs } from './weightLog';
import { fetchWaterLogsRange } from './waterLog';
import { fetchAllDiscomfort } from './discomfort';
import { fetchUnlockedAchievements } from './achievements';
import { fetchMeasurements } from './bodyMeasurements';
import { fetchCheckins } from './checkin';
import { fetchMyChallenges } from './challenges';
import { fetchMyFriendProfile, fetchMyFriends } from './friends';
import { fetchInbox } from './inbox';
import { fetchMyTrainer } from './trainer';
import { fetchMyGoals } from './trainerInsights';
import { fetchMyThread } from './trainerMessages';
import { fetchMyAppointments } from './trainerAppointments';

const PHOTO_BACKUP_TTL = 7 * 24 * 3600; // links das fotos no backup valem 7 dias

const EPOCH = '1970-01-01';

// Junta os dados do usuário em várias tabelas num único objeto — usado tanto
// pelo backup completo (JSON) quanto pelo resumo (CSV) e pelo relatório impresso.
export async function gatherUserData(userId) {
  const { data: workouts, error: wErr } = await db
    .from('workouts')
    .select('id, workout_date, day_of_week, completed, notes, rating, started_at, finished_at, duration_seconds')
    .eq('user_id', userId)
    .order('workout_date', { ascending: true });
  if (wErr) throw wErr;

  const workoutIds = (workouts || []).map(w => w.id);
  let exerciseSets = [];
  if (workoutIds.length) {
    const { data, error } = await db
      .from('exercise_sets')
      .select('workout_id, exercise_name, set_number, carga, reps, completed, duracao_min, distancia_km')
      .in('workout_id', workoutIds);
    if (error) throw error;
    exerciseSets = data || [];
  }

  const { data: plans, error: plansErr } = await db
    .from('workout_plans')
    .select('id, name, is_active, created_at')
    .eq('user_id', userId);
  if (plansErr) throw plansErr;

  const planIds = (plans || []).map(p => p.id);
  let planDays = [];
  if (planIds.length) {
    const { data, error } = await db
      .from('plan_days')
      .select('id, plan_id, dia, foco, order_index')
      .in('plan_id', planIds);
    if (error) throw error;
    planDays = data || [];
  }

  const planDayIds = planDays.map(d => d.id);
  let planExercises = [];
  if (planDayIds.length) {
    const { data, error } = await db
      .from('plan_exercises')
      .select('plan_day_id, nome, series, reps, descanso, tecnica, is_post_workout, order_index')
      .in('plan_day_id', planDayIds);
    if (error) throw error;
    planExercises = data || [];
  }

  const { data: photoRows, error: photosErr } = await db
    .from('progress_photos')
    .select('photo_date, note, storage_path, image_data')
    .eq('user_id', userId)
    .order('photo_date', { ascending: true });
  if (photosErr) throw photosErr;
  const photos = await withPhotoLinks(photoRows || []);

  const [weightLogs, waterLogs, discomfortReports, achievements] = await Promise.all([
    fetchWeightLogs(userId),
    fetchWaterLogsRange(userId, EPOCH),
    fetchAllDiscomfort(userId, 10000), // sem cap de 100 aqui — é backup completo, não o histórico exibido na tela
    fetchUnlockedAchievements(userId),
  ]);

  // Seções extras: melhor esforço. Se uma falhar (offline, migration pendente),
  // o backup sai sem ela e avisa em `incomplete` — nunca quebra o resto.
  const incomplete = [];
  const safe = async (name, fn, fallback) => {
    try { return await fn(); } catch { incomplete.push(name); return fallback; }
  };

  const [
    profile, workoutExercises, bodyMeasurements, dailyCheckins, challenges,
    friendProfile, friends, feedback, notifications, trainer, trainerGoals, trainerMessages, appointments,
  ] = await Promise.all([
    safe('profile', fetchProfile, null),
    safe('workoutExercises', () => fetchWorkoutExercises(workoutIds), []),
    safe('bodyMeasurements', () => fetchMeasurements(userId), []),
    safe('dailyCheckins', () => fetchCheckins(userId, EPOCH), []),
    safe('challenges', fetchMyChallenges, []),
    safe('friendProfile', fetchMyFriendProfile, null),
    safe('friends', fetchMyFriends, []),
    safe('feedback', () => fetchMyFeedback(userId), []),
    safe('notifications', () => fetchInbox(1000), []),
    safe('trainer', fetchMyTrainer, null),
    safe('trainerGoals', fetchMyGoals, null),
    safe('trainerMessages', () => fetchMyThread(1000), []),
    safe('appointments', fetchMyAppointments, []),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile,
    workouts, exerciseSets, workoutExercises,
    workoutPlans: plans, planDays, planExercises,
    weightLogs, bodyMeasurements, dailyCheckins,
    progressPhotos: photos, waterLogs,
    discomfortReports, achievements,
    challenges, friendProfile, friends,
    trainer, trainerGoals, trainerMessages, appointments,
    feedback, notifications,
    incomplete,
  };
}

// Conta e dados de perfil (nome, peso, altura, meta, preferências). Fica de
// fora tudo que é segredo (senha nunca chega ao app) — só o que o usuário preencheu.
async function fetchProfile() {
  const { data, error } = await db.auth.getUser();
  if (error) throw error;
  const u = data?.user;
  if (!u) throw new Error('sem usuário');
  return { email: u.email, createdAt: u.created_at, ...(u.user_metadata || {}) };
}

// Plano previsto de cada treino (séries/reps/descanso/técnica), em lotes.
async function fetchWorkoutExercises(workoutIds) {
  const out = [];
  for (let i = 0; i < workoutIds.length; i += 200) {
    const { data, error } = await db
      .from('exercise_logs')
      .select('workout_id, exercise_name, series, reps, rest_time, technique, is_post_workout')
      .in('workout_id', workoutIds.slice(i, i + 200));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

async function fetchMyFeedback(userId) {
  const { data, error } = await db
    .from('feedback')
    .select('kind, message, created_at, admin_reply, replied_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Foto nova vive no Storage privado: o backup leva o caminho e um link que vale
// 7 dias (baixe antes disso). Foto antiga já guarda a imagem no próprio registro.
async function withPhotoLinks(rows) {
  const paths = rows.filter(r => r.storage_path).map(r => r.storage_path);
  const links = {};
  if (paths.length) {
    try {
      const { data } = await db.storage.from('progress-photos').createSignedUrls(paths, PHOTO_BACKUP_TTL);
      (data || []).forEach(x => { if (x.signedUrl) links[x.path] = x.signedUrl; });
    } catch { /* sem link: o backup ainda traz data e nota */ }
  }
  return rows.map(r => ({
    photo_date: r.photo_date,
    note: r.note,
    ...(r.storage_path ? { storage_path: r.storage_path, url: links[r.storage_path] || null } : {}),
    ...(r.image_data ? { image_data: r.image_data } : {}),
  }));
}

export function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = v => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  rows.forEach(row => lines.push(headers.map(h => escape(row[h])).join(',')));
  return lines.join('\n');
}

export function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportBackupJSON(userId) {
  trackFeature('export');
  const data = await gatherUserData(userId);
  downloadBlob(JSON.stringify(data, null, 2), `meu-plano-backup-${data.exportedAt.slice(0, 10)}.json`, 'application/json');
}

export async function exportSummaryCSV(userId) {
  trackFeature('export');
  const data = await gatherUserData(userId);

  const byDate = {};
  function ensure(date) {
    if (!byDate[date]) byDate[date] = { data: date, treino_concluido: '', agua_ml: '', peso_kg: '' };
    return byDate[date];
  }
  data.workouts.forEach(w => { ensure(w.workout_date).treino_concluido = w.completed ? 'sim' : 'não'; });
  data.waterLogs.forEach(w => { ensure(w.log_date).agua_ml = w.amount_ml; });
  data.weightLogs.forEach(w => { ensure(w.log_date).peso_kg = w.peso; });

  const rows = Object.values(byDate).sort((a, b) => a.data.localeCompare(b.data));
  downloadBlob(toCSV(rows), `meu-plano-resumo-${data.exportedAt.slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
}

// win.document.write não escapa nada sozinho (diferente do JSX) — qualquer
// valor interpolado aqui vira HTML literal. Hoje só entram date/numeric do
// banco (baixo risco na prática), mas escapamos tudo por padrão pra que um
// campo de texto livre adicionado no futuro (nota, comentário) não vire XSS
// por descuido.
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export async function printReport(userId) {
  trackFeature('export');
  const data = await gatherUserData(userId);
  const totalTreinos = data.workouts.filter(w => w.completed).length;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`
    <html>
    <head>
      <meta charset="utf-8">
      <title>Relatório — Meu Plano</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 24px; color: #111; }
        h1 { font-size: 20px; }
        h2 { font-size: 15px; margin-top: 24px; }
        table { border-collapse: collapse; width: 100%; margin-top: 8px; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; font-size: 12px; text-align: left; }
        .stats { display: flex; gap: 16px; margin: 16px 0; }
        .stat { border: 1px solid #ccc; border-radius: 8px; padding: 10px 16px; text-align: center; }
        .stat b { display: block; font-size: 20px; }
      </style>
    </head>
    <body>
      <h1>Relatório de progresso — Meu Plano</h1>
      <p>Gerado em ${escapeHtml(new Date().toLocaleDateString('pt-BR'))}</p>
      <div class="stats">
        <div class="stat"><b>${escapeHtml(totalTreinos)}</b>Treinos concluídos</div>
        <div class="stat"><b>${escapeHtml(data.progressPhotos.length)}</b>Fotos de progresso</div>
        <div class="stat"><b>${escapeHtml(data.achievements.length)}</b>Conquistas desbloqueadas</div>
      </div>
      <h2>Histórico de peso</h2>
      <table>
        <tr><th>Data</th><th>Peso (kg)</th></tr>
        ${data.weightLogs.map(w => `<tr><td>${escapeHtml(w.log_date)}</td><td>${escapeHtml(w.peso)}</td></tr>`).join('') || '<tr><td colspan="2">Sem registros</td></tr>'}
      </table>
    </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}
