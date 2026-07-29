import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/supabase';
import Loading from '../components/Loading';

export async function fetchDashboardStats() {
  const { data, error } = await db.rpc('admin_dashboard_stats');
  if (error) throw error;
  return data?.[0] || null;
}

export async function fetchSignupsByDay(days = 14) {
  const { data, error } = await db.rpc('admin_signups_by_day', { days_back: days });
  if (error) throw error;
  return data || [];
}

const TILES = [
  { key: 'total_users', label: 'Usuários' },
  { key: 'users_last_7d', label: 'Novos (7 dias)' },
  { key: 'users_last_30d', label: 'Novos (30 dias)' },
  { key: 'confirmed_users', label: 'E-mail confirmado' },
  { key: 'banned_users', label: 'Banidos' },
  { key: 'admins_count', label: 'Admins' },
  { key: 'total_workouts', label: 'Treinos registrados' },
  { key: 'workouts_last_7d', label: 'Treinos (7 dias)' },
  { key: 'total_food_logs', label: 'Refeições registradas' },
  { key: 'active_users_7d', label: 'Ativos (7 dias)' },
  { key: 'push_enabled_users', label: 'Com push ativo' },
];

function formatDay(iso) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [signups, setSignups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([fetchDashboardStats(), fetchSignupsByDay(14)])
      .then(([s, sig]) => { if (active) { setStats(s); setSignups(sig); } })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <Loading />;
  if (error) return <p className="form-msg form-msg--error">{error}</p>;

  const maxCount = Math.max(1, ...signups.map(s => Number(s.count)));

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      <div className="tile-grid">
        {TILES.map(t => (
          <div className="tile" key={t.key}>
            <div className="tile__value">{stats?.[t.key] ?? '—'}</div>
            <div className="tile__label">{t.label}</div>
          </div>
        ))}
      </div>

      {Number(stats?.severe_discomfort_30d) > 0 && (
        <Link to="/seguranca" className="card" style={{ display: 'block', borderColor: 'var(--danger)' }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            🩹 {stats.severe_discomfort_30d} relato(s) de dor forte/lesão nos últimos 30 dias — ver Segurança
          </h2>
        </Link>
      )}

      <div className="card">
        <h2 className="section-title">Cadastros — últimos 14 dias</h2>
        <div className="bar-chart" role="img" aria-label="Cadastros por dia, últimos 14 dias">
          {signups.map(s => (
            <div className="bar-chart__col" key={s.day} title={`${formatDay(s.day)}: ${s.count} cadastro(s)`}>
              <span className="bar-chart__count">{s.count > 0 ? s.count : ''}</span>
              <div className="bar-chart__bar" style={{ height: `${Math.max(4, (Number(s.count) / maxCount) * 100)}%` }} />
              <span className="bar-chart__day">{formatDay(s.day)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
