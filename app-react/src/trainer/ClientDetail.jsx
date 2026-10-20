import { useCallback, useEffect, useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { useToast } from '../context/useToast';
import { fmtDate } from '../lib/utils';
import { MEASURE_FIELDS } from '../lib/bodyMeasurements';
import { CHECKIN_FIELDS } from '../lib/checkin';
import { clientAttention, summarizeClient, fetchClientDetail, removeClient, friendlyTrainerError } from '../lib/trainer';
import { initials, planStatus, weeklyCounts } from '../lib/trainerRoster';
import LineChart from '../components/LineChart';
import Skeleton from '../components/Skeleton';
import PlanBuilder from './PlanBuilder';
import ChatThread from '../components/ChatThread';
import { fetchTrainerThread, markThreadRead, sendMessage, friendlyMessageError } from '../lib/trainerMessages';
import ClientSessions from './ClientSessions';
import ClientNotes from './ClientNotes';
import ClientGoals from './ClientGoals';
import ClientPhotos from './ClientPhotos';
import ClientAppointments from './ClientAppointments';
import ClientTags from './ClientTags';
import ClientPlanHistory from './ClientPlanHistory';

import { t, tEx } from '../lib/i18n';
const GOALS = {
  massa: t('Ganho de massa'), forca: t('Aumento de força'), emagrecer: t('Emagrecimento'),
  definicao: t('Definição muscular'), saude: t('Saúde e bem-estar'), resistencia: t('Resistência / Condicionamento'),
};
const LEVELS = { iniciante: t('Iniciante'), intermediario: t('Intermediário'), avancado: t('Avançado') };
const SEVERITY = { leve: t('Leve'), moderada: t('Moderada'), forte: t('Forte'), lesao: t('Lesão') };
const TABS = [
  { key: 'resumo', label: t('Resumo') },
  { key: 'treinos', label: t('Treinos') },
  { key: 'evolucao', label: t('Evolução') },
  { key: 'plano', label: t('Plano') },
  { key: 'conversa', label: t('Conversa') },
];
const fmt = n => String(n).replace('.', ',');

// Barras de treinos por semana (8 semanas), com a meta como linha de referência.
function WeeklyBars({ weeks, goal }) {
  const max = Math.max(goal || 0, ...weeks.map(w => w.count), 1);
  return (
    <div className="week-bars" role="img" aria-label={t('Treinos por semana nas últimas 8 semanas')}>
      {goal ? <span className="week-bars__goal" style={{ bottom: `${(goal / max) * 100}%` }} /> : null}
      {weeks.map(w => (
        <span key={w.end} className="week-bars__col" title={t('{n} treino(s) na semana até {d}', { n: w.count, d: fmtDate(w.end) })}>
          <span className={`week-bars__bar${goal && w.count >= goal ? ' week-bars__bar--hit' : ''}`} style={{ height: `${(w.count / max) * 100}%` }} />
          <small>{w.count}</small>
        </span>
      ))}
    </div>
  );
}

// Ficha de acompanhamento de um aluno, em abas: resumo (frequência, metas,
// anotações), treinos série a série, evolução do corpo, plano e agenda, e a
// conversa. Os dados vêm de trainer_client_detail, que só responde se o
// vínculo com o aluno estiver ativo.
export default function ClientDetail({ client, onBack, onRemoved }) {
  const toast = useToast();
  const [detail, setDetail] = useState(null);
  const [failed, setFailed] = useState(false);
  const [building, setBuilding] = useState(false);
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState('resumo');
  const today = todayDate();

  useEffect(() => {
    let active = true;
    fetchClientDetail(client.id)
      .then(d => { if (active) setDetail(d); })
      .catch(err => { console.error('fetchClientDetail:', err); if (active) setFailed(true); });
    return () => { active = false; };
  }, [client.id, version]);

  const summary = useMemo(() => (detail ? summarizeClient(detail, today) : null), [detail, today]);
  const weeks = useMemo(() => weeklyCounts(detail?.training_days, today, 8), [detail, today]);
  const att = clientAttention(client, today);
  const profile = detail?.profile || {};
  const goal = Number(profile.weeklyGoal) || null;
  const plan = planStatus(client, today);

  const loadThread = useCallback(() => fetchTrainerThread(client.id), [client.id]);
  const sendToClient = useCallback(body => sendMessage([client.id], body), [client.id]);

  async function handleRemove() {
    if (!window.confirm(t('Encerrar o acompanhamento de {name}? Você deixa de ver os dados dele.', { name: client.name }))) return;
    try { await removeClient(client.id); toast(t('Vínculo encerrado')); onRemoved(); }
    catch (err) { toast(`❌ ${friendlyTrainerError(err)}`); }
  }

  if (building) {
    return <PlanBuilder client={client} onBack={() => setBuilding(false)} onSent={() => { setBuilding(false); setVersion(v => v + 1); }} />;
  }

  const pain = (detail?.discomfort || []).filter(x => x.severity === 'forte' || x.severity === 'lesao');

  return (
    <section className="page active trainer-page">
      <button type="button" className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>{t('‹ Voltar aos alunos')}</button>

      <div className="dash-card client-head">
        <div className="client-head__top">
          <span className="avatar avatar--lg" aria-hidden="true">{initials(client.name)}</span>
          <div className="client-head__id">
            <strong className="client-name">{client.name}</strong>
            <span className={`client-badge client-badge--${att.level}`}>{att.label}</span>
          </div>
        </div>
        <p className="profile-field__hint" style={{ margin: 0 }}>
          {client.email}
          {profile.meta && ` · ${GOALS[profile.meta] || profile.meta}`}
          {profile.nivel && ` · ${LEVELS[profile.nivel] || profile.nivel}`}
        </p>
        {(profile.peso || profile.altura || profile.idade) && (
          <p className="profile-field__hint" style={{ margin: 0 }}>
            {[profile.idade && t('{n} anos', { n: profile.idade }), profile.peso && `${fmt(profile.peso)} kg`, profile.altura && `${profile.altura} cm`, profile.pesoAlvo && t('meta {kg} kg', { kg: fmt(profile.pesoAlvo) })].filter(Boolean).join(' · ')}
          </p>
        )}
        {client.since && <p className="profile-field__hint" style={{ margin: 0 }}>{t('Seu aluno desde {d}', { d: fmtDate(String(client.since).slice(0, 10)) })}</p>}
        {profile.pausedUntil && profile.pausedUntil >= today && (
          <p className="pause-status">{t('⏸ Em pausa até {v1}', { v1: profile.pausedUntil.split('-').reverse().slice(0, 2).join('/') })}</p>
        )}
        {pain.length > 0 && <p className="client-head__alert">{t('🩹 Relatou dor forte ou lesão: {ex}', { ex: [...new Set(pain.map(x => tEx(x.exercise)))].slice(0, 3).join(', ') })}</p>}
        {!client.legacy && <ClientTags clientId={client.id} initial={client.tags || []} />}
        <div className="client-head__actions">
          <button type="button" className="btn btn--primary btn--sm" disabled={!detail} onClick={() => setBuilding(true)}>{t('📋 Treino')}</button>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => setTab('conversa')}>{t('💬 Recado')}</button>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => setTab('plano')}>{t('📅 Aula')}</button>
        </div>
      </div>

      <div className="seg client-tabs" role="tablist" aria-label={t('Seções da ficha')}>
        {TABS.map(x => (
          <button key={x.key} type="button" role="tab" aria-selected={tab === x.key}
            className={tab === x.key ? 'seg__btn seg__btn--active' : 'seg__btn'} onClick={() => setTab(x.key)}>{x.label}</button>
        ))}
      </div>

      {failed && <p className="dash-empty">{t('Não foi possível carregar os dados deste aluno.')}</p>}
      {!detail && !failed && <Skeleton height={140} />}

      {summary && tab === 'resumo' && (
        <>
          <div className="dash-card">
            <div className="dash-card__title">{t('Frequência')}</div>
            <div className="recap__grid">
              <div className="recap__stat"><span className="recap__value">{summary.last7}{goal ? `/${goal}` : ''}</span><span className="recap__label">{t('treinos em 7 dias{v1}', { v1: goal ? ' (meta)' : '' })}</span></div>
              <div className="recap__stat"><span className="recap__value">{summary.last30}</span><span className="recap__label">{t('treinos em 30 dias')}</span></div>
              <div className="recap__stat"><span className="recap__value">{summary.streak ? `🔥 ${summary.streak}` : '—'}</span><span className="recap__label">{t('dias de sequência')}</span></div>
              <div className="recap__stat"><span className="recap__value">{summary.lastDay ? fmtDate(summary.lastDay) : '—'}</span><span className="recap__label">{t('último treino')}</span></div>
            </div>
            <WeeklyBars weeks={weeks} goal={goal} />
          </div>

          {detail.discomfort?.length > 0 && (
            <div className="dash-card">
              <div className="dash-card__title">{t('Desconfortos (30 dias)')}</div>
              <ul className="measure-deltas">
                {detail.discomfort.slice(0, 8).map((x, i) => (
                  <li key={i}>
                    <span>{tEx(x.exercise)} <small>({fmtDate(x.d)})</small>{x.note && <small className="session-ex"> · {x.note}</small>}</span>
                    <strong className={x.severity === 'forte' || x.severity === 'lesao' ? 'measure-deltas__up' : ''}>{SEVERITY[x.severity] || x.severity}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ClientGoals clientId={client.id} />
          <ClientNotes clientId={client.id} />

          <button type="button" className="btn btn--outline btn--full" onClick={handleRemove}>{t('Encerrar acompanhamento')}</button>
        </>
      )}

      {summary && tab === 'treinos' && (
        <>
          <ClientSessions clientId={client.id} />
          {detail.loads?.length > 0 && (
            <div className="dash-card">
              <div className="dash-card__title">{t('Cargas máximas (90 dias)')}</div>
              <ul className="measure-deltas">
                {detail.loads.map(l => (
                  <li key={l.exercise}><span>{tEx(l.exercise)}</span><span><strong>{fmt(l.max)} kg</strong> · {t('{n} treino(s)', { n: l.sessions })}</span></li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {summary && tab === 'evolucao' && (
        <>
          <div className="dash-card">
            <div className="dash-card__title">
              {t('Peso')}{summary.weightDelta !== null && <span className="trainer-delta"> {t('· {v1}{v2} kg no período', { v1: summary.weightDelta > 0 ? '+' : '', v2: fmt(summary.weightDelta) })}</span>}
            </div>
            <div className="line-chart-wrap">
              <LineChart
                points={summary.weights.map(w => ({ label: fmtDate(w.date), value: w.value }))}
                valueSuffix="kg"
                singleMsg={v => t('1 registro: {v}kg', { v })}
                emptyMsg={t('O aluno ainda não registrou o peso.')}
              />
            </div>
          </div>

          {Object.keys(summary.measureDeltas).length > 0 && (
            <div className="dash-card">
              <div className="dash-card__title">{t('Medidas corporais (cm)')}</div>
              <ul className="measure-deltas">
                {MEASURE_FIELDS.filter(({ key }) => summary.measureDeltas[key]).map(({ key, label }) => {
                  const d = summary.measureDeltas[key];
                  return (
                    <li key={key}>
                      <span>{label}</span>
                      <span>{d.first} → {d.last} cm <strong>({d.diff > 0 ? '+' : ''}{fmt(d.diff)})</strong></span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {summary.checkins && (
            <div className="dash-card">
              <div className="dash-card__title">{t('Como ele tem se sentido (30 dias)')}</div>
              <div className="recap__grid">
                {CHECKIN_FIELDS.map(({ key, label }) => (
                  <div className="recap__stat" key={key}>
                    <span className="recap__value">{fmt(summary.checkins[key])}/5</span>
                    <span className="recap__label">{t('{label} · média', { label })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ClientPhotos client={client} />
        </>
      )}

      {summary && tab === 'plano' && (
        <>
          <div className="dash-card">
            <div className="dash-card__title">{t('Plano atual')}</div>
            {detail.plan ? (
              <div className="plan-current">
                <strong>{detail.plan.name}</strong>
                <span className="profile-field__hint" style={{ margin: 0 }}>
                  {t('{n} dia(s) por semana', { n: detail.plan.days })}
                  {client.planName && !client.legacy && version === 0 && <> · <span className={`plan-chip plan-chip--${plan.level}`}>{plan.label}</span></>}
                </span>
                {client.planName && !client.planByMe && !client.legacy && version === 0 && (
                  <span className="profile-field__hint" style={{ margin: 0 }}>{t('Montado pelo aluno ou pelo app, não por você.')}</span>
                )}
              </div>
            ) : (
              <p className="profile-field__hint" style={{ margin: 0 }}>{t('O aluno ainda não tem plano ativo.')}</p>
            )}
            <button type="button" className="btn btn--primary btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setBuilding(true)}>
              📋 {detail.plan ? t('Editar / enviar novo treino') : t('Montar treino')}
            </button>
          </div>

          <ClientPlanHistory clientId={client.id} version={version} />
          <ClientAppointments client={client} />
        </>
      )}

      {summary && tab === 'conversa' && (
        <div className="dash-card">
          <div className="dash-card__title">{t('💬 Conversa com {name}', { name: client.name })}</div>
          <ChatThread
            me="trainer" sendLabel={t('Enviar recado')} onError={friendlyMessageError}
            placeholder={t('Escreva um recado, incentivo ou orientação… (o aluno recebe uma notificação)')}
            load={loadThread} send={sendToClient}
            onLoaded={() => { markThreadRead(client.id).catch(() => { /* sem respostas / migration pendente */ }); }}
          />
        </div>
      )}
    </section>
  );
}
