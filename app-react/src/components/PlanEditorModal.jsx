import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../lib/modalRoot';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { useToast } from '../context/useToast';
import { fmtDate, daysUntil } from '../lib/utils';
import {
  listPlans, createPlan, setActivePlan, renamePlan, deletePlan, updatePlanSuccessors,
  fetchPlanDays, updatePlanDay, addExercise, updateExercise, deleteExercise, reorderExercises,
} from '../lib/workoutPlans';

const WEEK_ORDER = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function PlanRow({ plan, allPlans, onSetActive, onRename, onDelete, onUpdateSuccessors }) {
  const [name, setName] = useState(plan.name);
  useEffect(() => { setName(plan.name); }, [plan.name]);

  const daysLeft = plan.end_date ? daysUntil(plan.end_date) : null;
  const otherPlans = allPlans.filter(p => p.id !== plan.id);

  return (
    <div className={`plan-row${plan.is_active ? ' plan-row--active' : ''}`}>
      <div className="plan-row__main">
        <input
          className="input input--sm plan-row__name"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name !== plan.name) onRename(name); }}
        />
        {plan.is_active ? (
          <span className="plan-row__badge">Ativo</span>
        ) : (
          <button type="button" className="btn btn--outline btn--sm" onClick={onSetActive}>Ativar</button>
        )}
        <button type="button" className="plan-row__del" onClick={onDelete} aria-label="Excluir plano">✕</button>
      </div>

      {plan.end_date && (
        <p className="plan-row__cycle">
          {daysLeft >= 0 ? `Ciclo termina em ${fmtDate(plan.end_date)} (faltam ${daysLeft}d)` : `Ciclo vencido em ${fmtDate(plan.end_date)}`}
        </p>
      )}

      <div className="plan-row__successors">
        <label className="plan-row__successor-field">
          Próximo (progressão)
          <select
            className="input input--sm"
            value={plan.next_plan_id || ''}
            onChange={e => onUpdateSuccessors({ nextPlanId: e.target.value, regressionPlanId: plan.regression_plan_id })}
          >
            <option value="">Nenhum</option>
            {otherPlans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="plan-row__successor-field">
          Recuperação (se estagnar)
          <select
            className="input input--sm"
            value={plan.regression_plan_id || ''}
            onChange={e => onUpdateSuccessors({ nextPlanId: plan.next_plan_id, regressionPlanId: e.target.value })}
          >
            <option value="">Nenhum</option>
            {otherPlans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

function FocoInput({ initial, onSave }) {
  const [value, setValue] = useState(initial);
  useEffect(() => { setValue(initial); }, [initial]);
  return (
    <input
      className="input input--sm"
      placeholder="Foco do dia (ex.: Peito / Ombro / Tríceps)"
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => onSave(value)}
    />
  );
}

function MoveButtons({ canUp, canDown, onMove }) {
  return (
    <div className="plan-ex-row__move">
      <button type="button" disabled={!canUp} onClick={() => onMove(-1)} aria-label="Mover para cima">▲</button>
      <button type="button" disabled={!canDown} onClick={() => onMove(1)} aria-label="Mover para baixo">▼</button>
    </div>
  );
}

function ExerciseRow({ ex, canUp, canDown, onMove, onChange, onDelete }) {
  const [local, setLocal] = useState(ex);
  // Ressincroniza só ao trocar de exercício (por id) — incluir `ex` inteiro
  // resetaria `local` a cada render do pai, descartando edição em andamento
  // antes do onBlur salvar.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setLocal(ex); }, [ex.id]);

  function save(field) {
    if (local[field] !== ex[field]) onChange(ex.id, { [field]: local[field] });
  }

  return (
    <div className="plan-ex-row">
      <MoveButtons canUp={canUp} canDown={canDown} onMove={onMove} />
      <div className="plan-ex-row__fields">
        <input className="input input--sm plan-ex-row__name" placeholder="Exercício" value={local.nome}
          onChange={e => setLocal(l => ({ ...l, nome: e.target.value }))} onBlur={() => save('nome')} />
        <div className="plan-ex-row__nums">
          <input className="input input--sm" placeholder="Séries" value={local.series}
            onChange={e => setLocal(l => ({ ...l, series: e.target.value }))} onBlur={() => save('series')} />
          <input className="input input--sm" placeholder="Reps" value={local.reps}
            onChange={e => setLocal(l => ({ ...l, reps: e.target.value }))} onBlur={() => save('reps')} />
          <input className="input input--sm" placeholder="Descanso" value={local.descanso}
            onChange={e => setLocal(l => ({ ...l, descanso: e.target.value }))} onBlur={() => save('descanso')} />
        </div>
        <input className="input input--sm" placeholder="Técnica" value={local.tecnica}
          onChange={e => setLocal(l => ({ ...l, tecnica: e.target.value }))} onBlur={() => save('tecnica')} />
      </div>
      <button type="button" className="plan-ex-row__del" onClick={() => onDelete(ex.id)} aria-label="Remover exercício">✕</button>
    </div>
  );
}

export default function PlanEditorModal({ onClose }) {
  const { user } = useAuth();
  const { refreshPlan } = useWorkout();
  const toast = useToast();

  const [tab, setTab] = useState('planos');
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [newPlanName, setNewPlanName] = useState('');
  const [showNewPlanForm, setShowNewPlanForm] = useState(false);

  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [days, setDays] = useState([]);
  const [loadingDays, setLoadingDays] = useState(false);
  const [selectedDay, setSelectedDay] = useState('Segunda');

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  async function loadPlans(preferId) {
    setLoadingPlans(true);
    try {
      const list = await listPlans(user.id);
      setPlans(list);
      const target = (preferId && list.some(p => p.id === preferId))
        ? preferId
        : (list.find(p => p.is_active) || list[0])?.id;
      if (target) setSelectedPlanId(target);
    } catch (err) {
      console.error('loadPlans:', err);
      toast('⚠️ Erro ao carregar planos');
    } finally {
      setLoadingPlans(false);
    }
  }

  useEffect(() => {
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reloadDays(planId = selectedPlanId) {
    if (!planId) return;
    const d = await fetchPlanDays(planId);
    setDays(d);
    if (planId === plans.find(p => p.is_active)?.id) await refreshPlan();
  }

  useEffect(() => {
    if (!selectedPlanId) return;
    (async () => {
      setLoadingDays(true);
      try {
        const d = await fetchPlanDays(selectedPlanId);
        setDays(d);
      } catch (err) {
        console.error('fetchPlanDays:', err);
        toast('⚠️ Erro ao carregar dias do plano');
      } finally {
        setLoadingDays(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlanId]);

  const day = days.find(d => d.dia === selectedDay);

  async function handleCreatePlan(copy) {
    const name = newPlanName.trim();
    if (!name) return;
    try {
      const plan = await createPlan(user.id, name, copy ? selectedPlanId : null);
      setNewPlanName('');
      setShowNewPlanForm(false);
      await loadPlans(plan.id);
      toast('✅ Plano criado');
    } catch (err) {
      console.error('createPlan:', err);
      toast('⚠️ Erro ao criar plano');
    }
  }

  async function handleSetActive(planId) {
    const plan = plans.find(p => p.id === planId);
    const input = window.prompt(
      'Duração deste ciclo em semanas (deixe em branco para sem prazo):',
      plan?.duration_weeks ?? ''
    );
    if (input === null) return;

    const weeks = input.trim() ? parseInt(input, 10) : null;
    if (input.trim() && (!Number.isFinite(weeks) || weeks <= 0)) {
      toast('⚠️ Duração inválida');
      return;
    }

    try {
      await setActivePlan(user.id, planId, weeks);
      await loadPlans(planId);
      await refreshPlan();
      toast('✅ Plano ativado');
    } catch (err) {
      console.error('setActivePlan:', err);
      toast('⚠️ Erro ao ativar plano');
    }
  }

  async function handleUpdateSuccessors(planId, patch) {
    try {
      await updatePlanSuccessors(planId, patch);
      await loadPlans(selectedPlanId);
    } catch (err) {
      console.error('updatePlanSuccessors:', err);
      toast('⚠️ Erro ao salvar encadeamento do plano');
    }
  }

  async function handleRename(planId, name) {
    try {
      await renamePlan(planId, name.trim());
      const wasActive = plans.find(p => p.id === planId)?.is_active;
      await loadPlans(selectedPlanId);
      if (wasActive) await refreshPlan();
    } catch (err) {
      console.error('renamePlan:', err);
      toast('⚠️ Erro ao renomear plano');
    }
  }

  async function handleDeletePlan(planId) {
    const plan = plans.find(p => p.id === planId);
    if (plan?.is_active) { toast('Ative outro plano antes de excluir este'); return; }
    if (plans.length <= 1) { toast('Você precisa de pelo menos um plano'); return; }
    if (!window.confirm(`Excluir o plano "${plan?.name}"? Essa ação não pode ser desfeita.`)) return;
    try {
      await deletePlan(planId, user.id);
      await loadPlans();
      toast('🗑️ Plano excluído');
    } catch (err) {
      console.error('deletePlan:', err);
      toast('⚠️ Erro ao excluir plano');
    }
  }

  async function handleFocoBlur(value) {
    if (!day || value === day.foco) return;
    try {
      await updatePlanDay(day.id, { foco: value });
      await reloadDays();
    } catch (err) {
      console.error('updatePlanDay:', err);
      toast('⚠️ Erro ao salvar foco do dia');
    }
  }

  async function handleAddExercise(isPost) {
    if (!day) return;
    try {
      const orderIndex = isPost ? day.pos.length : day.exercicios.length;
      await addExercise(day.id, {
        nome: isPost ? 'Novo item' : 'Novo exercício',
        series: '3', reps: isPost ? '12-15' : '10-12',
        descanso: isPost ? '45s' : '60s', tecnica: '', is_post_workout: isPost,
      }, orderIndex);
      await reloadDays();
    } catch (err) {
      console.error('addExercise:', err);
      toast('⚠️ Erro ao adicionar exercício');
    }
  }

  async function handleUpdateExercise(id, patch) {
    try {
      await updateExercise(id, patch, user.id);
      await reloadDays();
    } catch (err) {
      console.error('updateExercise:', err);
      toast('⚠️ Erro ao salvar exercício');
    }
  }

  async function handleDeleteExercise(id) {
    try {
      await deleteExercise(id);
      await reloadDays();
    } catch (err) {
      console.error('deleteExercise:', err);
      toast('⚠️ Erro ao remover exercício');
    }
  }

  async function handleMove(isPost, id, direction) {
    const list = isPost ? day.pos : day.exercicios;
    const idx = list.findIndex(e => e.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return;
    try {
      await reorderExercises([
        { id: list[idx].id, order_index: swapIdx },
        { id: list[swapIdx].id, order_index: idx },
      ]);
      await reloadDays();
    } catch (err) {
      console.error('reorderExercises:', err);
      toast('⚠️ Erro ao reordenar');
    }
  }

  return createPortal(
    <div className="plan-modal" role="dialog" aria-modal="true">
      <div className="plan-modal__backdrop" onClick={onClose} />
      <div className="plan-modal__panel">
        <div className="plan-modal__header">
          <h2 className="plan-modal__title">Editar treino</h2>
          <button type="button" className="plan-modal__close" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>

        <div className="plan-modal__tabs">
          <button type="button" className={`plan-modal__tab${tab === 'planos' ? ' active' : ''}`} onClick={() => setTab('planos')}>Planos</button>
          <button type="button" className={`plan-modal__tab${tab === 'editar' ? ' active' : ''}`} onClick={() => setTab('editar')}>Editar dia</button>
        </div>

        <div className="plan-modal__body">
          {tab === 'planos' && (
            <div className="plan-list">
              {loadingPlans ? <p className="dash-empty">Carregando…</p> : plans.map(p => (
                <PlanRow
                  key={p.id} plan={p} allPlans={plans}
                  onSetActive={() => handleSetActive(p.id)}
                  onRename={name => handleRename(p.id, name)}
                  onDelete={() => handleDeletePlan(p.id)}
                  onUpdateSuccessors={patch => handleUpdateSuccessors(p.id, patch)}
                />
              ))}

              {showNewPlanForm ? (
                <div className="plan-new-form">
                  <input
                    className="input input--sm" placeholder="Nome do novo plano"
                    value={newPlanName} onChange={e => setNewPlanName(e.target.value)}
                  />
                  <div className="plan-new-form__actions">
                    <button type="button" className="btn btn--outline btn--sm" onClick={() => handleCreatePlan(false)}>Criar em branco</button>
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => handleCreatePlan(true)}>Duplicar atual</button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowNewPlanForm(false)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="btn btn--outline btn--full btn--sm" onClick={() => setShowNewPlanForm(true)}>+ Novo plano</button>
              )}
            </div>
          )}

          {tab === 'editar' && (
            <div className="plan-editor">
              <select className="input input--sm" value={selectedPlanId || ''} onChange={e => setSelectedPlanId(e.target.value)}>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name}{p.is_active ? ' (ativo)' : ''}</option>)}
              </select>

              <div className="plan-editor__daypills">
                {WEEK_ORDER.map(d => (
                  <button
                    key={d} type="button"
                    className={`plan-editor__pill${selectedDay === d ? ' active' : ''}`}
                    onClick={() => setSelectedDay(d)}
                  >{d.slice(0, 3)}</button>
                ))}
              </div>

              {loadingDays ? <p className="dash-empty">Carregando…</p> : !day ? (
                <p className="dash-empty">Dia não encontrado neste plano.</p>
              ) : (
                <>
                  <FocoInput key={day.id} initial={day.foco} onSave={handleFocoBlur} />

                  <div className="plan-editor__section-title">Exercícios</div>
                  {day.exercicios.map((ex, i) => (
                    <ExerciseRow
                      key={ex.id} ex={ex}
                      canUp={i > 0} canDown={i < day.exercicios.length - 1}
                      onMove={dir => handleMove(false, ex.id, dir)}
                      onChange={handleUpdateExercise} onDelete={handleDeleteExercise}
                    />
                  ))}
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleAddExercise(false)}>+ Exercício</button>

                  <div className="plan-editor__section-title">Pós-treino</div>
                  {day.pos.map((p, i) => (
                    <ExerciseRow
                      key={p.id} ex={p}
                      canUp={i > 0} canDown={i < day.pos.length - 1}
                      onMove={dir => handleMove(true, p.id, dir)}
                      onChange={handleUpdateExercise} onDelete={handleDeleteExercise}
                    />
                  ))}
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleAddExercise(true)}>+ Item pós-treino</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    getModalRoot()
  );
}
