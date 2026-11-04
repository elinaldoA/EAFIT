import { Fragment, useRef, useState } from 'react';
import { PLAN_FILE_ACCEPT, readPlanFile, summarizePlan } from '../lib/workoutPlanFile';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { SEVERITY_BADGE, SEVERITY_LABEL, parseSetNumber } from '../lib/userDetailHelpers';

// Linha de uma série, com correção de carga/reps pelo suporte (quando o admin
// recebe onFix). Campo vazio apaga o valor.
function SetRow({ set, onFix }) {
  const [editing, setEditing] = useState(false);
  const [carga, setCarga] = useState('');
  const [reps, setReps] = useState('');
  const [busy, setBusy] = useState(false);
  const c = parseSetNumber(carga);
  const r = parseSetNumber(reps);

  function start() {
    setCarga(set.carga ?? '');
    setReps(set.reps ?? '');
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    await onFix(set, { carga: c.value, reps: r.value });
    setBusy(false);
    setEditing(false);
  }

  return (
    <tr>
      <td data-label="Exercício">{set.exercise_name}</td>
      <td data-label="Série">{set.set_number}</td>
      <td data-label="Carga">
        {editing ? <input className="input" style={{ width: 90 }} aria-label="Carga" value={carga} onChange={e => setCarga(e.target.value)} /> : set.carga ?? '—'}
      </td>
      <td data-label="Reps">
        {editing ? <input className="input" style={{ width: 90 }} aria-label="Reps" value={reps} onChange={e => setReps(e.target.value)} /> : set.reps ?? '—'}
      </td>
      <td data-label="Concluída">{set.completed ? 'sim' : 'não'}</td>
      {onFix && (
        <td data-label="">
          {editing ? (
            <div className="actions-row">
              <button className="btn btn--primary btn--small" disabled={busy || !c.ok || !r.ok} onClick={save}>Salvar</button>
              <button className="btn btn--ghost btn--small" disabled={busy} onClick={() => setEditing(false)}>Cancelar</button>
            </div>
          ) : <button className="btn btn--ghost btn--small" onClick={start}>Corrigir</button>}
        </td>
      )}
    </tr>
  );
}

