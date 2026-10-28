import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../context/useToast';
import { fetchClients } from '../lib/trainer';
import { sendMessage } from '../lib/trainerMessages';
import { buildPlanPayload, draftFromPlan } from '../lib/trainerPlan';
import {
  fetchTemplates, deleteTemplate, assignPlanBulk, templateSummary, templateToPlan, friendlyTemplateError,
} from '../lib/trainerTemplates';
import PlanBuilder from './PlanBuilder';
import Loading from '../components/Loading';

import { t, tFoco, locale } from '../lib/i18n';
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase(locale);

// Aba Modelos do personal: biblioteca de treinos prontos, que podem ser
// editados, duplicados ou enviados a vários alunos de uma vez.
export default function TemplatesPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState(null);
  const [clients, setClients] = useState([]);
  const [builder, setBuilder] = useState(null); // { initialPlan, templateId? } | null
  const [query, setQuery] = useState('');
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

  const visible = useMemo(() => {
    const q = fold(query.trim());
    return (templates || []).filter(tpl => !q || fold(tpl.name).includes(q)
      || (tpl.days || []).some(d => fold(d.foco).includes(q) || (d.exercicios || []).some(e => fold(e.nome).includes(q))));
  }, [templates, query]);

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
        templateId={builder.templateId}
        onBack={() => setBuilder(null)}
        onSent={() => { setBuilder(null); reload(); }}
      />
    );
  }

  return (
    <section className="page active trainer-page">
      <div className="dash-card">
        <div className="dash-card__title">{t('🧩 Modelos de treino')}</div>
        <p className="profile-field__hint mt-0">{t('Salve treinos prontos e envie para um ou vários alunos, ajustando só o que muda.')}</p>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setBuilder({ initialPlan: null })}>{t('+ Novo modelo')}</button>
      </div>

      {templates && templates.length > 3 && (
        <input type="search" className="input input--sm" placeholder={t('Buscar modelo, foco ou exercício')} aria-label={t('Buscar modelo')}
          value={query} onChange={e => setQuery(e.target.value)} />
      )}

      {!templates && <Loading />}
      {templates && templates.length > 0 && visible.length === 0 && <p className="dash-empty">{t('Nenhum modelo encontrado.')}</p>}
      {templates && templates.length === 0 && (
        <div className="dash-card"><p className="dash-empty">{t('Nenhum modelo ainda. Crie um aqui ou use "Salvar como modelo" ao montar o treino de um aluno.')}</p></div>
      )}

      {visible.map(tpl => (
        <div className="dash-card" key={tpl.id}>
          <div className="client-row__main">
            <strong>{tpl.name}</strong>
          </div>
          <p className="profile-field__hint" style={{ margin: '4px 0 0' }}>{templateSummary(tpl)}</p>
          <ul className="tpl-days">
            {(tpl.days || []).map(d => (
              <li key={d.dia}><strong>{t(d.dia).slice(0, 3)}</strong> {d.foco ? tFoco(d.foco) : t('{n} exercício(s)', { n: (d.exercicios || []).length })}</li>
            ))}
          </ul>
          <div className="challenge__actions">
            <button type="button" className="btn btn--primary btn--sm" disabled={clients.length === 0}
              onClick={() => { setSendingId(sendingId === tpl.id ? null : tpl.id); setSelected([]); setError(''); }}>{t('📤 Enviar a alunos')}</button>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => setBuilder({ initialPlan: templateToPlan(tpl), templateId: tpl.id })}>{t('Editar')}</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setBuilder({ initialPlan: { ...templateToPlan(tpl), name: t('{name} (cópia)', { name: tpl.name }).slice(0, 60) } })}>{t('Duplicar')}</button>
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
              {error && <p className="profile-field__hint text-error" role="alert">{error}</p>}
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
