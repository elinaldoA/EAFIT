const EMPTY_EXERCISE = { nome: '', series: '', reps: '', descanso: '', tecnica: '' };

function moveItem(list, from, to) {
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export default function ExerciseListEditor({ title, exercises, onChange }) {
  function updateField(idx, field, value) {
    onChange(exercises.map((ex, i) => (i === idx ? { ...ex, [field]: value } : ex)));
  }

  function addExercise() {
    onChange([...exercises, { ...EMPTY_EXERCISE }]);
  }

  function removeExercise(idx) {
    onChange(exercises.filter((_, i) => i !== idx));
  }

  function move(idx, delta) {
    const to = idx + delta;
    if (to < 0 || to >= exercises.length) return;
    onChange(moveItem(exercises, idx, to));
  }

  return (
    <div>
      <div className="exercise-list__title">{title}</div>
      {exercises.map((ex, idx) => (
        <div className="exercise-row" key={idx}>
          <input className="input" placeholder="Nome" aria-label="Nome" value={ex.nome} onChange={e => updateField(idx, 'nome', e.target.value)} />
          <input className="input" placeholder="Séries" aria-label="Séries" value={ex.series} onChange={e => updateField(idx, 'series', e.target.value)} />
          <input className="input" placeholder="Reps" aria-label="Reps" value={ex.reps} onChange={e => updateField(idx, 'reps', e.target.value)} />
          <input className="input" placeholder="Descanso" aria-label="Descanso" value={ex.descanso} onChange={e => updateField(idx, 'descanso', e.target.value)} />
          <input className="input" placeholder="Técnica" aria-label="Técnica" value={ex.tecnica} onChange={e => updateField(idx, 'tecnica', e.target.value)} />
          <div className="exercise-row__actions">
            <button type="button" className="icon-btn" title="Mover para cima" disabled={idx === 0} onClick={() => move(idx, -1)}>↑</button>
            <button type="button" className="icon-btn" title="Mover para baixo" disabled={idx === exercises.length - 1} onClick={() => move(idx, 1)}>↓</button>
            <button type="button" className="icon-btn" title="Remover" onClick={() => removeExercise(idx)}>✕</button>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn--small" onClick={addExercise}>+ Adicionar exercício</button>
    </div>
  );
}
