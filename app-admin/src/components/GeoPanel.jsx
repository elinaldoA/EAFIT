import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchVisitGeo, fetchAppGeo, fetchUserGeo, fetchGeoCompare, fetchGeoDaily, dailySeries, fetchGeoAudience, audience, fetchGeoHours, hourSeries, newPlaces, selectAccessRows, splitSiteApp, summarizeGeo,
  compareGeo, conversionByUf, groupByRegion, regionTrends, trend, trendLabel, demographics, countryName, flag, cityKey, UF_NAMES,
} from '../lib/geo';
import { toCsv, downloadCsv } from '../lib/csv';
import BrazilMap from './BrazilMap';
import Loading from './Loading';

const WorldMap = lazy(() => import('./WorldMap'));

const VIEWS = [
  { key: 'brasil', label: 'Brasil' },
  { key: 'mundo', label: 'Mundo' },
];

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
];

const MODES = [
  { key: 'tudo', label: 'Tudo', unit: 'acessos', note: 'Visitas ao site e acessos ao app (1 por navegador ou conta por dia).' },
  { key: 'site', label: 'Site', unit: 'visitas', note: 'Visitas à página de apresentação (1 por navegador por dia).' },
  { key: 'app', label: 'App', unit: 'acessos', note: 'Tela de login de quem chega sem sessão e dias de uso de quem está logado (1 por navegador ou conta por dia).' },
  { key: 'contas', label: 'Contas', unit: 'contas', note: 'Contas que abriram o app no período, pelo último acesso.' },
  { key: 'conversao', label: 'Conversão', unit: 'estados', note: 'Por estado: visitas ao site (1 por navegador por dia) × contas que abriram o app no período. Não é taxa de cadastro: mede contas ativas a cada 100 visitas, e as duas contagens não são da mesma coorte.' },
];

const CITIES_PREVIEW = 10;
const STATES_PREVIEW = 8;

// Busca sem diferenciar maiúsculas nem acentos ("sao paulo" acha "São Paulo").
const fold = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Chaves do cache: Tudo, Site e App saem das mesmas consultas (visitas + app),
// então trocar entre eles não consulta de novo. `round` muda no "Atualizar".
const dataKey = (round, mode, days) => `${round}:${mode === 'contas' || mode === 'conversao' ? mode : 'acessos'}:${days}`;
const compareKey = (round, days) => `${round}:comparar:${days}`;
const dailyKey = (round, days) => `${round}:diario:${days}`;
const audienceKey = (round, days) => `${round}:origem:${days}`;
const hoursKey = (round, days) => `${round}:horas:${days}`;

async function loadAccess(days) {
  const [visits, app] = await Promise.all([fetchVisitGeo(days), fetchAppGeo(days)]);
  return { visits, app };
}

async function loadConversion(days) {
  const [visits, users] = await Promise.all([fetchVisitGeo(days), fetchUserGeo(days)]);
  return { visits, users };
}

const loadFor = (mode, days) => (mode === 'contas' ? fetchUserGeo(days) : mode === 'conversao' ? loadConversion(days) : loadAccess(days));

function Trend({ t, days }) {
  if (!t) return null;
  return (
    <span className={`geo-trend geo-trend--${t.dir}`} title={`Em relação aos ${days} dias anteriores`}>
      {trendLabel(t)}
    </span>
  );
}

