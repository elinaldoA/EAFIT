import { trend, cityKey, countryName } from '../lib/geo';
import { Trend } from './GeoParts';

// Abas "Cidades" e "Países" do detalhe da Localização.
export function CitiesTab({ summary, cities, matches, query, cityQuery, onQuery, previewCount, maxRows, allCities, onToggleAll, placeName, cmp, days, cityPct }) {
  return (
            <div className="geo-detail">
              <h3 className="subsection-title">Cidades{placeName ? ` em ${placeName}` : ''}</h3>
              {summary.cities.length ? (
                <>
                  {summary.cities.length > previewCount && (
                    <input
                      type="search" className="input geo-search" value={cityQuery} placeholder="Buscar cidade"
                      aria-label="Buscar cidade" onChange={e => onQuery(e.target.value)}
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
                              <th scope="row">{c.city}{c.place ? ` · ${c.place}` : ''}{c.country !== 'BR' ? ` · ${countryName(c.country)}` : ''}</th>
                              <td>{c.total}</td>
                              <td>{cityPct(c.total)}%</td>
                              {cmp && <td><Trend t={trend(cmp.byCity.get(cityKey(c)))} days={days} /></td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="card-note" style={{ marginTop: 0 }}>Nenhuma cidade encontrada para “{cityQuery.trim()}”.</p>}
                  {!query && summary.cities.length > previewCount && (
                    <button type="button" className="btn btn--ghost btn--small geo-more" onClick={() => onToggleAll()}>
                      {allCities ? 'Mostrar menos' : `Ver todas as ${summary.cities.length} cidades`}
                    </button>
                  )}
                  {(allCities || query) && matches.length > maxRows && (
                    <p className="card-note">Mostrando as {maxRows} primeiras de {matches.length}: use a busca para achar uma cidade.</p>
                  )}
                </>
              ) : <p className="card-note" style={{ marginTop: 0 }}>Sem cidade identificada no período.</p>}
            </div>
  );
}

export function CountriesTab({ summary, cmp, days }) {
  return (
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
                      {cmp && <td><Trend t={trend(cmp.byCountry.get(c.code))} days={days} /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="card-note" style={{ marginTop: 0 }}>Nada localizado no período ainda.</p>}
            </div>
  );
}
