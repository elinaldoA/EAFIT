import { useEffect, useId, useMemo, useState } from 'react';
import { useToast } from '../context/useToast';
import { sendMessage } from '../lib/trainerMessages';
import { fetchLibrary } from '../lib/exerciseSwap';
import { fetchTemplates, saveTemplate, templateToPlan, friendlyTemplateError } from '../lib/trainerTemplates';
import {
  WEEK_DAYS, DURATION_CHOICES, MAX_EXERCISES, emptyDraft, emptyExercise, toggleDay, moveItem, draftFromPlan,
  buildPlanPayload, fetchClientPlan, assignPlan, friendlyPlanError,
} from '../lib/trainerPlan';
import Loading from '../components/Loading';

import { t } from '../lib/i18n';
// Montagem de treino: dias da semana, foco, exercícios (com sugestão da
// biblioteca do app) e prazo. Com `client`, ao enviar vira o plano ativo do
// aluno (RPC trainer_assign_plan; o plano anterior dele continua salvo) e dá
// pra salvar como modelo. Sem `client`, é a criação de um modelo (a partir de
// `initialPlan`, se vier). Modelos podem ser carregados em qualquer um dos dois.
export default function PlanBuilder({ client, initialPlan, onBack, onSent }) {
  const toast = useToast();
  const listId = useId();
  const [draft, setDraft] = useState(null);
  const [library, setLibrary] = useState([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState([]);
  const clientId = client?.id;

  useEffect(() => {
    let active = true;
    if (clientId) {
      fetchClientPlan(clientId)
        .then(plan => { if (active) setDraft(draftFromPlan(plan)); })
        .catch(err => { console.error('fetchClientPlan:', err); if (active) setDraft(emptyDraft()); });
    } else {
      setDraft(draftFromPlan(initialPlan || null));
    }
    fetchLibrary().then(rows => { if (active) setLibrary(rows.filter(r => !r.is_post_workout)); }).catch(() => {});
    fetchTemplates().then(rows => { if (active) setTemplates(rows); }).catch(() => {});
    return () => { active = false; };
  }, [clientId, initialPlan]);

  const byName = useMemo(() => new Map(library.map(r => [r.nome.toLowerCase(), r])), [library]);

  if (!draft) return <section className="page active trainer-page"><Loading /></section>;

  const setDay = (idx, fn) => setDraft(d => ({ ...d, days: d.days.map((day, i) => (i === idx ? fn(day) : day)) }));
  const setEx = (di, ei, patch) => setDay(di, day => ({
    ...day, exercicios: day.exercicios.map((e, i) => (i === ei ? { ...e, ...patch } : e)),
  }));

  // Ao escolher um exercício da biblioteca, preenche séries/reps/descanso/técnica sugeridos.
  function handleName(di, ei, nome) {
    const lib = byName.get(nome.trim().toLowerCase());
    setEx(di, ei, lib
      ? { nome, series: lib.series || '3', reps: lib.reps || '10-12', descanso: lib.descanso || '60s', tecnica: lib.tecnica || '' }
      : { nome });
  }

  function handleLoadTemplate(id) {
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    if (draft.days.length && !window.confirm(t('Carregar o modelo substitui o que você montou até agora. Continuar?'))) return;
    setDraft(draftFromPlan(templateToPlan(tpl)));
    setError('');
  }

  async function handleSaveTemplate() {
    const payload = buildPlanPayload(draft);
    if (!payload.ok) { setError(payload.error); return; }
    setSending(true); setError('');
    try {
      await saveTemplate(payload);
      toast(t('💾 Modelo salvo'));
      if (!client) onSent();
      else fetchTemplates().then(setTemplates).catch(() => {});
    } catch (err) {
      setError(friendlyTemplateError(err));
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    const payload = buildPlanPayload(draft);
    if (!payload.ok) { setError(payload.error); return; }
    if (!window.confirm(t('Enviar este treino para {name}? Ele passa a ser o plano ativo do aluno.', { name: client.name }))) return;
    setSending(true); setError('');
    try {
      await assignPlan(client.id, payload);
      // aviso ao aluno (melhor esforço: o treino já foi enviado)
      sendMessage([client.id], t('Seu personal montou um novo treino para você: "{name}". Bons treinos!', { name: payload.name }), 'treino')
        .catch(err => console.warn('aviso de novo treino:', err));
      toast(t('✅ Treino enviado para o aluno'));
      onSent();
    } catch (err) {
      setError(friendlyPlanError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="page active trainer-page">
      <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>{client ? t('‹ Voltar à ficha') : t('‹ Voltar aos modelos')}</button>
      <div className="dash-card">
        <div className="dash-card__title">{client ? t('📋 Treino de {name}', { name: client.name }) : t('🧩 Modelo de treino')}</div>
        {templates.length > 0 && (
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="loadTemplate">{t('Começar de um modelo')}</label>
            <select id="loadTemplate" className="input input--sm" value="" onChange={e => handleLoadTemplate(e.target.value)}>
              <option value="">{t('Escolher modelo…')}</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="planName">{t('Nome do plano')}</label>
          <input id="planName" className="input input--sm" placeholder={t('Ex: Hipertrofia — ciclo 1')} maxLength={60}
            value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
        </div>
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="planWeeks">{t('Duração')}</label>
          <select id="planWeeks" className="input input--sm" value={draft.weeks} onChange={e => setDraft(d => ({ ...d, weeks: e.target.value }))}>
            {DURATION_CHOICES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <span className="profile-field__hint">{t('Ao fim do prazo o app avisa o aluno para falar com você. O plano não é trocado sozinho.')}</span>
        </div>
        <span className="profile-field__label">{t('Dias de treino')}</span>
        <div className="measure-chips" role="group" aria-label={t('Dias de treino')}>
          {WEEK_DAYS.map(dia => (
            <button key={dia} type="button" aria-pressed={draft.days.some(d => d.dia === dia)}
              className={draft.days.some(d => d.dia === dia) ? 'recap__btn recap__btn--active' : 'recap__btn'}
              onClick={() => setDraft(d => toggleDay(d, dia))}>{dia.slice(0, 3)}</button>
          ))}
        </div>
      </div>

      <datalist id={listId}>
        {library.map(r => <option key={r.nome} value={r.nome} />)}
      </datalist>

      {draft.days.map((day, di) => (
        <div className="dash-card" key={day.dia}>
          <div className="dash-card__title">{day.dia}</div>
          <input className="input input--sm" placeholder={t('Foco do dia (ex.: Peito / Ombro / Tríceps)')} value={day.foco}
            onChange={e => setDay(di, d => ({ ...d, foco: e.target.value }))} />

          {day.exercicios.map((ex, ei) => (
            <div className="plan-ex-row" key={ei}>
              <div className="plan-ex-row__move">
                <button type="button" disabled={ei === 0} aria-label={t('Subir')}
                  onClick={() => setDay(di, d => ({ ...d, exercicios: moveItem(d.exercicios, ei, -1) }))}>▲</button>
                <button type="button" disabled={ei === day.exercicios.length - 1} aria-label={t('Descer')}
                  onClick={() => setDay(di, d => ({ ...d, exercicios: moveItem(d.exercicios, ei, 1) }))}>▼</button>
              </div>
              <div className="plan-ex-row__fields">
                <input className="input input--sm plan-ex-row__name" list={listId} placeholder={t('Exercício')} value={ex.nome}
                  onChange={e => handleName(di, ei, e.target.value)} />
                <div className="plan-ex-row__nums">
                  <input className="input input--sm" placeholder={t('Séries')} value={ex.series} onChange={e => setEx(di, ei, { series: e.target.value })} />
                  <input className="input input--sm" placeholder="Reps" value={ex.reps} onChange={e => setEx(di, ei, { reps: e.target.value })} />
                  <input className="input input--sm" placeholder={t('Descanso')} value={ex.descanso} onChange={e => setEx(di, ei, { descanso: e.target.value })} />
                </div>
                <input className="input input--sm" placeholder={t('Técnica / observação (opcional)')} value={ex.tecnica}
                  onChange={e => setEx(di, ei, { tecnica: e.target.value })} />
              </div>
              <button type="button" className="plan-row__del" aria-label={t('Remover exercício')}
                onClick={() => setDay(di, d => ({ ...d, exercicios: d.exercicios.filter((_, i) => i !== ei) }))}>✕</button>
            </div>
          ))}

          <button type="button" className="btn btn--outline btn--sm" disabled={day.exercicios.length >= MAX_EXERCISES}
            onClick={() => setDay(di, d => ({ ...d, exercicios: [...d.exercicios, emptyExercise()] }))}>{t('+ Exercício')}</button>
        </div>
      ))}

      {error && <p className="profile-field__hint" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
      {client && (
        <button type="button" className="btn btn--primary btn--full" disabled={sending} onClick={handleSend}>
          {sending ? t('Enviando…') : t('📤 Enviar treino para o aluno')}
        </button>
      )}
      <button type="button" className={client ? 'btn btn--outline btn--full' : 'btn btn--primary btn--full'} disabled={sending} onClick={handleSaveTemplate}>
        {client ? t('💾 Salvar como modelo') : (sending ? t('Salvando…') : t('💾 Salvar modelo'))}
      </button>
    </section>
  );
}
