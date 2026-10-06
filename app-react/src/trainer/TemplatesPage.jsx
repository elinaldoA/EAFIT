import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../context/useToast';
import { fetchClients } from '../lib/trainer';
import { sendMessage } from '../lib/trainerMessages';
import { buildPlanPayload, draftFromPlan } from '../lib/trainerPlan';
import {
  fetchTemplates, deleteTemplate, assignPlanBulk, templateSummary, templateToPlan, friendlyTemplateError,
} from '../lib/trainerTemplates';
import PlanBuilder from './PlanBuilder';
import Loading from '../components/Loading';

// Aba Modelos do personal: biblioteca de treinos prontos, que podem ser
// editados como novo modelo ou enviados a vários alunos de uma vez.
export default function TemplatesPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState(null);
  const [clients, setClients] = useState([]);
  const [builder, setBuilder] = useState(null); // { initialPlan } | null
  const [sendingId, setSendingId] = useState(null); // modelo com o seletor de alunos aberto
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    fetchTemplates().then(setTemplates).catch(err => { console.error('fetchTemplates:', err); setTemplates([]); });
  }, []);

  useEffect(() => {
    reload();
    fetchClients().then(setClients).catch(err => console.error('fetchClients:', err));
  }, [reload]);

  const toggle = id => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  async function handleDelete(t) {
    if (!window.confirm(`Apagar o modelo "${t.name}"? Os treinos já enviados aos alunos não mudam.`)) return;
    try { await deleteTemplate(t.id); reload(); } catch { toast('❌ Não foi possível apagar'); }
  }

  async function handleSend(t) {
    const payload = buildPlanPayload(draftFromPlan(templateToPlan(t)));
    if (!payload.ok) { setError(payload.error); return; }
    if (selected.length === 0) { setError('Escolha pelo menos um aluno.'); return; }
    if (!window.confirm(`Enviar "${t.name}" para ${selected.length} aluno(s)? Vira o plano ativo de cada um.`)) return;
    setBusy(true); setError('');
    try {
      const done = await assignPlanBulk(selected, payload);
      // aviso aos alunos (melhor esforço: os treinos já foram enviados)
      sendMessage(done, `Seu personal montou um novo treino para você: "${payload.name}". Bons treinos!`, 'treino')
        .catch(err => console.warn('aviso de novo treino:', err));
      toast(`✅ Treino enviado para ${done.length} aluno(s)`);
      setSendingId(null); setSelected([]);
    } catch (err) {
      setError(friendlyTemplateError(err));
    } finally {
      setBusy(false);
    }
  }

  if (builder) {
    return (
      <PlanBuilder
        initialPlan={builder.initialPlan}
        onBack={() => setBuilder(null)}
        onSent={() => { setBuilder(null); reload(); }}
      />
    );
  }

  return (
    <section className="page active trainer-page">
      <div className="dash-card">
        <div className="dash-card__title">🧩 Modelos de treino</div>
        <p className="profile-field__hint" style={{ marginTop: 0 }}>Salve treinos prontos e envie para um ou vários alunos, ajustando só o que muda.</p>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setBuilder({ initialPlan: null })}>+ Novo modelo</button>
      </div>

      {!templates && <Loading />}
      {templates && templates.length === 0 && (
        <div className="dash-card"><p className="dash-empty">Nenhum modelo ainda. Crie um aqui ou use "Salvar como modelo" ao montar o treino de um aluno.</p></div>
      )}

      {(templates || []).map(t => (
        <div className="dash-card" key={t.id}>
          <div className="client-row__main">
            <strong>{t.name}</strong>
          </div>
          <p className="profile-field__hint" style={{ margin: '4px 0 8px' }}>{templateSummary(t)}</p>
          <div className="challenge__actions">
            <button type="button" className="btn btn--primary btn--sm" disabled={clients.length === 0}
              onClick={() => { setSendingId(sendingId === t.id ? null : t.id); setSelected([]); setError(''); }}>📤 Enviar a alunos</button>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => setBuilder({ initialPlan: templateToPlan(t) })}>Editar como novo</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleDelete(t)}>Apagar</button>
          </div>

          {sendingId === t.id && (
            <div className="challenge__form">
              <span className="profile-field__label">Para quem?</span>
              <div className="measure-chips" role="group" aria-label="Alunos">
                <button type="button" aria-pressed={selected.length === clients.length && clients.length > 0}
                  className={selected.length === clients.length && clients.length > 0 ? 'recap__btn recap__btn--active' : 'recap__btn'}
                  onClick={() => setSelected(selected.length === clients.length ? [] : clients.map(c => c.id))}>Todos</button>
                {clients.map(c => (
                  <button key={c.id} type="button" aria-pressed={selected.includes(c.id)}
                    className={selected.includes(c.id) ? 'recap__btn recap__btn--active' : 'recap__btn'}
                    onClick={() => toggle(c.id)}>{c.name}</button>
                ))}
              </div>
              {error && <p className="profile-field__hint" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
              <button type="button" className="btn btn--primary btn--sm" disabled={busy || selected.length === 0} onClick={() => handleSend(t)}>
                {busy ? 'Enviando…' : `Enviar para ${selected.length} aluno(s)`}
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
