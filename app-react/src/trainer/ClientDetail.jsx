import { useCallback, useEffect, useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { useToast } from '../context/useToast';
import { fmtDate } from '../lib/utils';
import { MEASURE_FIELDS } from '../lib/bodyMeasurements';
import { CHECKIN_FIELDS } from '../lib/checkin';
import { clientAttention, summarizeClient, fetchClientDetail, removeClient, friendlyTrainerError } from '../lib/trainer';
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

import { t, tEx } from '../lib/i18n';
const GOALS = {
  massa: t('Ganho de massa'), forca: t('Aumento de força'), emagrecer: t('Emagrecimento'),
  definicao: t('Definição muscular'), saude: t('Saúde e bem-estar'), resistencia: t('Resistência / Condicionamento'),
};
const LEVELS = { iniciante: t('Iniciante'), intermediario: t('Intermediário'), avancado: t('Avançado') };
const SEVERITY = { leve: t('Leve'), moderada: t('Moderada'), forte: t('Forte'), lesao: t('Lesão') };
const fmt = n => String(n).replace('.', ',');

// Ficha de acompanhamento de um aluno (só leitura): frequência, peso, medidas,
// check-ins, desconfortos e cargas. Os dados vêm de trainer_client_detail, que
// só responde se o vínculo com o aluno estiver ativo.
export default function ClientDetail({ client, onBack, onRemoved }) {
  const toast = useToast();
  const [detail, setDetail] = useState(null);
  const [failed, setFailed] = useState(false);
  const [building, setBuilding] = useState(false);
  const [version, setVersion] = useState(0);
  const today = todayDate();

  useEffect(() => {
    let active = true;
    fetchClientDetail(client.id)
      .then(d => { if (active) setDetail(d); })
      .catch(err => { console.error('fetchClientDetail:', err); if (active) setFailed(true); });
    return () => { active = false; };
  }, [client.id, version]);

  const summary = useMemo(() => (detail ? summarizeClient(detail, today) : null), [detail, today]);
  const att = clientAttention(client, today);
  const profile = detail?.profile || {};
  const goal = Number(profile.weeklyGoal) || null;

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

  return (
    <section className="page active trainer-page">
      <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>{t('‹ Voltar aos alunos')}</button>

      <div className="dash-card">
        <div className="client-row__main">
          <strong className="client-name">{client.name}</strong>
          <span className={`client-badge client-badge--${att.level}`}>{att.label}</span>
        </div>
        <p className="profile-field__hint" style={{ margin: '4px 0 0' }}>
          {client.email}
          {profile.meta && ` · ${GOALS[profile.meta] || profile.meta}`}
          {profile.nivel && ` · ${LEVELS[profile.nivel] || profile.nivel}`}
        </p>
        {(profile.peso || profile.altura || profile.idade) && (
          <p className="profile-field__hint" style={{ margin: '2px 0 0' }}>
            {[profile.idade && t('{n} anos', { n: profile.idade }), profile.peso && `${fmt(profile.peso)} kg`, profile.altura && `${profile.altura} cm`, profile.pesoAlvo && t('meta {kg} kg', { kg: fmt(profile.pesoAlvo) })].filter(Boolean).join(' · ')}
          </p>
        )}
        {profile.pausedUntil && profile.pausedUntil >= today && (
          <p className="pause-status">{t('⏸ Em pausa até {v1}', { v1: profile.pausedUntil.split('-').reverse().slice(0, 2).join('/') })}</p>
        )}
      </div>

      {failed && <p className="dash-empty">{t('Não foi possível carregar os dados deste aluno.')}</p>}
      {!detail && !failed && <Skeleton height={140} />}

      {summary && (
        <>
          <div className="dash-card">
            <div className="dash-card__title">{t('Frequência')}</div>
            <div className="recap__grid">
              <div className="recap__stat"><span className="recap__value">{summary.last7}{goal ? `/${goal}` : ''}</span><span className="recap__label">{t('treinos em 7 dias{v1}', { v1: goal ? ' (meta)' : '' })}</span></div>
              <div className="recap__stat"><span className="recap__value">{summary.last30}</span><span className="recap__label">{t('treinos em 30 dias')}</span></div>
              <div className="recap__stat"><span className="recap__value">{summary.streak ? `🔥 ${summary.streak}` : '—'}</span><span className="recap__label">{t('dias de sequência')}</span></div>
              <div className="recap__stat"><span className="recap__value">{summary.lastDay ? fmtDate(summary.lastDay) : '—'}</span><span className="recap__label">{t('último treino')}</span></div>
            </div>
          </div>

          <ClientSessions clientId={client.id} />

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

          {detail.discomfort?.length > 0 && (
            <div className="dash-card">
              <div className="dash-card__title">{t('Desconfortos (30 dias)')}</div>
              <ul className="measure-deltas">
                {detail.discomfort.slice(0, 8).map((x, i) => (
                  <li key={i}>
                    <span>{tEx(x.exercise)} <small>({fmtDate(x.d)})</small></span>
                    <strong className={x.severity === 'forte' || x.severity === 'lesao' ? 'measure-deltas__up' : ''}>{SEVERITY[x.severity] || x.severity}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}

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

          <ClientGoals clientId={client.id} />
          <ClientNotes clientId={client.id} />

          <ClientAppointments client={client} />

          <ClientPhotos client={client} />

          <div className="dash-card">
            <div className="dash-card__title">{t('Plano atual')}</div>
            <p className="profile-field__hint" style={{ margin: 0 }}>
              {detail.plan ? `${detail.plan.name} · ${detail.plan.days} dia(s)` : t('O aluno ainda não tem plano ativo.')}
            </p>
            <button type="button" className="btn btn--primary btn--sm" style={{ marginTop: 10 }} onClick={() => setBuilding(true)}>
              📋 {detail.plan ? t('Editar / enviar novo treino') : t('Montar treino')}
            </button>
          </div>

          <div className="dash-card">
            <div className="dash-card__title">{t('💬 Conversa com {name}', { name: client.name })}</div>
            <ChatThread
              me="trainer" sendLabel={t('Enviar recado')} onError={friendlyMessageError}
              placeholder={t('Escreva um recado, incentivo ou orientação… (o aluno recebe uma notificação)')}
              load={loadThread} send={sendToClient}
              onLoaded={() => { markThreadRead(client.id).catch(() => { /* sem respostas / migration pendente */ }); }}
            />
          </div>

          <button type="button" className="btn btn--outline btn--full" onClick={handleRemove}>{t('Encerrar acompanhamento')}</button>
        </>
      )}
    </section>
  );
}