function Bars({ rows, onPick, selected, trends, days }) {
  if (!rows?.length) return <p className="card-note">Sem dados.</p>;
  return (
    <ul className="dist">
      {rows.map(r => {
        const key = r.uf || r.region || r.value || r.code;
        const label = (
          <>
            <span className="dist__label">{r.label}</span>
            <span className="dist__track"><span className="dist__fill" style={{ width: `${Math.max(2, r.pct)}%` }} /></span>
            <span className="dist__end">
              <span className="dist__value">{r.total} · {r.pct}%</span>
              {trends && <Trend t={trend(trends.get(key))} days={days} />}
            </span>
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

// Barras simples (por dia ou por hora). `series`: [{ key, label, total }].
function BarChart({ title, series, unit, where, from, to }) {
  const total = series.reduce((sum, d) => sum + d.total, 0);
  if (!total) return null;
  const max = Math.max(...series.map(d => d.total));
  const peak = series.find(d => d.total === max);
  const step = 100 / series.length;
  return (
    <div className="geo-daily">
      <h3 className="subsection-title" style={{ marginTop: 0 }}>{title}{where ? ` em ${where}` : ''}</h3>
      <svg
        className="geo-daily__chart" viewBox="0 0 100 30" preserveAspectRatio="none" role="img"
        aria-label={`${total} ${unit}; pico de ${max} em ${peak.label}`}
      >
        {series.map((d, i) => {
          const h = d.total ? Math.max(1, (d.total / max) * 28) : 0;
          return (
            <rect key={d.key} x={i * step + step * 0.1} y={30 - h} width={step * 0.8} height={h} fill="currentColor">
              <title>{`${d.label}: ${d.total}`}</title>
            </rect>
          );
        })}
      </svg>
      <p className="card-note geo-daily__note">
        {from} a {to} · pico de <strong>{max}</strong> em {peak.label}
      </p>
    </div>
  );
}

const fmtDay = day => day.split('-').reverse().slice(0, 2).join('/');

// Dashboard → Localização: de onde vêm as visitas e onde estão as contas.
export default function GeoPanel() {
  const [days, setDays] = useState(30);
  const [mode, setMode] = useState('tudo');
  const [view, setView] = useState('brasil');
  const [uf, setUf] = useState(null);
  const [country, setCountry] = useState(null);
  const [round, setRound] = useState(0);
  const [store, setStore] = useState({});
  const [failure, setFailure] = useState(null);
  const [allCities, setAllCities] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [customDays, setCustomDays] = useState('');
  const [allStates, setAllStates] = useState(false);
  const [detail, setDetail] = useState('cidades');
  const requested = useRef(new Set());

  const wantKey = dataKey(round, mode, days);
  const wantCompare = mode === 'contas' || mode === 'conversao' ? null : compareKey(round, days);
  const wantDaily = mode === 'contas' || mode === 'conversao' ? null : dailyKey(round, days);
  const wantAudience = mode === 'contas' || mode === 'conversao' ? null : audienceKey(round, days);
  const wantHours = mode === 'contas' || mode === 'conversao' ? null : hoursKey(round, days);

  useEffect(() => {
    const load = (key, fn) => {
      if (requested.current.has(key)) return;
      requested.current.add(key);
      fn()
        .then(value => setStore(s => ({ ...s, [key]: value })))
        .catch(err => { requested.current.delete(key); setFailure({ key, message: err.message }); });
    };
    load(wantKey, () => loadFor(mode, days));
    // A comparação é um extra: se falhar, o painel segue sem as setas.
    if (wantCompare) load(wantCompare, () => fetchGeoCompare(days).catch(() => null));
    // O gráfico diário também é um extra.
    if (wantDaily) load(wantDaily, () => fetchGeoDaily(days).catch(() => null));
    if (wantAudience) load(wantAudience, () => fetchGeoAudience(days).catch(() => null));
    if (wantHours) load(wantHours, () => fetchGeoHours(days).catch(() => null));
  }, [wantKey, wantCompare, wantDaily, wantAudience, wantHours, mode, days]);

  // Enquanto o período novo carrega, continua mostrando o anterior.
  // Só o erro da consulta atual aparece (trocar de período tenta de novo).
  const error = failure?.key === wantKey && !(wantKey in store) ? failure.message : '';
  const [shown, setShown] = useState(null);
  if (wantKey in store && (shown?.key !== wantKey || shown.mode !== mode)) setShown({ key: wantKey, mode, days, round });
  const updating = !(wantKey in store) && !error;

  const shownMode = shown?.mode ?? mode;
  const shownDays = shown?.days ?? days;
  const raw = shown ? store[shown.key] : null;
  const isConversion = shownMode === 'conversao';
  const rawCompare = shown && shownMode !== 'contas' && !isConversion ? store[compareKey(shown.round, shownDays)] : null;

  const rawDaily = shown && shownMode !== 'contas' && !isConversion ? store[dailyKey(shown.round, shownDays)] : null;

  const rawAudience = shown && shownMode !== 'contas' && !isConversion ? store[audienceKey(shown.round, shownDays)] : null;

  const rawHours = shown && shownMode !== 'contas' && !isConversion ? store[hoursKey(shown.round, shownDays)] : null;

  const rows = useMemo(() => {
    if (!raw || isConversion) return [];
    return shownMode === 'contas' ? raw : selectAccessRows(raw.visits, raw.app, shownMode);
  }, [raw, shownMode, isConversion]);
  const conversion = useMemo(() => (isConversion && raw ? conversionByUf(raw.visits, raw.users) : []), [raw, isConversion]);

  const countKey = shownMode === 'contas' ? 'users' : 'visits';
  const current = MODES.find(m => m.key === shownMode);
  // Brasil: filtra por estado; Mundo: por país.
  const place = useMemo(() => (view === 'brasil' ? { uf } : { country }), [view, uf, country]);
  const placeName = view === 'brasil' ? uf && (UF_NAMES[uf] || uf) : country && countryName(country);
  const summary = useMemo(() => summarizeGeo(rows, countKey, place), [rows, countKey, place]);
  const demo = useMemo(() => (shownMode === 'contas' ? demographics(rows, place) : null), [rows, shownMode, place]);
  const cmp = useMemo(() => (rawCompare ? compareGeo(rawCompare, shownMode) : null), [rawCompare, shownMode]);
  const daily = useMemo(() => (rawDaily ? dailySeries(rawDaily, shownDays, shownMode, place) : null), [rawDaily, shownDays, shownMode, place]);
  const aud = useMemo(() => (rawAudience ? audience(rawAudience, shownMode, place) : null), [rawAudience, shownMode, place]);
  const hours = useMemo(() => (rawHours ? hourSeries(rawHours, shownMode, place) : null), [rawHours, shownMode, place]);
  const fresh = useMemo(() => (cmp ? newPlaces(cmp) : null), [cmp]);
  const regions = useMemo(() => groupByRegion(summary.byUf, summary.brTotal), [summary.byUf, summary.brTotal]);
  const regionCmp = useMemo(() => (cmp ? regionTrends(cmp.byUf) : null), [cmp]);
  const ufTotal = uf ? summary.byUf.get(uf) || 0 : 0;
  const countryTotal = country ? summary.byCountry.get(country) || 0 : 0;
  const split = shownMode === 'tudo' ? splitSiteApp(rows) : null;
  const placeSplit = shownMode === 'tudo' && placeName ? splitSiteApp(rows, place) : null;
  // % das cidades sobre os localizados do estado/país escolhido (ou de todos).
  const cityBase = uf && view === 'brasil' ? ufTotal : country && view === 'mundo' ? countryTotal : summary.located;
  const query = fold(cityQuery.trim());
  const matches = useMemo(() => (query
    ? summary.cities.filter(c => fold(`${c.city} ${c.place} ${c.country !== 'BR' ? countryName(c.country) : ''}`).includes(query))
    : summary.cities), [summary.cities, query]);
  const cities = allCities || query ? matches : matches.slice(0, CITIES_PREVIEW);
  const states = allStates ? summary.states : summary.states.slice(0, STATES_PREVIEW);
  const freshCount = fresh ? fresh.states.length + fresh.countries.length + fresh.cities.length : 0;
  const hasDaily = !!daily?.some(d => d.total);
  const hasHours = !!hours?.some(h => h.total);
  const tabs = [
    { key: 'cidades', label: 'Cidades' },
    ...(hasDaily ? [{ key: 'dia', label: 'Por dia' }] : []),
    ...(hasHours ? [{ key: 'hora', label: 'Por horário' }] : []),
    ...(aud?.total > 0 ? [{ key: 'origem', label: 'Origem e aparelho' }] : []),
    ...(demo ? [{ key: 'perfil', label: 'Sexo e idade' }] : []),
    ...(view === 'brasil' && summary.countries.length ? [{ key: 'paises', label: 'Países' }] : []),
  ];
  const activeTab = tabs.some(t => t.key === detail) ? detail : 'cidades';
  const cityPct = n => (cityBase > 0 ? Math.round((n / cityBase) * 100) : 0);

  const pickView = v => { setView(v); setUf(null); setCountry(null); setAllCities(false); };
  const pickUf = v => { setUf(v); setAllCities(false); };
  const pickCountry = v => { setCountry(v); setAllCities(false); };
  const refresh = () => setRound(r => r + 1);

  const exportCsv = () => {
    if (isConversion) {
      downloadCsv(`localizacao_conversao_${shownDays}d.csv`, toCsv(conversion.map(c => ({ ...c, rate: c.rate ?? '' })), [
        { key: 'label', label: 'Estado' }, { key: 'visits', label: 'Visitas ao site' },
        { key: 'users', label: 'Contas' }, { key: 'rate', label: 'Contas por 100 visitas' },
      ]));
      return;
    }
    const withTrend = (map, key) => {
      const v = map?.get(key);
      return { anterior: v ? v.prev : '', variacao: trendLabel(trend(v)) };
    };
    const out = [
      ...(view === 'brasil' && !uf ? regions.map(r => ({ tipo: 'Região', nome: r.label, total: r.total, pct: r.pct, ...withTrend(regionCmp, r.region) })) : []),
      ...summary.states.map(s => ({ tipo: 'Estado', nome: s.label, total: s.total, pct: s.pct, ...withTrend(cmp?.byUf, s.uf) })),
      ...summary.countries.map(c => ({ tipo: 'País', nome: c.label, total: c.total, pct: c.pct, ...withTrend(cmp?.byCountry, c.code) })),
      ...summary.cities.map(c => ({
        tipo: 'Cidade', nome: [c.city, c.place, c.country].filter(Boolean).join(' · '), total: c.total, pct: cityPct(c.total),
        ...withTrend(cmp?.byCity, cityKey(c)),
      })),
      ...(demo ? [
        ...demo.sexo.map(x => ({ tipo: 'Sexo', nome: x.label, total: x.total, pct: x.pct })),
        ...demo.faixa.map(x => ({ tipo: 'Faixa etária', nome: x.label, total: x.total, pct: x.pct })),
      ] : []),
    ];
    const columns = [
      { key: 'tipo', label: 'Tipo' }, { key: 'nome', label: 'Local' }, { key: 'total', label: current.unit }, { key: 'pct', label: '%' },
      ...(cmp ? [{ key: 'anterior', label: `${shownDays} dias anteriores` }, { key: 'variacao', label: 'Variação' }] : []),
    ];
    const suffix = placeName ? `_${(uf || country).toLowerCase()}` : '';
    downloadCsv(`localizacao_${shownMode}_${shownDays}d${suffix}.csv`, toCsv(out, columns));
  };

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
                onClick={() => setMode(m.key)}
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
                onClick={() => { setDays(p.days); setCustomDays(''); }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <form
            className="geo-custom"
            onSubmit={e => {
              e.preventDefault();
              const n = Math.floor(Number(customDays));
              if (n >= 1 && n <= 366) setDays(n);
            }}
          >
            <label>
              Últimos{' '}
              <input
                type="number" min="1" max="366" inputMode="numeric" className="input geo-custom__input"
                value={customDays} placeholder={PERIODS.some(p => p.days === days) ? '…' : String(days)}
                onChange={e => setCustomDays(e.target.value)} onBlur={e => e.currentTarget.form.requestSubmit()}
              />{' '}
              dias
            </label>
          </form>
          <button type="button" className="btn btn--ghost btn--small" onClick={refresh} disabled={updating}>Atualizar</button>
          <button type="button" className="btn btn--ghost btn--small" onClick={exportCsv} disabled={!shown}>Exportar CSV</button>
        </div>
      </div>

      {error && <p className="form-msg form-msg--error">{error}</p>}
      {!shown ? (!error && <Loading />) : isConversion ? (
        <div className={updating ? 'geo-body geo-body--updating' : 'geo-body'} aria-busy={updating}>
          <p className="card-note" style={{ marginTop: 0 }}>
            {current.note}{updating && <> · <em>atualizando…</em></>}
          </p>
          {conversion.length ? (
            <div className="table-wrap">
              <table className="source-table">
                <thead>
                  <tr>
                    <th scope="col">Estado</th><th scope="col">Visitas ao site</th>
                    <th scope="col">Contas</th><th scope="col">Contas por 100 visitas</th>
                  </tr>
                </thead>
                <tbody>
                  {conversion.map(c => (
                    <tr key={c.uf}>
                      <th scope="row">{c.label}</th>
                      <td>{c.visits}</td>
                      <td>{c.users}</td>
                      <td>{c.rate === null ? '—' : c.rate.toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="card-note" style={{ marginTop: 0 }}>Nada localizado no Brasil no período ainda.</p>}
        </div>
      ) : (
        <div className={updating ? 'geo-body geo-body--updating' : 'geo-body'} aria-busy={updating}>
          <p className="card-note" style={{ marginTop: 0 }}>
            {current.note}
            {split && <> Site: <strong>{split.site}</strong> · App: <strong>{split.app}</strong>.</>}
            {' '}<strong>{summary.located}</strong> localizados de {summary.total}
            {cmp && <> <Trend t={trend(cmp.total)} days={shownDays} /></>}
            {summary.pending > 0 && <> · {summary.pending} aguardando localização</>}
            {summary.noLocation > 0 && <> · {summary.noLocation} sem localização</>}
            {summary.brNoUf > 0 && <> · {summary.brNoUf} no Brasil sem estado identificado</>}
            {summary.abroad > 0 && <> · {summary.abroad} fora do Brasil{view === 'brasil' && ' (veja em Mundo)'}</>}
            {updating && <> · <em>atualizando…</em></>}
          </p>

          {freshCount > 0 && (
            <details className="geo-new">
              <summary>Novos neste período ({freshCount})</summary>
              <p className="card-note" style={{ marginTop: 6 }}>
                Sem acesso nos {shownDays} dias anteriores:
              {fresh.states.length > 0 && <> estados: {fresh.states.map(u => UF_NAMES[u] || u).join(', ')}.</>}
              {fresh.countries.length > 0 && <> países: {fresh.countries.map(c => `${flag(c)} ${countryName(c)}`.trim()).join(', ')}.</>}
              {fresh.cities.length > 0 && (
                <> cidades: {fresh.cities.slice(0, 8).map(c => `${c.city}${c.place ? ` · ${c.place}` : ''}`).join(', ')}
                  {fresh.cities.length > 8 && ` e mais ${fresh.cities.length - 8}`}.</>
              )}
              </p>
            </details>
          )}


          <div className="geo-grid">
            <div>
              <div className="seg geo-view" role="group" aria-label="Mapa">
                {VIEWS.map(v => (
                  <button
                    key={v.key} type="button" aria-pressed={view === v.key}
                    className={`seg__btn${view === v.key ? ' seg__btn--active' : ''}`}
                    onClick={() => pickView(v.key)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              {view === 'brasil' ? (
                <BrazilMap byUf={summary.byUf} max={summary.maxUf} selected={uf} onSelect={pickUf} unit={current.unit} />
              ) : (
                <Suspense fallback={<Loading />}>
                  <WorldMap byCountry={summary.byCountry} max={summary.maxCountry} selected={country} onSelect={pickCountry} unit={current.unit} />
                </Suspense>
              )}
            </div>

            <div>
              {view === 'mundo' ? (country ? (
                <div className="geo-selected">
                  <h3 className="subsection-title" style={{ marginTop: 0 }}>
                    <span aria-hidden="true">{flag(country)}</span> {countryName(country)} · {countryTotal} {current.unit}
                    {summary.located > 0 && <> ({Math.round((countryTotal / summary.located) * 100)}% dos localizados)</>}
                    {cmp && <> <Trend t={trend(cmp.byCountry.get(country))} days={shownDays} /></>}
                  </h3>
                  <span className="geo-selected__actions">
                    {country === 'BR' && (
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => pickView('brasil')}>Ver por estado</button>
                    )}
                    <button type="button" className="btn btn--ghost btn--small" onClick={() => pickCountry(null)}>Ver o mundo todo</button>
                  </span>
                </div>
              ) : (
                <>
                  <h3 className="subsection-title" style={{ marginTop: 0 }}>Países</h3>
                  <Bars rows={summary.countries} onPick={pickCountry} selected={country} trends={cmp?.byCountry} days={shownDays} />
                </>
              )) : uf ? (
                <div className="geo-selected">
                  <h3 className="subsection-title" style={{ marginTop: 0 }}>
                    {UF_NAMES[uf] || uf} · {ufTotal} {current.unit}
                    {summary.brTotal > 0 && <> ({Math.round((ufTotal / summary.brTotal) * 100)}% do Brasil)</>}
                    {cmp && <> <Trend t={trend(cmp.byUf.get(uf))} days={shownDays} /></>}
                  </h3>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => pickUf(null)}>Ver o Brasil todo</button>
                </div>
              ) : (
                <>
                  {regions.length > 1 && (
                    <>
                      <h3 className="subsection-title" style={{ marginTop: 0 }}>Regiões</h3>
                      <Bars rows={regions} trends={regionCmp} days={shownDays} />
                    </>
                  )}
                  <h3 className="subsection-title" style={regions.length > 1 ? undefined : { marginTop: 0 }}>Estados</h3>
                  <Bars rows={states} onPick={pickUf} selected={uf} trends={cmp?.byUf} days={shownDays} />
                  {summary.states.length > STATES_PREVIEW && (
                    <button type="button" className="btn btn--ghost btn--small geo-more" onClick={() => setAllStates(v => !v)}>
                      {allStates ? 'Mostrar menos' : `Ver todos os ${summary.states.length} estados`}
                    </button>
                  )}
                </>
              )}
              {placeSplit && (
                <p className="card-note geo-place-split">Site: <strong>{placeSplit.site}</strong> · App: <strong>{placeSplit.app}</strong></p>
              )}

            </div>
          </div>

          <div className="seg geo-tabs" role="group" aria-label="Detalhes">
            {tabs.map(t => (
              <button
                key={t.key} type="button" aria-pressed={activeTab === t.key}
                className={`seg__btn${activeTab === t.key ? ' seg__btn--active' : ''}`}
                onClick={() => setDetail(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === 'cidades' && (
            <div className="geo-detail">
              <h3 className="subsection-title">Cidades{placeName ? ` em ${placeName}` : ''}</h3>
              {summary.cities.length ? (
                <>
                  {summary.cities.length > CITIES_PREVIEW && (
                    <input
                      type="search" className="input geo-search" value={cityQuery} placeholder="Buscar cidade"
                      aria-label="Buscar cidade" onChange={e => setCityQuery(e.target.value)}
                    />
                  )}
                  {cities.length ? (
                    <div className="table-wrap">
                      <table className="source-table">
                        <thead>
                          <tr>
                            <th scope="col">Cidade</th><th scope="col">Total</th><th scope="col">%</th>
                            {cmp && <th scope="col">Variação</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {cities.map(c => (
                            <tr key={cityKey(c)}>
                              <th scope="row">{c.city}{c.place ? ` · ${c.place}` : ''}{c.country !== 'BR' ? ` · ${c.country}` : ''}</th>
                              <td>{c.total}</td>
                              <td>{cityPct(c.total)}%</td>
                              {cmp && <td><Trend t={trend(cmp.byCity.get(cityKey(c)))} days={shownDays} /></td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="card-note" style={{ marginTop: 0 }}>Nenhuma cidade encontrada para “{cityQuery.trim()}”.</p>}
                  {!query && summary.cities.length > CITIES_PREVIEW && (
                    <button type="button" className="btn btn--ghost btn--small geo-more" onClick={() => setAllCities(v => !v)}>
                      {allCities ? 'Mostrar menos' : `Ver todas as ${summary.cities.length} cidades`}
                    </button>
                  )}
                </>
              ) : <p className="card-note" style={{ marginTop: 0 }}>Sem cidade identificada no período.</p>}
            </div>
          )}
          {activeTab === 'dia' && daily && (
            <div className="geo-detail">
              <BarChart
                title="Por dia" series={daily.map(d => ({ key: d.day, label: fmtDay(d.day), total: d.total }))}
                unit={current.unit} where={placeName} from={fmtDay(daily[0].day)} to={fmtDay(daily[daily.length - 1].day)}
              />
            </div>
          )}
          {activeTab === 'hora' && hours && (
            <div className="geo-detail">
              <BarChart
                title="Por horário (Brasília)" series={hours.map(h => ({ key: h.hour, label: `${h.hour}h`, total: h.total }))}
                unit={current.unit} where={placeName} from="0h" to="23h"
              />
            </div>
          )}
          {activeTab === 'origem' && aud?.total > 0 && (
            <div className="geo-detail">
              {aud?.total > 0 && (
                <>
                  <h3 className="subsection-title">Origem das visitas{placeName ? ` em ${placeName}` : ''}</h3>
                  <Bars rows={aud.source} />
                  <h3 className="subsection-title">Aparelho{placeName ? ` em ${placeName}` : ''}</h3>
                  <Bars rows={aud.device} />
                </>
              )}

            </div>
          )}
          {activeTab === 'perfil' && demo && (
            <div className="geo-detail">
              {demo && (
                <>
                  <h3 className="subsection-title">Sexo{placeName ? ` em ${placeName}` : ''}</h3>
                  <Bars rows={demo.sexo} />
                  <h3 className="subsection-title">Faixa etária{placeName ? ` em ${placeName}` : ''}</h3>
                  <Bars rows={demo.faixa} />
                </>
              )}

            </div>
          )}
          {activeTab === 'paises' && (
            <div className="geo-detail">
          {summary.countries.length ? (
            <div className="table-wrap">
              <table className="source-table">
                <thead><tr><th scope="col">País</th><th scope="col">Total</th><th scope="col">%</th>{cmp && <th scope="col">Variação</th>}</tr></thead>
                <tbody>
                  {summary.countries.map(c => (
                    <tr key={c.code}>
                      <th scope="row"><span aria-hidden="true">{c.flag}</span> {c.label}</th>
                      <td>{c.total}</td>
                      <td>{c.pct}%</td>
                      {cmp && <td><Trend t={trend(cmp.byCountry.get(c.code))} days={shownDays} /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="card-note" style={{ marginTop: 0 }}>Nada localizado no período ainda.</p>}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
