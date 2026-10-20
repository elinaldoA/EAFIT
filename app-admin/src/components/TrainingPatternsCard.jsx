import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Loading from './Loading';
import { fetchTrainingPatterns } from '../lib/trainingPatterns';

const hh = h => `${String(h).padStart(2, '0')}h`;
const fmtPct = v => (v == null ? '—' : `${v}%`);

// Mapa dia × hora dos treinos e comparação academia × casa (carrega sozinho:
// se a migration não estiver aplicada, só este card mostra o erro).
export default function TrainingPatternsCard() {
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  useEffect(() => {
    let active = true;
    fetchTrainingPatterns(90)
      .then(data => { if (active) setState({ loading: false, data, error: '' }); })
      .catch(err => { if (active) setState({ loading: false, data: null, error: err.message }); });
    return () => { active = false; };
  }, []);

  if (state.loading) return <div className="card"><Loading /></div>;
  if (state.error) return <div className="card"><p className="form-msg form-msg--error">{state.error}</p></div>;
  const { heatmap, places } = state.data;

  return (
    <>
      <div className="card">
        <h2 className="section-title">Quando treinam (dia × hora)</h2>
        {heatmap.total === 0 ? <p className="card-note" style={{ marginTop: 0 }}>Nenhum treino com cronômetro nos últimos 90 dias.</p> : (
          <>
            <div className="heatgrid" role="table" aria-label="Treinos por dia da semana e hora, últimos 90 dias">
              <div className="heatgrid__row" role="row">
                <span className="heatgrid__day" />
                {heatmap.rows[0].cells.map(c => (
                  <span key={c.hour} className="heatgrid__hour" role="columnheader">{c.hour % 3 === 0 ? c.hour : ''}</span>
                ))}
              </div>
              {heatmap.rows.map(r => (
                <div key={r.dow} className="heatgrid__row" role="row">
                  <span className="heatgrid__day" role="rowheader">{r.label}</span>
                  {r.cells.map(c => (
                    <span
                      key={c.hour} role="cell" className={`heatgrid__cell heatgrid__cell--l${c.level}`}
                      title={`${r.label} ${hh(c.hour)}: ${c.sessions} treino(s)`}
                    />
                  ))}
                </div>
              ))}
            </div>
            <p className="card-note">
              Últimos 90 dias, horário de Brasília, pela hora em que o treino começou. Pico: <strong>{heatmap.peakCell.label}</strong>.
              {' '}Sugestão de lembrete: <strong>{hh(heatmap.reminderHour)}</strong> (1 hora antes do horário mais comum) —
              ajuste em <Link to="/automacoes">notificações automáticas</Link>.
              {' '}Janela mais calma (para manutenção ou atualização): <strong>{heatmap.quiet.label}</strong>.
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h2 className="section-title">Academia × em casa</h2>
        <div className="table-wrap">
          <table className="resp-table">
            <thead>
              <tr>
                <th>Local</th><th>Usuários</th><th>Com plano</th><th>Treinaram em 30 dias</th><th>Nunca treinaram</th>
                <th>Treinos/semana</th><th>Retenção (4–12 sem.)</th><th>Com dor ou lesão</th>
              </tr>
            </thead>
            <tbody>
              {places.map(p => (
                <tr key={p.place}>
                  <td data-label="Local">{p.label}</td>
                  <td data-label="Usuários">{p.users}</td>
                  <td data-label="Com plano">{p.withPlan}</td>
                  <td data-label="Treinaram em 30 dias">{fmtPct(p.trained30Pct)}</td>
                  <td data-label="Nunca treinaram">{fmtPct(p.neverPct)}</td>
                  <td data-label="Treinos/semana">{p.sessionsWeek ?? '—'}</td>
                  <td data-label="Retenção (4–12 sem.)">{fmtPct(p.retentionPct)}{p.cohort ? ` de ${p.cohort}` : ''}</td>
                  <td data-label="Com dor ou lesão">{fmtPct(p.painPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="card-note">
          Local = o que a pessoa escolheu no cadastro ou no Perfil (sem escolha conta como academia, o padrão). Retenção =
          entre quem criou conta há 4 a 12 semanas, % que treinou nas últimas 2. Dor = desconforto forte ou lesão em 30 dias.
        </p>
      </div>
    </>
  );
}
