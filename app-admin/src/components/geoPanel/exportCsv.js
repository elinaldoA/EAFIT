// CSV do painel de localização: monta as linhas do modo que está na tela.
import { toCsv, downloadCsv } from '../../lib/csv';
import { trend, trendLabel, cityKey } from '../../lib/geo';
import { fmtDay } from './config';

export function exportGeoCsv({
  isRetention, isConversion, shownDays, shownEnd, shownMode, retention, conversion, convPrev, view, uf, country, region, regions, summary, regionCmp, cmp, demo, daily, hours, aud, cityPct, current, placeName,
}) {
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
}
