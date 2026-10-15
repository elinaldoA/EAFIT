import { useEffect, useMemo, useState } from 'react';
import { fetchVisitGeo, fetchUserGeo, summarizeGeo, demographics, UF_NAMES } from '../lib/geo';
import BrazilMap from './BrazilMap';
import Loading from './Loading';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
];

const MODES = [
  { key: 'visitas', label: 'Visitas', unit: 'visitas', note: 'Visitas ao site e à tela de acesso (1 por navegador por dia).' },
  { key: 'contas', label: 'Contas', unit: 'contas', note: 'Contas que abriram o app no período, pelo último acesso.' },
];

function Bars({ rows, onPick, selected }) {
  if (!rows?.length) return <p className="card-note">Sem dados.</p>;
  return (
    <ul className="dist">
      {rows.map(r => {
        const key = r.uf || r.value || r.code;
        const label = (
          <>
            <span className="dist__label">{r.label}</span>
            <span className="dist__track"><span className="dist__fill" style={{ width: `${Math.max(2, r.pct)}%` }} /></span>
            <span className="dist__value">{r.total} · {r.pct}%</span>
          </>
        );
        return (
          <li key={key}>
            {onPick ? (
              <button type="button" className={`dist__row dist__row--btn${selected === key ? ' dist__row--sel' : ''}`} onClick={() => onPick(selected === key ? null : key)}>
                {label}
              </button>
            ) : <div className="dist__row">{label}</div>}
          </li>
        );
      })}
    </ul>
  );
}

// Dashboard → Localização: de onde vêm as visitas e onde estão as contas.
export default function GeoPanel() {
  const [days, setDays] = useState(30);
  const [mode, setMode] = useState('visitas');
  const [rows, setRows] = useState([]);
  const [uf, setUf] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    (mode === 'contas' ? fetchUserGeo(days) : fetchVisitGeo(days))
      .then(r => { if (active) setRows(r); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, mode]);

  const countKey = mode === 'contas' ? 'users' : 'visits';
  const current = MODES.find(m => m.key === mode);
  const summary = useMemo(() => summarizeGeo(rows, countKey, uf), [rows, countKey, uf]);
  const demo = useMemo(() => (mode === 'contas' ? demographics(rows, uf) : null), [rows, mode, uf]);
  const ufTotal = uf ? summary.byUf.get(uf) || 0 : 0;

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="section-title" style={{ margin: 0 }}>Onde estão</h2>
        <div className="geo-controls">
          <div className="seg" role="group" aria-label="O que mostrar">
            {MODES.map(m => (
              <button
                key={m.key} type="button" aria-pressed={mode === m.key}
                className={`seg__btn${mode === m.key ? ' seg__btn--active' : ''}`}
                onClick={() => { setMode(m.key); setUf(null); }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Período">
            {PERIODS.map(p => (
              <button
                key={p.days} type="button" aria-pressed={days === p.days}
                className={`seg__btn${days === p.days ? ' seg__btn--active' : ''}`}
                onClick={() => setDays(p.days)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? <Loading /> : error ? <p className="form-msg form-msg--error">{error}</p> : (
        <>
          <p className="card-note" style={{ marginTop: 0 }}>
            {current.note} <strong>{summary.located}</strong> localizadas de {summary.total}
            {summary.pending > 0 && <> · {summary.pending} aguardando localização</>}
            {summary.noLocation > 0 && <> · {summary.noLocation} sem localização</>}
            {summary.brNoUf > 0 && <> · {summary.brNoUf} no Brasil sem estado identificado</>}
          </p>

          <div className="geo-grid">
            <BrazilMap byUf={summary.byUf} max={summary.maxUf} selected={uf} onSelect={setUf} unit={current.unit} />

            <div>
              {uf ? (
                <div className="geo-selected">
                  <h3 className="subsection-title" style={{ marginTop: 0 }}>
                    {UF_NAMES[uf]} · {ufTotal} {current.unit}
                    {summary.brTotal > 0 && <> ({Math.round((ufTotal / summary.brTotal) * 100)}% do Brasil)</>}
                  </h3>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => setUf(null)}>Ver o Brasil todo</button>
                </div>
              ) : (
                <>
                  <h3 className="subsection-title" style={{ marginTop: 0 }}>Estados</h3>
                  <Bars rows={summary.states} onPick={setUf} selected={uf} />
                </>
              )}

              {demo && (
                <>
                  <h3 className="subsection-title">Sexo{uf ? ` em ${uf}` : ''}</h3>
                  <Bars rows={demo.sexo} />
                  <h3 className="subsection-title">Faixa etária{uf ? ` em ${uf}` : ''}</h3>
                  <Bars rows={demo.faixa} />
                </>
              )}

              <h3 className="subsection-title">Cidades{uf ? ` em ${uf}` : ''}</h3>
              {summary.cities.length ? (
                <div className="table-wrap">
                  <table className="source-table">
                    <thead><tr><th scope="col">Cidade</th><th scope="col">Total</th></tr></thead>
                    <tbody>
                      {summary.cities.slice(0, 10).map(c => (
                        <tr key={`${c.city}|${c.place}|${c.country}`}>
                          <th scope="row">{c.city}{c.place ? ` · ${c.place}` : ''}{c.country !== 'BR' ? ` · ${c.country}` : ''}</th>
                          <td>{c.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="card-note" style={{ marginTop: 0 }}>Sem cidade identificada no período.</p>}
            </div>
          </div>

          <h3 className="subsection-title">Países</h3>
          {summary.countries.length ? (
            <div className="table-wrap">
              <table className="source-table">
                <thead><tr><th scope="col">País</th><th scope="col">Total</th><th scope="col">%</th></tr></thead>
                <tbody>
                  {summary.countries.map(c => (
                    <tr key={c.code}>
                      <th scope="row"><span aria-hidden="true">{c.flag}</span> {c.label}</th>
                      <td>{c.total}</td>
                      <td>{c.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="card-note" style={{ marginTop: 0 }}>Nada localizado no período ainda.</p>}
        </>
      )}
    </div>
  );
}
