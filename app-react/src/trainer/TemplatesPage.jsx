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

import { t } from '../lib/i18n';
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

  async function handleDelete(tpl) {
    if (!window.confirm(t('Apagar o modelo "{name}"? Os treinos já enviados aos alunos não mudam.', { name: tpl.name }))) return;
    try { await deleteTemplate(tpl.id); reload(); } catch { toast(t('❌ Não foi possível apagar')); }
  }

  async function handleSend(tpl) {
    const payload = buildPlanPayload(draftFromPlan(templateToPlan(tpl)));
    if (!payload.ok) { setError(payload.error); return; }
    if (selected.length === 0) { setError(t('Escolha pelo menos um aluno.')); return; }
    if (!window.confirm(t('Enviar "{name}" para {length} aluno(s)? Vira o plano ativo de cada um.', { name: tpl.name, length: selected.length }))) return;
    setBusy(true); setError('');
    try {
      const done = await assignPlanBulk(selected, payload);
      // aviso aos alunos (melhor esforço: os treinos já foram enviados)
      sendMessage(done, t('Seu personal montou um novo treino para você: "{name}". Bons treinos!', { name: payload.name }), 'treino')
        .catch(err => console.warn('aviso de novo treino:', err));
      toast(t('✅ Treino enviado para {length} aluno(s)', { length: done.length }));
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
        <div className="dash-card__title">{t('🧩 Modelos de treino')}</div>
        <p className="profile-field__hint" style={{ marginTop: 0 }}>{t('Salve treinos prontos e envie para um ou vários alunos, ajustando só o que muda.')}</p>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setBuilder({ initialPlan: null })}>{t('+ Novo modelo')}</button>
      </div>

      {!templates && <Loading />}
      {templates && templates.length === 0 && (
        <div className="dash-card"><p className="dash-empty">{t('Nenhum modelo ainda. Crie um aqui ou use "Salvar como modelo" ao montar o treino de um aluno.')}</p></div>
      )}

      {(templates || []).map(tpl => (
        <div className="dash-card" key={tpl.id}>
          <div className="client-row__main">
            <strong>{tpl.name}</strong>
          </div>
          <p className="profile-field__hint" style={{ margin: '4px 0 8px' }}>{templateSummary(tpl)}</p>
          <div className="challenge__actions">
            <button type="button" className="btn btn--primary btn--sm" disabled={clients.length === 0}
              onClick={() => { setSendingId(sendingId === tpl.id ? null : tpl.id); setSelected([]); setError(''); }}>{t('📤 Enviar a alunos')}</button>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => setBuilder({ initialPlan: templateToPlan(tpl) })}>{t('Editar como novo')}</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleDelete(tpl)}>{t('Apagar')}</button>
          </div>

          {sendingId === tpl.id && (
            <div className="challenge__form">
              <span className="profile-field__label">{t('Para quem?')}</span>
              <div className="measure-chips" role="group" aria-label={t('Alunos')}>
                <button type="button" aria-pressed={selected.length === clients.length && clients.length > 0}
                  className={selected.length === clients.length && clients.length > 0 ? 'recap__btn recap__btn--active' : 'recap__btn'}
                  onClick={() => setSelected(selected.length === clients.length ? [] : clients.map(c => c.id))}>{t('Todos')}</button>
                {clients.map(c => (
                  <button key={c.id} type="button" aria-pressed={selected.includes(c.id)}
                    className={selected.includes(c.id) ? 'recap__btn recap__btn--active' : 'recap__btn'}
                    onClick={() => toggle(c.id)}>{c.name}</button>
                ))}
              </div>
              {error && <p className="profile-field__hint" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
              <button type="button" className="btn btn--primary btn--sm" disabled={busy || selected.length === 0} onClick={() => handleSend(tpl)}>
                {busy ? t('Enviando…') : t('Enviar para {length} aluno(s)', { length: selected.length })}
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
