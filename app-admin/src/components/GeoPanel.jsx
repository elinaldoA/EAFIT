import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchVisitGeo, fetchAppGeo, fetchUserGeo, fetchUserGeoRetention, retentionByUf, resolveGeoNow, fetchGeoCompare, fetchUserGeoCompare, compareUsers, conversionPrev, fetchGeoDaily, dailySeries, fetchGeoAudience, audience, fetchGeoHours, hourSeries, newPlaces, selectAccessRows, splitSiteApp, summarizeGeo,
  compareGeo, conversionByUf, sortConversion, REGIONS, groupByRegion, regionTrends, rangeFromDates, monthRange, rangeStart, todaySp, trend, trendLabel, demographics, countryName, flag, cityKey, UF_NAMES,
} from '../lib/geo';
import { toCsv, downloadCsv } from '../lib/csv';
import PeriodChart from './PeriodChart';
import Donut from './charts/Donut';
import BrazilMap from './BrazilMap';
import Loading from './Loading';
import RetentionTable from './RetentionTable';
import ConversionTable from './ConversionTable';
import { CitiesTab, CountriesTab } from './GeoTables';
import { Trend, Bars } from './GeoParts';

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
  { key: 'contas', label: 'Contas', unit: 'contas', note: 'Contas que abriram o app no período, pelo último acesso. A seta compara com os dias anteriores pelos dias de uso (uma conta conta uma vez por lugar).' },
  { key: 'retencao', label: 'Retenção', unit: 'estados', note: 'Por estado, pelo último acesso de cada conta: contas, novas no período, ativas no período e retenção (das contas criadas antes do período, quantas voltaram a abrir o app nele).' },
  { key: 'conversao', label: 'Conversão', unit: 'estados', note: 'Por estado: visitas ao site (1 por navegador por dia) × contas que abriram o app no período. Não é taxa de cadastro: mede contas ativas a cada 100 visitas, e as duas contagens não são da mesma coorte.' },
];

const CITIES_PREVIEW = 10;
const CITIES_MAX = 200; // "Ver todas" não despeja milhares de linhas; a busca acha o resto
const STATES_PREVIEW = 8;

// Busca sem diferenciar maiúsculas nem acentos ("sao paulo" acha "São Paulo").
const fold = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Chaves do cache: Tudo, Site e App saem das mesmas consultas (visitas + app),
// então trocar entre eles não consulta de novo. `round` muda no "Atualizar".
// Período na chave do cache: "30" (termina hoje) ou "30@2026-10-31".
const spanKey = (days, end) => (end ? `${days}@${end}` : String(days));
// Modos que olham o último acesso de cada conta: só valem para períodos até hoje.
const TODAY_ONLY = ['contas', 'conversao', 'retencao'];
const dataKey = (round, mode, days) => `${round}:${mode === 'contas' || mode === 'conversao' || mode === 'retencao' ? mode : 'acessos'}:${days}`;
const compareKey = (round, days, kind = 'acessos') => `${round}:comparar:${kind}:${days}`;
// Retenção é só uma tabela por estado: não tem comparação nem gráficos.
const kindOf = mode => (mode === 'retencao' ? null : mode === 'contas' || mode === 'conversao' ? mode : 'acessos');
const isTableMode = mode => mode === 'conversao' || mode === 'retencao';
const dailyKey = (round, days) => `${round}:diario:${days}`;
const audienceKey = (round, days) => `${round}:origem:${days}`;
const hoursKey = (round, days) => `${round}:horas:${days}`;

async function loadAccess(days, end) {
  const [visits, app] = await Promise.all([fetchVisitGeo(days, end), fetchAppGeo(days, end)]);
  return { visits, app };
}

async function loadConversion(days) {
  const [visits, users] = await Promise.all([fetchVisitGeo(days), fetchUserGeo(days)]);
  return { visits, users };
}

// Comparação com o período anterior de cada modo.
const loadCompare = (mode, days, end) => {
  if (mode === 'contas') return fetchUserGeoCompare(days);
  if (mode === 'conversao') return Promise.all([fetchGeoCompare(days), fetchUserGeoCompare(days)]).then(([visits, users]) => ({ visits, users }));
  return fetchGeoCompare(days, end);
};

const loadFor = (mode, days, end) => {
  if (mode === 'contas') return fetchUserGeo(days);
  if (mode === 'conversao') return loadConversion(days);
  if (mode === 'retencao') return fetchUserGeoRetention(days);
  return loadAccess(days, end);
};

