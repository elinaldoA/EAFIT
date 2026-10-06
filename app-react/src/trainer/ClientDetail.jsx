import { useEffect, useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { useToast } from '../context/useToast';
import { fmtDate } from '../lib/utils';
import { MEASURE_FIELDS } from '../lib/bodyMeasurements';
import { CHECKIN_FIELDS } from '../lib/checkin';
import { clientAttention, summarizeClient, fetchClientDetail, removeClient, friendlyTrainerError } from '../lib/trainer';
import LineChart from '../components/LineChart';
import Skeleton from '../components/Skeleton';
import PlanBuilder from './PlanBuilder';
import MessageComposer from './MessageComposer';
import ClientSessions from './ClientSessions';
import ClientNotes from './ClientNotes';
import ClientGoals from './ClientGoals';

const GOALS = {
  massa: 'Ganho de massa', forca: 'Força', emagrecer: 'Emagrecimento',
  definicao: 'Definição', saude: 'Saúde e bem-estar', resistencia: 'Resistência',
};
const LEVELS = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' };
const SEVERITY = { leve: 'Leve', moderada: 'Moderada', forte: 'Forte', lesao: 'Lesão' };
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

  async function handleRemove() {
    if (!window.confirm(`Encerrar o acompanhamento de ${client.name}? Você deixa de ver os dados dele.`)) return;
    try { await removeClient(client.id); toast('Vínculo encerrado'); onRemoved(); }
    catch (err) { toast(`❌ ${friendlyTrainerError(err)}`); }
  }

  if (building) {
    return <PlanBuilder client={client} onBack={() => setBuilding(false)} onSent={() => { setBuilding(false); setVersion(v => v + 1); }} />;
  }

  return (
    <section className="page active trainer-page">
      <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>‹ Voltar aos alunos</button>

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
            {[profile.idade && `${profile.idade} anos`, profile.peso && `${fmt(profile.peso)} kg`, profile.altura && `${profile.altura} cm`, profile.pesoAlvo && `meta ${fmt(profile.pesoAlvo)} kg`].filter(Boolean).join(' · ')}
          </p>
        )}
        {profile.pausedUntil && profile.pausedUntil >= today && (
          <p className="pause-status">⏸ Em pausa até {profile.pausedUntil.split('-').reverse().slice(0, 2).join('/')}</p>
        )}
      </div>

      {failed && <p className="dash-empty">Não foi possível carregar os dados deste aluno.</p>}
      {!detail && !failed && <Skeleton height={140} />}

      {summary && (
        <>
          <div className="dash-card">
            <div className="dash-card__title">Frequência</div>
            <div className="recap__grid">
              <div className="recap__stat"><span className="recap__value">{summary.last7}{goal ? `/${goal}` : ''}</span><span className="recap__label">treinos em 7 dias{goal ? ' (meta)' : ''}</span></div>
              <div className="recap__stat"><span className="recap__value">{summary.last30}</span><span className="recap__label">treinos em 30 dias</span></div>
              <div className="recap__stat"><span className="recap__value">{summary.streak ? `🔥 ${summary.streak}` : '—'}</span><span className="recap__label">dias de sequência</span></div>
              <div className="recap__stat"><span className="recap__value">{summary.lastDay ? fmtDate(summary.lastDay) : '—'}</span><span className="recap__label">último treino</span></div>
            </div>
          </div>

          <ClientSessions clientId={client.id} />

          <div className="dash-card">
            <div className="dash-card__title">
              Peso{summary.weightDelta !== null && <span className="trainer-delta"> · {summary.weightDelta > 0 ? '+' : ''}{fmt(summary.weightDelta)} kg no período</span>}
            </div>
            <div className="line-chart-wrap">
              <LineChart
                points={summary.weights.map(w => ({ label: fmtDate(w.date), value: w.value }))}
                valueSuffix="kg"
                singleMsg={v => `1 registro: ${v}kg`}
                emptyMsg="O aluno ainda não registrou o peso."
              />
            </div>
          </div>

          {Object.keys(summary.measureDeltas).length > 0 && (
            <div className="dash-card">
              <div className="dash-card__title">Medidas corporais (cm)</div>
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
              <div className="dash-card__title">Como ele tem se sentido (30 dias)</div>
              <div className="recap__grid">
                {CHECKIN_FIELDS.map(({ key, label }) => (
                  <div className="recap__stat" key={key}>
                    <span className="recap__value">{fmt(summary.checkins[key])}/5</span>
                    <span className="recap__label">{label} · média</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {detail.discomfort?.length > 0 && (
            <div className="dash-card">
              <div className="dash-card__title">Desconfortos (30 dias)</div>
              <ul className="measure-deltas">
                {detail.discomfort.slice(0, 8).map((x, i) => (
                  <li key={i}>
                    <span>{x.exercise} <small>({fmtDate(x.d)})</small></span>
                    <strong className={x.severity === 'forte' || x.severity === 'lesao' ? 'measure-deltas__up' : ''}>{SEVERITY[x.severity] || x.severity}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detail.loads?.length > 0 && (
            <div className="dash-card">
              <div className="dash-card__title">Cargas máximas (90 dias)</div>
              <ul className="measure-deltas">
                {detail.loads.map(l => (
                  <li key={l.exercise}><span>{l.exercise}</span><span><strong>{fmt(l.max)} kg</strong> · {l.sessions} treino(s)</span></li>
                ))}
              </ul>
            </div>
          )}

          <ClientGoals clientId={client.id} />
          <ClientNotes clientId={client.id} />

          <div className="dash-card">
            <div className="dash-card__title">Plano atual</div>
            <p className="profile-field__hint" style={{ margin: 0 }}>
              {detail.plan ? `${detail.plan.name} · ${detail.plan.days} dia(s)` : 'O aluno ainda não tem plano ativo.'}
            </p>
            <button type="button" className="btn btn--primary btn--sm" style={{ marginTop: 10 }} onClick={() => setBuilding(true)}>
              📋 {detail.plan ? 'Editar / enviar novo treino' : 'Montar treino'}
            </button>
          </div>

          <div className="dash-card">
            <div className="dash-card__title">💬 Recado para {client.name}</div>
            <MessageComposer clientIds={[client.id]} label="Enviar recado" />
          </div>

          <button type="button" className="btn btn--outline btn--full" onClick={handleRemove}>Encerrar acompanhamento</button>
        </>
      )}
    </section>
  );
}
