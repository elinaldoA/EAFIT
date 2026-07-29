import { db } from './supabase';
import { fetchWeightLogs } from './weightLog';
import { fetchWaterLogsRange } from './waterLog';
import { fetchAllDiscomfort } from './discomfort';
import { fetchUnlockedAchievements } from './achievements';

const EPOCH = '1970-01-01';

// Junta os dados do usuário em várias tabelas num único objeto — usado tanto
// pelo backup completo (JSON) quanto pelo resumo (CSV) e pelo relatório impresso.
export async function gatherUserData(userId) {
  const { data: workouts, error: wErr } = await db
    .from('workouts')
    .select('id, workout_date, day_of_week, completed, started_at, finished_at, duration_seconds')
    .eq('user_id', userId)
    .order('workout_date', { ascending: true });
  if (wErr) throw wErr;

  const workoutIds = (workouts || []).map(w => w.id);
  let exerciseSets = [];
  if (workoutIds.length) {
    const { data, error } = await db
      .from('exercise_sets')
      .select('workout_id, exercise_name, set_number, carga, reps, completed')
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

  const { data: photos, error: photosErr } = await db
    .from('progress_photos')
    .select('photo_date, note')
    .eq('user_id', userId)
    .order('photo_date', { ascending: true });
  if (photosErr) throw photosErr;

  const [weightLogs, waterLogs, discomfortReports, achievements] = await Promise.all([
    fetchWeightLogs(userId),
    fetchWaterLogsRange(userId, EPOCH),
    fetchAllDiscomfort(userId, 10000), // sem cap de 100 aqui — é backup completo, não o histórico exibido na tela
    fetchUnlockedAchievements(userId),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    workouts, exerciseSets,
    workoutPlans: plans, planDays, planExercises,
    weightLogs, progressPhotos: photos || [], waterLogs,
    discomfortReports, achievements,
  };
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
  const data = await gatherUserData(userId);
  downloadBlob(JSON.stringify(data, null, 2), `meu-plano-backup-${data.exportedAt.slice(0, 10)}.json`, 'application/json');
}

export async function exportSummaryCSV(userId) {
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

export async function printReport(userId) {
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
      <p>Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
      <div class="stats">
        <div class="stat"><b>${totalTreinos}</b>Treinos concluídos</div>
        <div class="stat"><b>${data.progressPhotos.length}</b>Fotos de progresso</div>
        <div class="stat"><b>${data.achievements.length}</b>Conquistas desbloqueadas</div>
      </div>
      <h2>Histórico de peso</h2>
      <table>
        <tr><th>Data</th><th>Peso (kg)</th></tr>
        ${data.weightLogs.map(w => `<tr><td>${w.log_date}</td><td>${w.peso}</td></tr>`).join('') || '<tr><td colspan="2">Sem registros</td></tr>'}
      </table>
    </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}
