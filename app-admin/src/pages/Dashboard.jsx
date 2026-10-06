import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDashboardStats } from '../lib/dashboardStats';
import Loading from '../components/Loading';
import ActivationFunnel from '../components/ActivationFunnel';
import RetentionCohorts from '../components/RetentionCohorts';
import KpiPanel from '../components/KpiPanel';
import { fetchNewFeedbackCount } from '../lib/feedback';
import AudienceInsights from '../components/AudienceInsights';

const TILES = [
  { key: 'total_users', label: 'Usuários' },
  { key: 'users_last_7d', label: 'Novos (7 dias)' },
  { key: 'users_last_30d', label: 'Novos (30 dias)' },
  { key: 'confirmed_users', label: 'E-mail confirmado' },
  { key: 'banned_users', label: 'Banidos' },
  { key: 'admins_count', label: 'Admins' },
  { key: 'total_workouts', label: 'Treinos feitos' },
  { key: 'workouts_last_7d', label: 'Treinos (7 dias)' },
  { key: 'active_users_7d', label: 'Treinaram (7 dias)' },
  { key: 'push_enabled_users', label: 'Com push ativo' },
];

const DASH_TABS = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'publico', label: 'Público' },
  { key: 'ativacao', label: 'Ativação' },
  { key: 'retencao', label: 'Retenção' },
];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [newFeedback, setNewFeedback] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('resumo');

  useEffect(() => {
    let active = true;
    fetchDashboardStats()
      .then(s => { if (active) setStats(s); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    fetchNewFeedbackCount().then(n => { if (active) setNewFeedback(n); });
    return () => { active = false; };
  }, []);

  if (loading) return <Loading />;
  if (error) return <p className="form-msg form-msg--error">{error}</p>;

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      {newFeedback > 0 && (
        <Link to="/feedback" className="card" style={{ display: 'block', borderColor: 'var(--primary)' }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            💬 {newFeedback} feedback(s) novo(s) de usuários — ver Feedback
          </h2>
        </Link>
      )}

      {Number(stats?.severe_discomfort_30d) > 0 && (
        <Link to="/seguranca" className="card" style={{ display: 'block', borderColor: 'var(--danger)' }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            🩹 {stats.severe_discomfort_30d} relato(s) de dor forte/lesão nos últimos 30 dias — ver Segurança
          </h2>
        </Link>
      )}

      <div className="tabs">
        {DASH_TABS.map(t => (
          <button
            key={t.key}
            className={`tabs__btn ${tab === t.key ? 'tabs__btn--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumo' && (
        <>
          <KpiPanel />

        <h2 className="section-label">Base de usuários</h2>
        <div className="tile-grid">
          {TILES.map(t => (
            <div className="tile" key={t.key}>
              <div className="tile__value">{stats?.[t.key] ?? '—'}</div>
              <div className="tile__label">{t.label}</div>
            </div>
          ))}
        </div>
        </>
      )}
      {tab === 'publico' && <AudienceInsights />}
      {tab === 'ativacao' && <ActivationFunnel />}
      {tab === 'retencao' && <RetentionCohorts />}
    </div>
  );
}