// Lembra modo, período e visão entre visitas ao painel (só conveniência: se o
// armazenamento falhar ou vier algo estranho, volta ao padrão).
const PREFS_KEY = 'admin.geo.prefs';
function readPrefs() {
  const out = { days: 30, mode: 'tudo', view: 'brasil' };
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (Number.isInteger(p.days) && p.days >= 1 && p.days <= 366) out.days = p.days;
    if (MODES.some(m => m.key === p.mode)) out.mode = p.mode;
    if (VIEWS.some(v => v.key === p.view)) out.view = p.view;
  } catch { /* sem armazenamento: usa o padrão */ }
  return out;
}

const fmtFull = day => day.split('-').reverse().join('/');
const fmtDay = day => day.split('-').reverse().slice(0, 2).join('/');

// Dashboard → Localização: de onde vêm as visitas e onde estão as contas.
export default function GeoPanel() {
  const [saved] = useState(readPrefs);
  const [days, setDays] = useState(saved.days);
  const [endDay, setEndDay] = useState(null); // null = o período termina hoje
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [mode, setMode] = useState(saved.mode);
  const [view, setView] = useState(saved.view);
  const [uf, setUf] = useState(null);
  const [region, setRegion] = useState(null);
  const [convSort, setConvSort] = useState('visitas');
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

  const sk = spanKey(days, endDay);
  const wantKey = dataKey(round, mode, sk);
  const wantCompare = kindOf(mode) ? compareKey(round, sk, kindOf(mode)) : null;
  // Contas também tem gráfico por dia e por horário (dias de uso das contas logadas).
  const wantDaily = isTableMode(mode) ? null : dailyKey(round, sk);
  const wantAudience = isTableMode(mode) || mode === 'contas' ? null : audienceKey(round, sk);
  const wantHours = isTableMode(mode) ? null : hoursKey(round, sk);

  useEffect(() => {
    const load = (key, fn) => {
      if (requested.current.has(key)) return;
      requested.current.add(key);
      fn()
        .then(value => setStore(s => ({ ...s, [key]: value })))
        .catch(err => { requested.current.delete(key); setFailure({ key, message: err.message }); });
    };
    load(wantKey, () => loadFor(mode, days, endDay));
    // A comparação é um extra: se falhar, o painel segue sem as setas.
    if (wantCompare) load(wantCompare, () => loadCompare(mode, days, endDay).catch(() => null));
    // O gráfico diário também é um extra.
    if (wantDaily) load(wantDaily, () => fetchGeoDaily(days, endDay).catch(() => null));
    if (wantAudience) load(wantAudience, () => fetchGeoAudience(days, endDay).catch(() => null));
    if (wantHours) load(wantHours, () => fetchGeoHours(days, endDay).catch(() => null));
  }, [wantKey, wantCompare, wantDaily, wantAudience, wantHours, mode, days, endDay]);

  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ days, mode, view })); } catch { /* ignora */ }
  }, [days, mode, view]);

  // Depois do "Atualizar", descarta o que veio das rodadas anteriores (só quando
  // a consulta nova já chegou, pra tela não esvaziar no meio).
  const currentLoaded = wantKey in store;
  useEffect(() => {
    if (!currentLoaded) return;
    const old = k => Number(k.split(':')[0]) < round;
    for (const k of [...requested.current]) if (old(k)) requested.current.delete(k);
    setStore(s => (Object.keys(s).some(old) ? Object.fromEntries(Object.entries(s).filter(([k]) => !old(k))) : s));
  }, [currentLoaded, round]);

  // Enquanto o período novo carrega, continua mostrando o anterior.
  // Só o erro da consulta atual aparece (trocar de período tenta de novo).
  const error = failure?.key === wantKey && !(wantKey in store) ? failure.message : '';
  const [shown, setShown] = useState(null);
  if (wantKey in store && (shown?.key !== wantKey || shown.mode !== mode)) setShown({ key: wantKey, mode, days, end: endDay, round });
  const updating = !(wantKey in store) && !error;

  const shownMode = shown?.mode ?? mode;
  const shownDays = shown?.days ?? days;
  const shownEnd = shown ? shown.end : endDay;
  const shownSk = spanKey(shownDays, shownEnd);
  const raw = shown ? store[shown.key] : null;
  const isConversion = shownMode === 'conversao';
  const isRetention = shownMode === 'retencao';
  const isTable = isConversion || isRetention;
  const rawCompare = shown && kindOf(shownMode) ? store[compareKey(shown.round, shownSk, kindOf(shownMode))] : null;

  const rawDaily = shown && !isTable ? store[dailyKey(shown.round, shownSk)] : null;

  const rawAudience = shown && shownMode !== 'contas' && !isTable ? store[audienceKey(shown.round, shownSk)] : null;

  const rawHours = shown && !isTable ? store[hoursKey(shown.round, shownSk)] : null;

  const rows = useMemo(() => {
    if (!raw || isTable) return [];
    return shownMode === 'contas' ? raw : selectAccessRows(raw.visits, raw.app, shownMode);
  }, [raw, shownMode, isTable]);
  const retention = useMemo(() => (isRetention && raw ? retentionByUf(raw) : []), [raw, isRetention]);
  const conversion = useMemo(
    () => (isConversion && raw ? sortConversion(conversionByUf(raw.visits, raw.users), convSort) : []),
    [raw, isConversion, convSort],
  );
  // Algum extra (comparação, dia, horário, origem) falhou: avisa em vez de sumir.
  const extrasFailed = !!shown && !isRetention && (
    store[compareKey(shown.round, shownSk, kindOf(shownMode))] === null
    || (!isConversion
      && (shownMode === 'contas' ? [dailyKey, hoursKey] : [dailyKey, hoursKey, audienceKey]).some(k => store[k(shown.round, shownSk)] === null))
  );

  const countKey = shownMode === 'contas' ? 'users' : 'visits';
  const current = MODES.find(m => m.key === shownMode);
  // Brasil: filtra por estado; Mundo: por país.
  const place = useMemo(() => (view === 'brasil' ? { uf, region } : { country }), [view, uf, region, country]);
  const placeName = view === 'brasil' ? (uf && (UF_NAMES[uf] || uf)) || region : country && countryName(country);
  const summary = useMemo(() => summarizeGeo(rows, countKey, place), [rows, countKey, place]);
  const demo = useMemo(() => (shownMode === 'contas' ? demographics(rows, place) : null), [rows, shownMode, place]);
  const cmp = useMemo(() => {
    if (!rawCompare || isTable) return null;
    return shownMode === 'contas' ? compareUsers(rawCompare) : compareGeo(rawCompare, shownMode);
  }, [rawCompare, shownMode, isTable]);
  const convPrev = useMemo(() => (isConversion && rawCompare ? conversionPrev(rawCompare.visits, rawCompare.users) : null), [rawCompare, isConversion]);
  const daily = useMemo(() => (rawDaily ? dailySeries(rawDaily, shownDays, shownMode, place, shownEnd || undefined) : null), [rawDaily, shownDays, shownEnd, shownMode, place]);
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
  const regionTotal = region ? regions.find(r => r.region === region)?.total || 0 : 0;
  const cityBase = view === 'brasil' ? (uf ? ufTotal : region ? regionTotal : summary.located) : country ? countryTotal : summary.located;
  const query = fold(cityQuery.trim());
  const matches = useMemo(() => (query
    ? summary.cities.filter(c => fold(`${c.city} ${c.place} ${c.country !== 'BR' ? countryName(c.country) : ''}`).includes(query))
    : summary.cities), [summary.cities, query]);
  const cities = allCities || query ? matches.slice(0, CITIES_MAX) : matches.slice(0, CITIES_PREVIEW);
  const regionStates = region ? summary.states.filter(s => REGIONS[region]?.includes(s.uf)) : summary.states;
  const states = allStates || region ? regionStates : regionStates.slice(0, STATES_PREVIEW);
  const freshCount = fresh ? fresh.states.length + fresh.countries.length + fresh.cities.length : 0;
  const hasDaily = !!daily?.some(d => d.total);
  const hasHours = !!hours?.some(h => h.total);
  const tabs = [
    { key: 'cidades', label: 'Cidades' },
    ...(daily ? [{ key: 'dia', label: 'Por dia' }] : []),
    ...(hours ? [{ key: 'hora', label: 'Por horário' }] : []),
    ...(aud ? [{ key: 'origem', label: 'Origem e aparelho' }] : []),
    ...(demo ? [{ key: 'perfil', label: 'Sexo e idade' }] : []),
    ...(view === 'brasil' && summary.countries.length ? [{ key: 'paises', label: 'Países' }] : []),
  ];
  const activeTab = tabs.some(t => t.key === detail) ? detail : 'cidades';
  const cityPct = n => (cityBase > 0 ? Math.round((n / cityBase) * 100) : 0);

  const pickView = v => { setView(v); setUf(null); setRegion(null); setCountry(null); setAllCities(false); setCityQuery(''); };
  const pickUf = v => { setUf(v); setRegion(null); setAllCities(false); setCityQuery(''); };
  const pickRegion = v => { setRegion(v); setUf(null); setAllCities(false); setCityQuery(''); };
  const pickCountry = v => { setCountry(v); setAllCities(false); setCityQuery(''); };
  const refresh = () => setRound(r => r + 1);

  // Período por datas: `r` = { days, end } (ver rangeFromDates). Os modos que
  // dependem do último acesso da conta não têm período passado: volta pra Tudo.
  const applyRange = r => {
    if (!r) return;
    setDays(r.days);
    setEndDay(r.end);
    setCustomDays('');
    if (r.end && TODAY_ONLY.includes(mode)) setMode('tudo');
  };
  const pickMonth = offset => {
    const m = monthRange(offset);
    setRangeFrom(m.from);
    setRangeTo(m.to);
    applyRange(m);
  };

  // "Resolver agora": pede uma rodada da resolve-geo pros IPs pendentes.
  const [resolving, setResolving] = useState('idle');
  const resolveNow = async () => {
    setResolving('busy');
    try { await resolveGeoNow(); setResolving('done'); } catch { setResolving('error'); }
  };

  const exportCsv = () => {
    if (isRetention) {
      downloadCsv(`localizacao_retencao_${shownDays}d.csv`, toCsv(retention.map(r => ({ ...r, retention: r.retention ?? '' })), [
        { key: 'label', label: 'Estado' }, { key: 'total', label: 'Contas' }, { key: 'novas', label: 'Novas no período' },
        { key: 'ativas', label: 'Ativas no período' }, { key: 'antigas', label: 'Contas criadas antes do período' },
        { key: 'antigasAtivas', label: 'Dessas, ativas no período' }, { key: 'retention', label: 'Retenção %' },
      ]));
      return;
    }
    if (isConversion) {
      downloadCsv(`localizacao_conversao_${shownDays}d.csv`, toCsv(conversion.map(c => ({ ...c, rate: c.rate ?? '', prevRate: convPrev?.get(c.uf)?.rate ?? '' })), [
        { key: 'label', label: 'Estado' }, { key: 'visits', label: 'Visitas ao site' },
        { key: 'users', label: 'Contas' }, { key: 'rate', label: 'Contas por 100 visitas' },
        ...(convPrev ? [{ key: 'prevRate', label: `Contas por 100 visitas (${shownDays} dias anteriores)` }] : []),
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
      ...(daily ? daily.map(d => ({ tipo: 'Dia', nome: fmtDay(d.day), total: d.total })) : []),
      ...(hours ? hours.map(h => ({ tipo: 'Horário (Brasília)', nome: `${h.hour}h`, total: h.total })) : []),
      ...(aud?.total > 0 ? [
        ...aud.source.map(x => ({ tipo: 'Origem', nome: x.label, total: x.total, pct: x.pct })),
        ...aud.device.map(x => ({ tipo: 'Aparelho', nome: x.label, total: x.total, pct: x.pct })),
      ] : []),
    ];
    const columns = [
      { key: 'tipo', label: 'Tipo' }, { key: 'nome', label: 'Local' }, { key: 'total', label: current.unit }, { key: 'pct', label: '%' },
      ...(cmp ? [{ key: 'anterior', label: `${shownDays} dias anteriores` }, { key: 'variacao', label: 'Variação' }] : []),
    ];
    const suffix = placeName ? `_${(uf || country || region).toLowerCase()}` : '';
    downloadCsv(`localizacao_${shownMode}_${shownDays}d${shownEnd ? `_ate_${shownEnd}` : ''}${suffix}.csv`, toCsv(out, columns));
  };

  return (
    <div className="stack">
    <div className="card">
      <div className="panel-head panel-head--flush">
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>Onde estão</h2>
          <p className="section-hint">Distribuição geográfica por visitas, contas e uso do app. Escolha o que mostrar e o período.</p>
        </div>
        <div className="geo-controls">
          <div className="seg" role="group" aria-label="O que mostrar">
            {MODES.map(m => (
              <button
                key={m.key} type="button" aria-pressed={mode === m.key}
                className={`seg__btn${mode === m.key ? ' seg__btn--active' : ''}`}
                disabled={!!endDay && TODAY_ONLY.includes(m.key)}
                title={endDay && TODAY_ONLY.includes(m.key) ? 'Só vale para períodos que terminam hoje' : undefined}
                onClick={() => setMode(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Período">
            {PERIODS.map(p => (
              <button
                key={p.days} type="button" aria-pressed={days === p.days && !endDay}
                className={`seg__btn${days === p.days && !endDay ? ' seg__btn--active' : ''}`}
                onClick={() => { setDays(p.days); setEndDay(null); setCustomDays(''); setRangeFrom(''); setRangeTo(''); }}
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
              if (n >= 1 && n <= 366) { setDays(n); setEndDay(null); setRangeFrom(''); setRangeTo(''); }
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
      <form className="geo-controls geo-range" aria-label="Período por datas" onSubmit={e => { e.preventDefault(); applyRange(rangeFromDates(rangeFrom, rangeTo)); }}>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => pickMonth(0)}>Este mês</button>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => pickMonth(-1)}>Mês passado</button>
        <label>
          De{' '}
          <input type="date" className="input" value={rangeFrom} max={todaySp()} onChange={e => setRangeFrom(e.target.value)} />
        </label>
        <label>
          até{' '}
          <input type="date" className="input" value={rangeTo} max={todaySp()} onChange={e => setRangeTo(e.target.value)} />
        </label>
        <button type="submit" className="btn btn--ghost btn--small" disabled={!rangeFromDates(rangeFrom, rangeTo)}>Aplicar</button>
        {endDay && (
          <span className="card-note" style={{ margin: 0 }}>
            Mostrando {fmtFull(rangeStart(days, endDay))} a {fmtFull(endDay)} ({days} dias). Contas, Conversão e Retenção só valem até hoje.
          </span>
        )}
      </form>
    </div>

      {error && <p className="form-msg form-msg--error">{error}</p>}
      {extrasFailed && (
        <p className="form-msg form-msg--error">
          Parte dos detalhes (comparação, por dia, por horário ou origem) não carregou.{' '}
          <button type="button" className="btn btn--ghost btn--small" onClick={refresh}>Tentar de novo</button>
        </p>
      )}
      {!shown ? (!error && <Loading />) : isRetention ? (
        <RetentionTable rows={retention} note={current.note} updating={updating} />
      ) : isConversion ? (
        <ConversionTable rows={conversion} prev={convPrev} sort={convSort} onSort={setConvSort} note={current.note} updating={updating} />
      ) : (
        <div className={updating ? 'geo-body geo-body--updating stack' : 'geo-body stack'} aria-busy={updating}>
          <div className="tile-grid tile-grid--kpi">
            <div className="tile tile--kpi">
              <div className="tile__label">Localizados · de {summary.total} {current.unit}</div>
              <div className="tile__value">{summary.located}</div>
            </div>
            <div className="tile tile--kpi">
              <div className="tile__label">Estados com registros</div>
              <div className="tile__value">{summary.states.length}</div>
            </div>
            <div className="tile tile--kpi">
              <div className="tile__label">Cidades identificadas</div>
              <div className="tile__value">{summary.cities.length}</div>
            </div>
            <div className="tile tile--kpi">
              <div className="tile__label">Registros fora do Brasil</div>
              <div className="tile__value">{summary.abroad}</div>
            </div>
          </div>

          <p className="card-note geo-summary">
            {current.note}
            {split && <> Site: <strong>{split.site}</strong> · App: <strong>{split.app}</strong>.</>}
            {' '}<strong>{summary.located}</strong> localizados de {summary.total}
            {cmp && <> <Trend t={trend(cmp.total)} days={shownDays} /></>}
            {summary.pending > 0 && (
              <>
                {' '}· {summary.pending} aguardando localização{' '}
                <button type="button" className="btn btn--ghost btn--small" onClick={resolveNow} disabled={resolving === 'busy' || resolving === 'done'}>
                  {resolving === 'busy' ? 'Pedindo…' : 'Resolver agora'}
                </button>
                {resolving === 'done' && <> Rodada pedida: leva cerca de um minuto, depois clique em Atualizar.</>}
                {resolving === 'error' && <> Não foi possível pedir a rodada; o cron tenta de novo em até 15 minutos.</>}
              </>
            )}
            {summary.noLocation > 0 && (
              <> · <span title="IP privado, VPN ou rede que o provedor de localização não reconhece">{summary.noLocation} sem localização</span></>
            )}
            {summary.brNoUf > 0 && <> · {summary.brNoUf} no Brasil sem estado identificado</>}
            {summary.abroad > 0 && <> · {summary.abroad} fora do Brasil{view === 'brasil' && ' (veja em Mundo)'}</>}
            {updating && <> · <em>atualizando…</em></>}
          </p>

          {freshCount > 0 && (
            <details className="geo-new geo-summary">
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


          <div className="card geo-grid">
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
                      <Bars rows={regions} onPick={pickRegion} selected={region} trends={regionCmp} days={shownDays} />
                      {region && (
                        <button type="button" className="btn btn--ghost btn--small geo-more" onClick={() => pickRegion(null)}>Ver o Brasil todo</button>
                      )}
                    </>
                  )}
                  <h3 className="subsection-title" style={regions.length > 1 ? undefined : { marginTop: 0 }}>Estados{region ? ` · ${region}` : ''}</h3>
                  <Bars rows={states} onPick={pickUf} selected={uf} trends={cmp?.byUf} days={shownDays} />
                  {!region && summary.states.length > STATES_PREVIEW && (
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

          <div className="card">
          <div className="seg geo-tabs geo-tabs--first" role="group" aria-label="Detalhes">
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
            <CitiesTab
              summary={summary} cities={cities} matches={matches} query={query} cityQuery={cityQuery} onQuery={setCityQuery}
              previewCount={CITIES_PREVIEW} maxRows={CITIES_MAX} allCities={allCities} onToggleAll={() => setAllCities(v => !v)}
              placeName={placeName} cmp={cmp} days={shownDays} cityPct={cityPct}
            />
          )}
          {activeTab === 'dia' && daily && (
            <div className="geo-detail">
              {!hasDaily ? <p className="card-note" style={{ marginTop: 0 }}>Sem {current.unit} localizados por dia{placeName ? ` em ${placeName}` : ''} neste período.</p> : <PeriodChart
                title="Por dia" series={daily.map(d => ({ key: d.day, label: fmtDay(d.day), total: d.total }))}
                unit={current.unit} where={placeName} from={fmtDay(daily[0].day)} to={fmtDay(daily[daily.length - 1].day)}
              />}
            </div>
          )}
          {activeTab === 'hora' && hours && (
            <div className="geo-detail">
              {!hasHours ? <p className="card-note" style={{ marginTop: 0 }}>Sem {current.unit} localizados por horário{placeName ? ` em ${placeName}` : ''} neste período.</p> : <PeriodChart
                title="Por horário (Brasília)" series={hours.map(h => ({ key: h.hour, label: `${h.hour}h`, total: h.total }))}
                unit={current.unit} where={placeName} from="0h" to="23h" cyclic
              />}
            </div>
          )}
          {activeTab === 'origem' && aud && (
            <div className="geo-detail">
              {aud.total > 0 ? (
                <>
                  <h3 className="subsection-title">Origem das visitas{placeName ? ` em ${placeName}` : ''}</h3>
                  <Donut rows={aud.source} />
                  <h3 className="subsection-title">Aparelho{placeName ? ` em ${placeName}` : ''}</h3>
                  <Donut rows={aud.device} />
                </>
              ) : <p className="card-note" style={{ marginTop: 0 }}>Sem visitas com origem e aparelho{placeName ? ` em ${placeName}` : ''} neste período.</p>}
            </div>
          )}
          {activeTab === 'perfil' && demo && (
            <div className="geo-detail">
              <h3 className="subsection-title">Sexo{placeName ? ` em ${placeName}` : ''}</h3>
              <Donut rows={demo.sexo} />
              <h3 className="subsection-title">Faixa etária{placeName ? ` em ${placeName}` : ''}</h3>
              <Donut rows={demo.faixa} ordered />

            </div>
          )}
          {activeTab === 'paises' && <CountriesTab summary={summary} cmp={cmp} days={shownDays} />}
          </div>
        </div>
      )}
    </div>
  );
}
