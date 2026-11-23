import { useEffect, useMemo, useState } from 'react';
import { trackFeature } from '../lib/tracking';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../lib/modalRoot';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { useToast } from '../context/useToast';
import { fmtDate, daysUntil } from '../lib/utils';
import {
  listPlans, updatePlanProgression, createPlan, setActivePlan, renamePlan, deletePlan, updatePlanSuccessors,
  fetchPlanDays, updatePlanDay, addExercise, updateExercise, deleteExercise, reorderExercises,
} from '../lib/workoutPlans';
import { useBackToClose } from '../hooks/useBackToClose';
import { useDeferredRemoval } from '../lib/useDeferredRemoval';
import Loading from './Loading';
import ExerciseExtras from './ExerciseExtras';
import PlanProgressionFields from './PlanProgressionFields';
import { repeatedNames, isRepeatedName } from '../lib/planDuplicates';

import { t } from '../lib/i18n';
const WEEK_ORDER = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function PlanRow({ plan, allPlans, onSetActive, onRename, onDelete, onUpdateSuccessors, onUpdateProgression }) {
  const [name, setName] = useState(plan.name);
  useEffect(() => { setName(plan.name); }, [plan.name]);
  // Ativar pergunta a duração do ciclo aqui mesmo (antes era a janelinha do navegador, sem validação).
  const [activating, setActivating] = useState(false);
  const [weeks, setWeeks] = useState('');
  const [weeksError, setWeeksError] = useState('');

  function openActivate() {
    setWeeks(plan.duration_weeks != null ? String(plan.duration_weeks) : '');
    setWeeksError('');
    setActivating(true);
  }

  function confirmActivate() {
    const raw = weeks.trim();
    const n = raw ? Number(raw) : null;
    if (raw && (!Number.isInteger(n) || n < 1 || n > 52)) {
      setWeeksError(t('Informe de 1 a 52 semanas, ou deixe em branco para sem prazo.'));
      return;
    }
    setActivating(false);
    onSetActive(n);
  }

  const daysLeft = plan.end_date ? daysUntil(plan.end_date) : null;
  const otherPlans = allPlans.filter(p => p.id !== plan.id);

  return (
    <div className={`plan-row${plan.is_active ? ' plan-row--active' : ''}`}>
      <div className="plan-row__main">
        <input
          className="input input--sm plan-row__name"
          aria-label={t('Nome do plano')}
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name !== plan.name) onRename(name); }}
        />
        {plan.is_active ? (
          <span className="plan-row__badge">{t('Ativo')}</span>
        ) : (
          <button type="button" className="btn btn--outline btn--sm" aria-expanded={activating} onClick={() => (activating ? setActivating(false) : openActivate())}>{t('Ativar')}</button>
        )}
        <button type="button" className="plan-row__del" onClick={onDelete} aria-label={t('Excluir plano')} title={t('Excluir plano')}>🗑️</button>
      </div>

      {activating && !plan.is_active && (
        <div className="plan-row__activate">
          <label className="plan-row__successor-field">
            {t('Duração do ciclo (semanas)')}
            <input
              className="input input--sm" type="number" inputMode="numeric" min="1" max="52" autoFocus
              aria-label={t('Sem prazo')} placeholder={t('Sem prazo')} value={weeks}
              aria-invalid={weeksError ? 'true' : undefined}
              onChange={e => { setWeeks(e.target.value); setWeeksError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') confirmActivate(); }}
            />
          </label>
          {weeksError && <p className="profile-field__hint text-error" role="alert">{weeksError}</p>}
          <div className="plan-row__activate-actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={confirmActivate}>{t('Ativar este plano')}</button>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => setActivating(false)}>{t('Cancelar')}</button>
          </div>
        </div>
      )}

      {plan.end_date && (
        <p className="plan-row__cycle">
          {daysLeft >= 0 ? t('Ciclo termina em {v1} (faltam {daysLeft}d)', { v1: fmtDate(plan.end_date), daysLeft }) : t('Ciclo vencido em {v1}', { v1: fmtDate(plan.end_date) })}
        </p>
      )}

      <PlanProgressionFields
        step={plan.progressao_passo != null ? Number(plan.progressao_passo) : null} deloadEvery={plan.deload_a_cada}
        onChange={onUpdateProgression}
      />

      <div className="plan-row__successors">
        <label className="plan-row__successor-field">
          {t('Próximo (progressão)')}
          <select
            className="input input--sm"
            value={plan.next_plan_id || ''}
            onChange={e => onUpdateSuccessors({ nextPlanId: e.target.value, regressionPlanId: plan.regression_plan_id })}
          >
            <option value="">{t('Nenhum')}</option>
            {otherPlans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="plan-row__successor-field">
          {t('Recuperação (se estagnar)')}
          <select
            className="input input--sm"
            value={plan.regression_plan_id || ''}
            onChange={e => onUpdateSuccessors({ nextPlanId: plan.next_plan_id, regressionPlanId: e.target.value })}
          >
            <option value="">{t('Nenhum')}</option>
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
      aria-label={t('Foco do dia (ex.: Peito / Ombro / Tríceps)')} placeholder={t('Foco do dia (ex.: Peito / Ombro / Tríceps)')}
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => onSave(value)}
    />
  );
}

