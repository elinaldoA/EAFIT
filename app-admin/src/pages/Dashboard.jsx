import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDashboardStats } from '../lib/dashboardStats';
import Loading from '../components/Loading';
import ActivationFunnel from '../components/ActivationFunnel';
import RetentionCohorts from '../components/RetentionCohorts';
import KpiPanel from '../components/KpiPanel';
import { fetchRadar } from '../lib/radar';
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

const RADAR_PREVIEW = 5;
const TONE_ICON = { danger: '⚠', warning: '●', info: '→', good: '▲' };

// Radar: o que mudou e o que fazer, em ordem de prioridade (lib/radar.js).
function Radar({ radar, severe30 }) {
  const [all, setAll] = useState(false);
  if (!radar) return <div className="dash-alert dash-alert--ok">Analisando os números da semana…</div>;
  const items = [...radar.items];
  // A faixa usa 7 dias; relatos mais antigos ainda merecem um lembrete.
  if (severe30 > 0 && !items.some(i => i.key === 'dor')) {
    items.push({ key: 'dor-30d', tone: 'info', text: `${severe30} relato(s) de dor forte/lesão nos últimos 30 dias`, to: '/seguranca', cta: 'Ver segurança' });
  }
  const shown = all ? items : items.slice(0, RADAR_PREVIEW);
  return (
    <>
      {items.length === 0 && (
        <div className="dash-alert dash-alert--ok">
          {radar.partial ? '✓ Nada fora do normal no que deu para verificar.' : '✓ Tudo em dia — nada fora do normal esta semana.'}
        </div>
      )}
      {shown.map(a => (
        <Link key={a.key} to={a.to} className={`dash-alert dash-alert--${a.tone}`}>
          <span><span className="dash-alert__icon" aria-hidden="true">{TONE_ICON[a.tone]}</span>{a.text}</span>
          <span className="dash-alert__cta">{a.cta} →</span>
        </Link>
      ))}
      {items.length > RADAR_PREVIEW && (
        <button type="button" className="btn btn--ghost btn--small dash-alerts__more" onClick={() => setAll(v => !v)}>
          {all ? 'Mostrar menos' : `Ver mais ${items.length - RADAR_PREVIEW}`}
        </button>
      )}
      {radar.partial && items.length > 0 && (
        <p className="section-hint">Algumas fontes não responderam; o radar pode estar incompleto.</p>
      )}
    </>
  );
}

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
  const [radar, setRadar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('resumo');

  useEffect(() => {
    let active = true;
    fetchDashboardStats()
      .then(s => { if (active) setStats(s); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    fetchRadar().then(r => { if (active) setRadar(r); });
    return () => { active = false; };
  }, []);

  const severe = Number(stats?.severe_discomfort_30d) || 0;

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

      <section className="dash-alerts" aria-label="Radar da semana">
        <Radar radar={radar} severe30={severe} />
      </section>

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
