import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDashboardStats } from '../lib/dashboardStats';
import Loading from '../components/Loading';
import ActivationFunnel from '../components/ActivationFunnel';
import RetentionCohorts from '../components/RetentionCohorts';
import KpiPanel from '../components/KpiPanel';
import { fetchNewFeedbackCount } from '../lib/feedback';
import AudienceInsights from '../components/AudienceInsights';
import GeoPanel from '../components/GeoPanel';
import InstallPanel from '../components/InstallPanel';

function pctOf(part, total) {
  const p = Number(part);
  const t = Number(total);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return null;
  return `${Math.round((p / t) * 100)}% da base`;
}

// Base de usuários em 3 grupos; `of: true` mostra o % sobre o total de usuários.
const BASE_GROUPS = [
  {
    title: 'Crescimento',
    tiles: [
      { key: 'total_users', label: 'Usuários cadastrados' },
      { key: 'users_last_7d', label: 'Novos nos últimos 7 dias' },
      { key: 'users_last_30d', label: 'Novos nos últimos 30 dias' },
    ],
  },
  {
    title: 'Qualidade da base',
    tiles: [
      { key: 'confirmed_users', label: 'E-mail confirmado', of: true },
      { key: 'push_enabled_users', label: 'Com push ativo', of: true },
      { key: 'banned_users', label: 'Banidos', tone: 'danger' },
      { key: 'admins_count', label: 'Admins' },
    ],
  },
  {
    title: 'Treinos',
    tiles: [
      { key: 'total_workouts', label: 'Treinos feitos (total)' },
      { key: 'workouts_last_7d', label: 'Treinos nos últimos 7 dias' },
      { key: 'active_users_7d', label: 'Treinaram nos últimos 7 dias', of: true },
    ],
  },
];

const DASH_TABS = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'publico', label: 'Público' },
  { key: 'localizacao', label: 'Localização' },
  { key: 'instalacoes', label: 'Instalações' },
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

  const severe = Number(stats?.severe_discomfort_30d) || 0;
  const alerts = [];
  if (severe > 0) alerts.push({ to: '/seguranca', tone: 'danger', text: `🩹 ${severe} relato(s) de dor forte/lesão nos últimos 30 dias`, cta: 'Ver Segurança' });
  if (newFeedback > 0) alerts.push({ to: '/feedback', tone: 'warning', text: `💬 ${newFeedback} feedback(s) novo(s) de usuários`, cta: 'Ver Feedback' });

  if (loading) return <Loading />;
  if (error) return <p className="form-msg form-msg--error">{error}</p>;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Visão geral do EAFIT: crescimento, uso e o que precisa da sua atenção.</p>
        </div>
      </div>

      <div className="dash-alerts" aria-label="Pendências">
        {alerts.length === 0 ? (
          <div className="dash-alert dash-alert--ok">✓ Tudo em dia — nenhuma pendência no momento.</div>
        ) : alerts.map(a => (
          <Link key={a.to} to={a.to} className={`dash-alert dash-alert--${a.tone}`}>
            <span>{a.text}</span>
            <span className="dash-alert__cta">{a.cta} →</span>
          </Link>
        ))}
      </div>

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

          <section className="stack" aria-labelledby="dash-base">
            <div>
              <h2 className="section-title" id="dash-base" style={{ margin: 0 }}>Base de usuários</h2>
              <p className="section-hint">Totais acumulados, sem filtro de período.</p>
            </div>
            <div className="dash-groups">
              {BASE_GROUPS.map(g => (
                <div className="card dash-group" key={g.title}>
                  <h3 className="dash-group__title">{g.title}</h3>
                  <dl className="dash-group__list">
                    {g.tiles.map(t => (
                      <div className="dash-stat" key={t.key}>
                        <dt>{t.label}</dt>
                        <dd className={t.tone === 'danger' && Number(stats?.[t.key]) > 0 ? 'dash-stat__num--danger' : undefined}>
                          {stats?.[t.key] ?? '—'}
                          {t.of && pctOf(stats?.[t.key], stats?.total_users) && (
                            <small>{pctOf(stats?.[t.key], stats?.total_users)}</small>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {tab === 'publico' && <AudienceInsights />}
      {tab === 'localizacao' && <GeoPanel />}
      {tab === 'instalacoes' && <InstallPanel />}
      {tab === 'ativacao' && <ActivationFunnel />}
      {tab === 'retencao' && <RetentionCohorts />}
    </div>
  );
}