// Importar um plano (.json exportado pelo painel) para este usuário: mostra o
// resumo e só grava depois de confirmar. Planos novos entram desativados, a
// menos que "ativar" esteja marcado (aí substitui o plano ativo atual).
function PlanImport({ onImportPlan }) {
  const fileRef = useRef(null);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [activate, setActivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    setParsed(null); setError('');
    if (!file) return;
    setReading(true);
    const res = await readPlanFile(file);
    setReading(false);
    if (res.error) setError(res.error); else setParsed(res.plan);
  }

  async function confirm() {
    setBusy(true);
    const ok = await onImportPlan(parsed, activate);
    setBusy(false);
    if (ok) setParsed(null);
  }

  const sum = parsed ? summarizePlan(parsed) : null;
  return (
    <div className="stack">
      <input ref={fileRef} type="file" accept={PLAN_FILE_ACCEPT} hidden onChange={handleFile} />
      <button className="btn btn--small" onClick={() => fileRef.current?.click()} disabled={busy || reading}>{reading ? 'Lendo o arquivo…' : 'Importar plano'}</button>
      <p className="user-detail__meta">Aceita PDF (com texto), planilha .xlsx, CSV, TXT ou o JSON exportado. Fichas em texto: uma linha por exercício, como “Supino 4x10”, separadas por Dia A/B/C ou dia da semana.</p>
      {error && <p className="form-msg form-msg--error">{error}</p>}
      {parsed && (
        <div className="stack">
          <p className="user-detail__meta">
            “{parsed.name}” — {sum.days} dia(s), {sum.exercises} exercício(s)
            {parsed.durationWeeks ? `, ${parsed.durationWeeks} semanas` : ''}.
          </p>
          <label>
            <input type="checkbox" checked={activate} onChange={e => setActivate(e.target.checked)} /> Ativar agora (substitui o plano ativo)
          </label>
          <div className="actions-row">
            <button className="btn btn--primary btn--small" disabled={busy} onClick={confirm}>Importar para este usuário</button>
            <button className="btn btn--ghost btn--small" disabled={busy} onClick={() => setParsed(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UserWorkoutsTab({
  activePlan, workouts, expandedWorkoutId, workoutSets, setsLoading,
  onToggleWorkoutDetail, onExportTreinos, personalRecords, discomfortLogs, onFixSet, onDeleteWorkout,
  onExportPlan, onImportPlan,
}) {
  return (
    <div className="stack">
      <section>
        <div className="page-header">
          <h2 className="section-title">
            Plano de treino ativo {activePlan ? `— ${activePlan.name}` : ''}
          </h2>
          {onExportPlan && (
            <button className="btn btn--small" onClick={onExportPlan} disabled={!activePlan}>Exportar plano (JSON)</button>
          )}
        </div>
        {onImportPlan && <PlanImport onImportPlan={onImportPlan} />}
        {!activePlan && <EmptyState icon="🏋️" label="Sem plano de treino ativo." />}
        {activePlan && (
          <div className="stack">
            {activePlan.start_date && (
              <p className="user-detail__meta">
                Vigência {activePlan.start_date} a {activePlan.end_date}
                {activePlan.duration_weeks ? ` (${activePlan.duration_weeks} semanas)` : ''}
              </p>
            )}
            {activePlan.plan_days.map(day => (
              <table className="resp-table" key={day.id}>
                <thead className="resp-table__title"><tr><th colSpan={4}>{day.dia} — {day.foco}</th></tr></thead>
                <thead><tr><th>Exercício</th><th>Séries</th><th>Reps</th><th>Descanso</th></tr></thead>
                <tbody>
                  {day.plan_exercises.map(ex => (
                    <tr key={ex.id}>
                      <td data-label="Exercício">{ex.is_post_workout ? '🔷 ' : ''}{ex.nome}</td>
                      <td data-label="Séries">{ex.series}</td>
                      <td data-label="Reps">{ex.reps}</td>
                      <td data-label="Descanso">{ex.descanso}</td>
                    </tr>
                  ))}
                  {day.plan_exercises.length === 0 && <tr><td colSpan={4}><EmptyState icon="💤" label="Dia de descanso." /></td></tr>}
                </tbody>
              </table>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="page-header">
          <h2 className="section-title">Histórico de treinos (últimos 20)</h2>
          <button className="btn btn--small" onClick={onExportTreinos} disabled={workouts.length === 0}>Exportar CSV</button>
        </div>
        <table className="resp-table">
          <thead><tr><th>Data</th><th>Dia</th><th>Concluído</th><th>Duração</th><th></th></tr></thead>
          <tbody>
            {workouts.map(w => (
              <Fragment key={w.id}>
                <tr>
                  <td data-label="Data">{w.workout_date}</td>
                  <td data-label="Dia">{w.day_of_week}</td>
                  <td data-label="Concluído">{w.completed ? 'sim' : 'não'}</td>
                  <td data-label="Duração">{w.duration_seconds ? `${Math.round(w.duration_seconds / 60)} min` : '—'}</td>
                  <td data-label="">
                    <button className="btn btn--ghost btn--small" onClick={() => onToggleWorkoutDetail(w.id)}>
                      {expandedWorkoutId === w.id ? 'Ocultar séries' : 'Ver séries'}
                    </button>
                    {onDeleteWorkout && (
                      <button className="btn btn--ghost btn--small" onClick={() => onDeleteWorkout(w)}>Apagar treino</button>
                    )}
                  </td>
                </tr>
                {expandedWorkoutId === w.id && (
                  <tr>
                    <td colSpan={5}>
                      {setsLoading && !workoutSets[w.id] && <Loading label="Carregando séries…" />}
                      {workoutSets[w.id] && workoutSets[w.id].length === 0 && (
                        <EmptyState icon="🔢" label="Sem séries registradas para este treino." />
                      )}
                      {workoutSets[w.id]?.length > 0 && (
                        <table className="resp-table">
                          <thead><tr><th>Exercício</th><th>Série</th><th>Carga</th><th>Reps</th><th>Concluída</th>{onFixSet && <th />}</tr></thead>
                          <tbody>
                            {workoutSets[w.id].map(s => (
                              <SetRow key={s.id} set={s} onFix={onFixSet && ((set, fields) => onFixSet(w.id, set, fields))} />
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {workouts.length === 0 && <tr><td colSpan={5}><EmptyState icon="🏋️" label="Sem treinos registrados." /></td></tr>}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="section-title">Recordes pessoais</h2>
        <table className="resp-table">
          <thead><tr><th>Exercício</th><th>Carga máxima</th><th>1RM estimado</th></tr></thead>
          <tbody>
            {personalRecords.map(p => (
              <tr key={p.exercise_name}>
                <td data-label="Exercício">{p.exercise_name}</td>
                <td data-label="Carga máxima">{p.carga}kg</td>
                <td data-label="1RM estimado">{p.oneRm ? `${Math.round(p.oneRm)}kg` : '—'}</td>
              </tr>
            ))}
            {personalRecords.length === 0 && <tr><td colSpan={3}><EmptyState icon="🏆" label="Sem recordes pessoais registrados." /></td></tr>}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="section-title">Registros de dor/desconforto</h2>
        <table className="resp-table">
          <thead><tr><th>Data</th><th>Exercício</th><th>Severidade</th><th>Nota</th></tr></thead>
          <tbody>
            {discomfortLogs.map(d => (
              <tr key={d.id}>
                <td data-label="Data">{d.log_date}</td>
                <td data-label="Exercício">{d.exercise_name}</td>
                <td data-label="Severidade"><span className={`badge ${SEVERITY_BADGE[d.severity] || ''}`}>{SEVERITY_LABEL[d.severity] || d.severity}</span></td>
                <td data-label="Nota">{d.note || '—'}</td>
              </tr>
            ))}
            {discomfortLogs.length === 0 && <tr><td colSpan={4}><EmptyState icon="🩹" label="Nenhum registro de dor ou desconforto." /></td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
