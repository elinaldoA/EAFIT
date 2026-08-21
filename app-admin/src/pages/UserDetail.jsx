import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/supabase';
import { useAdminAuth } from '../context/AdminAuthContext';
import { toCsv, downloadCsv } from '../lib/csv';
import Loading from '../components/Loading';
import { formatDate, callAdminAction, computePersonalRecords, callGeneratePlan } from '../lib/userDetailHelpers';
import UserProfileTab from './UserProfileTab';
import UserWorkoutsTab from './UserWorkoutsTab';
import UserActionsTab from './UserActionsTab';

export default function UserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { adminUser } = useAdminAuth();

  const [detail, setDetail] = useState(null);
  const [activePlan, setActivePlan] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [waterLogs, setWaterLogs] = useState([]);
  const [weightLogs, setWeightLogs] = useState([]);
  const [personalRecords, setPersonalRecords] = useState([]);
  const [discomfortLogs, setDiscomfortLogs] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [progressPhotos, setProgressPhotos] = useState([]);
  const [pushCount, setPushCount] = useState(0);
  const [expandedWorkoutId, setExpandedWorkoutId] = useState(null);
  const [workoutSets, setWorkoutSets] = useState({});
  const [setsLoading, setSetsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('perfil');
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [recoveryLink, setRecoveryLink] = useState('');
  const [form, setForm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: userRows, error: userErr }, plan, w, wa, we, allWorkoutIds, disc, ach, photos, push] = await Promise.all([
        db.rpc('admin_get_user', { target: id }),
        db.from('workout_plans')
          .select('id, name, start_date, end_date, duration_weeks, plan_days(id, dia, foco, order_index, plan_exercises(id, nome, series, reps, descanso, tecnica, is_post_workout, order_index))')
          .eq('user_id', id).eq('is_active', true).maybeSingle(),
        db.from('workouts').select('id, workout_date, day_of_week, completed, duration_seconds').eq('user_id', id).order('workout_date', { ascending: false }).limit(20),
        db.from('water_logs').select('id, log_date, amount_ml').eq('user_id', id).order('log_date', { ascending: false }).limit(20),
        db.from('weight_logs').select('id, log_date, weight').eq('user_id', id).order('log_date', { ascending: false }).limit(20),
        db.from('workouts').select('id').eq('user_id', id),
        db.from('exercise_discomfort').select('id, exercise_name, log_date, severity, note').eq('user_id', id).order('log_date', { ascending: false }).limit(30),
        db.from('achievements').select('id, badge_id, unlocked_at').eq('user_id', id).order('unlocked_at', { ascending: false }),
        db.from('progress_photos').select('id, photo_date, image_data, note').eq('user_id', id).order('photo_date', { ascending: false }).limit(12),
        db.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', id),
      ]);
      if (userErr) throw userErr;

      const allIds = (allWorkoutIds.data || []).map(x => x.id);
      let personalRecordsComputed = [];
      if (allIds.length) {
        const { data: allSets, error: setsErr } = await db
          .from('exercise_sets').select('exercise_name, carga, reps')
          .in('workout_id', allIds).eq('completed', true).not('carga', 'is', null);
        if (setsErr) throw setsErr;
        personalRecordsComputed = computePersonalRecords(allSets || []);
      }
      const row = userRows?.[0];
      if (!row) throw new Error('Usuário não encontrado.');
      setDetail(row);
      const md = row.user_metadata || {};
      setForm({
        nome: md.nome || '', sobrenome: md.sobrenome || '', apelido: md.apelido || '',
        sexo: md.sexo || '', idade: md.idade || '', peso: md.peso || '', altura: md.altura || '',
        meta: md.meta || 'massa', nivel: md.nivel || 'intermediario', pesoAlvo: md.pesoAlvo || '',
      });
      const rawPlan = plan.data;
      setActivePlan(rawPlan ? {
        ...rawPlan,
        plan_days: [...(rawPlan.plan_days || [])]
          .sort((a, b) => a.order_index - b.order_index)
          .map(d => ({ ...d, plan_exercises: [...(d.plan_exercises || [])].sort((a, b) => a.order_index - b.order_index) })),
      } : null);
      setWorkouts(w.data || []);
      setWaterLogs(wa.data || []);
      setWeightLogs(we.data || []);
      setPersonalRecords(personalRecordsComputed);
      setDiscomfortLogs(disc.data || []);
      setAchievements(ach.data || []);
      setProgressPhotos(photos.data || []);
      setPushCount(push.count || 0);
      setExpandedWorkoutId(null);
      setWorkoutSets({});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function runAction(action, extra, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    setActionMsg('');
    setRecoveryLink('');
    try {
      const result = await callAdminAction(action, id, extra);
      if (action === 'deleteUser') {
        navigate('/users');
        return;
      }
      if (action === 'resetPassword' && result?.actionLink) {
        setRecoveryLink(result.actionLink);
      }
      setActionMsg('Ação concluída.');
      await load();
    } catch (err) {
      setActionMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    await runAction('updateProfile', { fields: form });
  }

  // Vai direto em public.profiles (permitido pela policy "admin full access"
  // já existente) em vez de passar pela edge function admin-users — não é
  // uma ação da GoTrue Admin API, só um update de coluna comum.
  async function handleToggleAdmin() {
    const makeAdmin = !detail.is_admin;
    if (!window.confirm(makeAdmin ? 'Tornar este usuário admin?' : 'Remover acesso de admin deste usuário?')) return;
    setBusy(true);
    setActionMsg('');
    try {
      const { error } = await db.from('profiles').update({ is_admin: makeAdmin }).eq('id', id);
      if (error) throw error;
      await db.from('admin_audit_log').insert({
        admin_id: adminUser.id, target_user_id: id,
        action: makeAdmin ? 'promoteAdmin' : 'demoteAdmin', details: null,
      });
      setActionMsg('Ação concluída.');
      await load();
    } catch (err) {
      setActionMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleGeneratePlan(confirmMsg) {
    if (!window.confirm(confirmMsg)) return;
    setBusy(true);
    setActionMsg('');
    try {
      await callGeneratePlan(id);
      setActionMsg('Ação concluída.');
      await load();
    } catch (err) {
      setActionMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleWorkoutDetail(workoutId) {
    if (expandedWorkoutId === workoutId) {
      setExpandedWorkoutId(null);
      return;
    }
    setExpandedWorkoutId(workoutId);
    if (workoutSets[workoutId]) return;
    setSetsLoading(true);
    try {
      const { data, error } = await db.from('exercise_sets')
        .select('id, exercise_name, set_number, carga, reps, completed')
        .eq('workout_id', workoutId)
        .order('exercise_name', { ascending: true })
        .order('set_number', { ascending: true });
      if (error) throw error;
      setWorkoutSets(prev => ({ ...prev, [workoutId]: data || [] }));
    } catch (err) {
      setActionMsg(`Erro: ${err.message}`);
    } finally {
      setSetsLoading(false);
    }
  }

  function exportTreinos() {
    downloadCsv(`treinos_${id}.csv`, toCsv(workouts, [
      { key: 'workout_date', label: 'Data' }, { key: 'day_of_week', label: 'Dia' },
      { key: 'completed', label: 'Concluido' }, { key: 'duration_seconds', label: 'DuracaoSegundos' },
    ]));
  }

  if (loading) return <Loading />;
  if (error) return <p className="form-msg form-msg--error">{error}</p>;

  const isBanned = detail.banned_until && new Date(detail.banned_until) > new Date();
  const md = detail.user_metadata || {};
  const hasProfile = Number(md.peso) > 0 && Number(md.altura) > 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{detail.email}</h1>
          <p className="user-detail__meta">
            Criado em {formatDate(detail.created_at)} · Último login {formatDate(detail.last_sign_in_at)}
            {' · '}{pushCount > 0 ? `📲 ${pushCount} dispositivo(s) com push ativo` : '📴 sem push ativo'}
            {detail.is_admin && <span className="badge badge--admin">admin</span>}
            {isBanned && <span className="badge badge--danger">banido</span>}
          </p>
        </div>
      </div>

      <div className="tabs">
        {['perfil', 'treinos', 'acoes'].map(t => (
          <button
            key={t}
            className={`tabs__btn ${tab === t ? 'tabs__btn--active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'perfil' ? 'Perfil' : t === 'treinos' ? 'Treinos' : 'Ações'}
          </button>
        ))}
      </div>

      {actionMsg && <p className={`form-msg ${actionMsg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{actionMsg}</p>}

      {tab === 'perfil' && (
        <UserProfileTab
          form={form} setForm={setForm} busy={busy} onSaveProfile={handleSaveProfile}
          achievements={achievements} progressPhotos={progressPhotos}
          weightLogs={weightLogs} waterLogs={waterLogs}
        />
      )}

      {tab === 'treinos' && (
        <UserWorkoutsTab
          activePlan={activePlan} workouts={workouts}
          expandedWorkoutId={expandedWorkoutId} workoutSets={workoutSets} setsLoading={setsLoading}
          onToggleWorkoutDetail={toggleWorkoutDetail} onExportTreinos={exportTreinos}
          personalRecords={personalRecords} discomfortLogs={discomfortLogs}
        />
      )}

      {tab === 'acoes' && (
        <UserActionsTab
          detail={detail} adminUser={adminUser} busy={busy} recoveryLink={recoveryLink}
          isBanned={isBanned} hasProfile={hasProfile}
          onRunAction={runAction} onToggleAdmin={handleToggleAdmin} onGeneratePlan={handleGeneratePlan}
        />
      )}
    </div>
  );
}
