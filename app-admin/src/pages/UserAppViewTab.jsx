import { useEffect, useState } from 'react';
import Loading from '../components/Loading';
import { formatDate } from '../lib/userDetailHelpers';
import { formatDay } from '../lib/community';
import { buildAppView, fetchAppView } from '../lib/appView';

// Detalhe do usuário → Visão do app. Só leitura; abrir a aba fica registrado
// na auditoria (viewAsUser).
export default function UserAppViewTab({ userId, plan, metadata }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAppView(userId).then(setData).catch(err => setError(err.message));
  }, [userId]);

  if (error) return <p className="form-msg form-msg--error">{error}</p>;
  if (!data) return <Loading />;
  const v = buildAppView({ plan, metadata, settings: data.settings, view: data.view });

  return (
    <div className="stack">
      <p className="card-note">
        O que o app mostra para esta pessoa hoje ({v.dayName}, {formatDay(v.today)}). Só leitura: nada aqui muda a conta,
        e a abertura desta aba fica no registro de auditoria.
      </p>

      {v.banner && <div className={`banner-preview banner-preview--${v.banner.level || 'info'}`}>📢 {v.banner.message}</div>}
      {v.survey && <div className="card">🗳️ Pesquisa na tela de treino: <strong>{v.survey.question}</strong></div>}

      <div className="tile-grid">
        <div className="tile">
          <div className="tile__value">{v.weekDays}{v.weekGoal ? ` / ${v.weekGoal}` : ''}</div>
          <div className="tile__label">dias treinados nesta semana{v.weekGoal ? ' (meta)' : ''}</div>
        </div>
        <div className="tile"><div className="tile__value">{v.lastDay ? formatDay(v.lastDay) : '—'}</div><div className="tile__label">último treino</div></div>
        <div className="tile"><div className="tile__value">{v.unread}</div><div className="tile__label">notificações não lidas</div></div>
        <div className="tile"><div className="tile__value">{v.theme || '—'}</div><div className="tile__label">tema de temporada · idioma {v.lang}</div></div>
      </div>

      <div className="card">
        <h2 className="section-title">Treino de hoje</h2>
        {v.paused ? <p>⏸ Treinos pausados até {formatDay(v.paused)}: o app não cobra o treino do dia.</p>
          : !v.plan ? <p>Sem plano ativo: o app mostra o convite para gerar um plano.</p>
            : !v.day ? <p>{v.dayName} é dia de descanso no plano “{v.plan.name}”.</p>
              : (
                <>
                  <p><strong>{v.day.foco}</strong> · plano “{v.plan.name}”{v.plan.ended ? ' (período do plano já terminou)' : ''}</p>
                  <ol className="plain-list">
                    {v.day.exercises.map(e => <li key={e.id}>{e.nome} — {e.series}×{e.reps}{e.descanso ? ` · ${e.descanso} descanso` : ''}{e.tecnica ? ` · ${e.tecnica}` : ''}</li>)}
                  </ol>
                </>
              )}
      </div>

      <div className="card">
        <h2 className="section-title">Experimentos</h2>
        {v.experiments.length === 0 ? <p>Fora de experimentos rodando.</p> : (
          <ul className="plain-list">
            {v.experiments.map(e => <li key={e.key}>🧪 {e.name}: variante <strong>{e.variant}</strong>{e.flag ? ` (recurso ${e.flag})` : ''}</li>)}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 className="section-title">Caixa de notificações</h2>
        {v.inbox.length === 0 ? <p>Vazia.</p> : (
          <ul className="plain-list">
            {v.inbox.map((n, i) => (
              <li key={i}>
                {n.read_at ? '' : '🔵 '}<strong>{n.title}</strong> — {n.body}
                <div className="user-detail__meta">{formatDate(n.created_at)}{n.read_at ? ` · lida em ${formatDate(n.read_at)}` : ' · não lida'}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