function MoveButtons({ canUp, canDown, onMove }) {
  return (
    <div className="plan-ex-row__move">
      <button type="button" disabled={!canUp} onClick={() => onMove(-1)} aria-label={t('Mover para cima')}>▲</button>
      <button type="button" disabled={!canDown} onClick={() => onMove(1)} aria-label={t('Mover para baixo')}>▼</button>
    </div>
  );
}

// extras: bi-set e aquecimento, só nos exercícios de força (o pós-treino não tem).
function ExerciseRow({ ex, canUp, canDown, onMove, onChange, onDelete, extras = false, repeated = false }) {
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
        <input className="input input--sm plan-ex-row__name" aria-label={t('Exercício')} placeholder={t('Exercício')} value={local.nome}
          onChange={e => setLocal(l => ({ ...l, nome: e.target.value }))} onBlur={() => save('nome')} />
        {repeated && <p className="plan-ex-row__warn" role="alert">{t('⚠️ Há outro exercício com este nome neste dia: eles dividem as mesmas séries. Mude o nome (ex.: "{nome} (2)").', { nome: local.nome })}</p>}
        {/* Rótulo em cima de cada campo: preenchido, "3 · 8-10 · 60s" não diz qual é qual. */}
        <div className="plan-ex-row__nums">
          <label className="plan-ex-row__extra">
            {t('Séries')}
            <input className="input input--sm" placeholder="3" value={local.series}
              onChange={e => setLocal(l => ({ ...l, series: e.target.value }))} onBlur={() => save('series')} />
          </label>
          <label className="plan-ex-row__extra">
            {t('Repetições')}
            <input className="input input--sm" placeholder="8-12" value={local.reps}
              onChange={e => setLocal(l => ({ ...l, reps: e.target.value }))} onBlur={() => save('reps')} />
          </label>
          <label className="plan-ex-row__extra">
            {t('Descanso')}
            <input className="input input--sm" placeholder="60s" value={local.descanso}
              onChange={e => setLocal(l => ({ ...l, descanso: e.target.value }))} onBlur={() => save('descanso')} />
          </label>
        </div>
        <input className="input input--sm" placeholder={t('Técnica')} aria-label={t('Técnica')} value={local.tecnica}
          onChange={e => setLocal(l => ({ ...l, tecnica: e.target.value }))} onBlur={() => save('tecnica')} />
        {extras && (
          <ExerciseExtras
            grupo={local.grupo} aquecimento={local.aquecimento} intensidade={local.intensidade}
            onChange={patch => { setLocal(l => ({ ...l, ...patch })); onChange(ex.id, patch); }}
          />
        )}
      </div>
      <button type="button" className="plan-ex-row__del" onClick={() => onDelete(ex)} aria-label={t('Remover exercício')} title={t('Remover exercício')}>🗑️</button>
    </div>
  );
}

