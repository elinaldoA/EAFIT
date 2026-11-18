import { useMemo, useState } from 'react';
import { TIMELINE_BUCKETS, TIMELINE_SPAN } from '../../lib/behavior';
import LineChart from '../charts/LineChart';
import { useLoad } from './useLoad';
import { Card, CountTable } from './parts';
import { loadTimeline } from './loaders';

const TIMELINE_SERIES = [{ key: 'app', label: 'App' }, { key: 'site', label: 'Site' }];

// App e site como duas linhas no mesmo eixo (mesma unidade: acessos).
function TimelineChart({ series }) {
  return (
    <LineChart
      points={series} series={TIMELINE_SERIES} ariaLabel="Acessos no tempo, app e site" height={170}
      title={s => s.full} extra={s => `${s.total} no total`}
    />
  );
}

export default function AccessTimeline({ days }) {
  const [bucket, setBucket] = useState('dia');
  const args = useMemo(() => ({ bucket, days }), [bucket, days]);
  const state = useLoad(loadTimeline, args);
  return (
    <Card
      title="Acessos no tempo" state={state}
      note="Horário de Brasília. Site = visitas anônimas à landing e à tela de acesso (1 por navegador por dia). App = aberturas por quem está logado, no máximo 1 a cada 5 minutos por pessoa; antes desta medição só se sabe o dia. Admins não entram."
    >
      {data => (
        <>
          <div className="card-head" style={{ marginBottom: 10 }}>
            <div className="seg" role="group" aria-label="Agrupar acessos">
              {TIMELINE_BUCKETS.map(b => (
                <button
                  key={b.key} type="button" aria-pressed={bucket === b.key}
                  className={`seg__btn${bucket === b.key ? ' seg__btn--active' : ''}`}
                  onClick={() => setBucket(b.key)}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {TIMELINE_SPAN[bucket] && <span className="card-note" style={{ margin: 0 }}>{TIMELINE_SPAN[bucket].note}</span>}
          </div>
          <div className="tile-grid" style={{ marginBottom: 14 }}>
            <div className="tile"><div className="tile__value">{data.app}</div><div className="tile__label">Aberturas do app</div></div>
            <div className="tile"><div className="tile__value">{data.site}</div><div className="tile__label">Visitas ao site</div></div>
            <div className="tile"><div className="tile__value">{data.peak ? data.peak.full : '—'}</div><div className="tile__label">Mais movimentado{data.peak ? ` (${data.peak.total})` : ''}</div></div>
          </div>
          <TimelineChart series={data.series} />
          <CountTable
            head={['Quando', 'App', 'Pessoas no app', 'Site']} empty="Nenhum acesso no período."
            rows={data.active.slice(0, 100).map(s => ({ key: s.key, label: s.full, cells: [s.app, s.users, s.site] }))}
          />
        </>
      )}
    </Card>
  );
}
