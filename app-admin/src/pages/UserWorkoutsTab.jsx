import { Fragment } from 'react';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { SEVERITY_BADGE, SEVERITY_LABEL } from '../lib/userDetailHelpers';

export default function UserWorkoutsTab({
  activePlan, workouts, expandedWorkoutId, workoutSets, setsLoading,
  onToggleWorkoutDetail, onExportTreinos, personalRecords, discomfortLogs,
}) {
  return (
    <div className="stack">
      <section>
        <h2 className="section-title">
          Plano de treino ativo {activePlan ? `— ${activePlan.name}` : ''}
        </h2>
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
                <thead><tr><th colSpan={4}>{day.dia} — {day.foco}</th></tr></thead>
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
                          <thead><tr><th>Exercício</th><th>Série</th><th>Carga</th><th>Reps</th><th>Concluída</th></tr></thead>
                          <tbody>
                            {workoutSets[w.id].map(s => (
                              <tr key={s.id}>
                                <td data-label="Exercício">{s.exercise_name}</td>
                                <td data-label="Série">{s.set_number}</td>
                                <td data-label="Carga">{s.carga ?? '—'}</td>
                                <td data-label="Reps">{s.reps ?? '—'}</td>
                                <td data-label="Concluída">{s.completed ? 'sim' : 'não'}</td>
                              </tr>
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