export default function PlanEditorModal({ onClose }) {
  useBackToClose(onClose);
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
  const removal = useDeferredRemoval();
  const [loadingDays, setLoadingDays] = useState(false);
  const [selectedDay, setSelectedDay] = useState('Segunda');

  useEffect(() => {
    trackFeature('plan_editor');
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
      toast(t('⚠️ Erro ao carregar planos'));
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
        toast(t('⚠️ Erro ao carregar dias do plano'));
      } finally {
        setLoadingDays(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlanId]);

  const shownPlans = useMemo(() => plans.filter(p => !removal.hidden.has(p.id)), [plans, removal.hidden]);
  const rawDay = days.find(d => d.dia === selectedDay);
  // Exercício removido some já; o servidor só apaga em 6s (a não ser que desfaça).
  const day = useMemo(() => (rawDay ? {
    ...rawDay,
    exercicios: rawDay.exercicios.filter(e => !removal.hidden.has(e.id)),
    pos: rawDay.pos.filter(e => !removal.hidden.has(e.id)),
  } : rawDay), [rawDay, removal.hidden]);

  const dayRepeated = useMemo(() => (day ? repeatedNames(day.exercicios, day.pos) : null), [day]);

  async function handleCreatePlan(copy) {
    const name = newPlanName.trim();
    if (!name) return;
    try {
      const plan = await createPlan(user.id, name, copy ? selectedPlanId : null);
      setNewPlanName('');
      setShowNewPlanForm(false);
      await loadPlans(plan.id);
      toast(t('✅ Plano criado'));
    } catch (err) {
      console.error('createPlan:', err);
      toast(t('⚠️ Erro ao criar plano'));
    }
  }

  async function handleSetActive(planId, weeks) {
    try {
      await setActivePlan(user.id, planId, weeks);
      await loadPlans(planId);
      await refreshPlan();
      toast(t('✅ Plano ativado'));
    } catch (err) {
      console.error('setActivePlan:', err);
      toast(t('⚠️ Erro ao ativar plano'));
    }
  }

  async function handleUpdateProgression(planId, patch) {
    try {
      await updatePlanProgression(planId, patch);
      await loadPlans(selectedPlanId);
      await refreshPlan();
    } catch (err) {
      console.error('updatePlanProgression:', err);
      toast(t('⚠️ Erro ao salvar a periodização do plano'));
    }
  }

  async function handleUpdateSuccessors(planId, patch) {
    try {
      await updatePlanSuccessors(planId, patch);
      await loadPlans(selectedPlanId);
    } catch (err) {
      console.error('updatePlanSuccessors:', err);
      toast(t('⚠️ Erro ao salvar encadeamento do plano'));
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
      toast(t('⚠️ Erro ao renomear plano'));
    }
  }

  // O plano some da lista na hora; o servidor (apaga dias e exercícios, sem volta)
  // só roda em 6s ou ao fechar o editor, a não ser que desfaça.
  function handleDeletePlan(planId) {
    const plan = plans.find(p => p.id === planId);
    if (plan?.is_active) { toast(t('Ative outro plano antes de excluir este')); return; }
    if (shownPlans.length <= 1) { toast(t('Você precisa de pelo menos um plano')); return; }
    if (selectedPlanId === planId) setSelectedPlanId(plans.find(p => p.is_active)?.id || shownPlans.find(p => p.id !== planId)?.id || null);
    removal.schedule(planId, async () => {
      try {
        await deletePlan(planId, user.id);
      } catch (err) {
        console.error('deletePlan:', err);
        toast(t('⚠️ Erro ao excluir plano'));
      }
      await loadPlans(selectedPlanId === planId ? undefined : selectedPlanId);
    });
    toast(t('🗑️ Plano "{name}" excluído', { name: plan?.name }), 6000, {
      action: { label: t('Desfazer'), onClick: () => removal.undo(planId) },
    });
  }

  async function handleFocoBlur(value) {
    if (!day || value === day.foco) return;
    try {
      await updatePlanDay(day.id, { foco: value });
      await reloadDays();
    } catch (err) {
      console.error('updatePlanDay:', err);
      toast(t('⚠️ Erro ao salvar foco do dia'));
    }
  }

  async function handleAddExercise(isPost) {
    if (!day) return;
    try {
      const orderIndex = isPost ? day.pos.length : day.exercicios.length;
      await addExercise(day.id, {
        nome: isPost ? t('Novo item') : t('Novo exercício'),
        series: '3', reps: isPost ? '12-15' : '10-12',
        descanso: isPost ? '45s' : '60s', tecnica: '', is_post_workout: isPost,
      }, orderIndex);
      await reloadDays();
    } catch (err) {
      console.error('addExercise:', err);
      toast(t('⚠️ Erro ao adicionar exercício'));
    }
  }

  async function handleUpdateExercise(id, patch) {
    try {
      await updateExercise(id, patch, user.id);
      await reloadDays();
    } catch (err) {
      console.error('updateExercise:', err);
      toast(t('⚠️ Erro ao salvar exercício'));
    }
  }

  // Um toque sem querer apagava o exercício na hora, com séries, técnica e o
  // resto: some da tela, avisa com Desfazer e só apaga no servidor em 6s.
  function handleDeleteExercise(ex) {
    const nome = ex.nome?.trim();
    removal.schedule(ex.id, async () => {
      try {
        await deleteExercise(ex.id);
      } catch (err) {
        console.error('deleteExercise:', err);
        toast(t('⚠️ Erro ao remover exercício'));
      }
      try { await reloadDays(); } catch (err) { console.error('reloadDays:', err); }
    });
    toast(nome ? t('"{nome}" removido do dia', { nome }) : t('Exercício removido do dia'), 6000, {
      action: { label: t('Desfazer'), onClick: () => removal.undo(ex.id) },
    });
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
      toast(t('⚠️ Erro ao reordenar'));
    }
  }

  return createPortal(
    <div className="plan-modal" role="dialog" aria-modal="true">
      <div className="plan-modal__backdrop" onClick={onClose} />
      <div className="plan-modal__panel">
        <div className="plan-modal__header">
          <h2 className="plan-modal__title">{t('Editar treino')}</h2>
          <button type="button" className="plan-modal__close" aria-label={t('Fechar')} onClick={onClose}>✕</button>
        </div>

        <div className="plan-modal__tabs">
          <button type="button" className={`plan-modal__tab${tab === 'planos' ? ' active' : ''}`} onClick={() => setTab('planos')}>{t('Planos')}</button>
          <button type="button" className={`plan-modal__tab${tab === 'editar' ? ' active' : ''}`} onClick={() => setTab('editar')}>{t('Editar dia')}</button>
        </div>

        <div className="plan-modal__body">
          {tab === 'planos' && (
            <div className="plan-list">
              {loadingPlans ? <Loading /> : shownPlans.map(p => (
                <PlanRow
                  key={p.id} plan={p} allPlans={shownPlans}
                  onSetActive={weeks => handleSetActive(p.id, weeks)}
                  onRename={name => handleRename(p.id, name)}
                  onDelete={() => handleDeletePlan(p.id)}
                  onUpdateSuccessors={patch => handleUpdateSuccessors(p.id, patch)}
                  onUpdateProgression={patch => handleUpdateProgression(p.id, patch)}
                />
              ))}

              {showNewPlanForm ? (
                <div className="plan-new-form">
                  <input
                    className="input input--sm" aria-label={t('Nome do novo plano')} placeholder={t('Nome do novo plano')}
                    value={newPlanName} onChange={e => setNewPlanName(e.target.value)}
                  />
                  <div className="plan-new-form__actions">
                    <button type="button" className="btn btn--outline btn--sm" onClick={() => handleCreatePlan(false)}>{t('Criar em branco')}</button>
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => handleCreatePlan(true)}>{t('Duplicar atual')}</button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowNewPlanForm(false)}>{t('Cancelar')}</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="btn btn--outline btn--full btn--sm" onClick={() => setShowNewPlanForm(true)}>{t('+ Novo plano')}</button>
              )}
            </div>
          )}

          {tab === 'editar' && (
            <div className="plan-editor">
              <select className="input input--sm" aria-label={t('Plano')} value={selectedPlanId || ''} onChange={e => setSelectedPlanId(e.target.value)}>
                {shownPlans.map(p => <option key={p.id} value={p.id}>{p.name}{p.is_active ? ' (ativo)' : ''}</option>)}
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

              {loadingDays ? <Loading /> : !day ? (
                <p className="dash-empty">{t('Dia não encontrado neste plano.')}</p>
              ) : (
                <>
                  <FocoInput key={day.id} initial={day.foco} onSave={handleFocoBlur} />

                  <div className="plan-editor__section-title">{t('Exercícios')}</div>
                  {day.exercicios.map((ex, i) => (
                    <ExerciseRow
                      key={ex.id} ex={ex} repeated={isRepeatedName(ex.nome, dayRepeated)}
                      canUp={i > 0} canDown={i < day.exercicios.length - 1}
                      onMove={dir => handleMove(false, ex.id, dir)}
                      onChange={handleUpdateExercise} onDelete={handleDeleteExercise} extras
                    />
                  ))}
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleAddExercise(false)}>{t('+ Exercício')}</button>

                  <div className="plan-editor__section-title">{t('Pós-treino')}</div>
                  {day.pos.map((p, i) => (
                    <ExerciseRow
                      key={p.id} ex={p} repeated={isRepeatedName(p.nome, dayRepeated)}
                      canUp={i > 0} canDown={i < day.pos.length - 1}
                      onMove={dir => handleMove(true, p.id, dir)}
                      onChange={handleUpdateExercise} onDelete={handleDeleteExercise}
                    />
                  ))}
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleAddExercise(true)}>{t('+ Item pós-treino')}</button>
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
