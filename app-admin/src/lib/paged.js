// O PostgREST devolve no máximo 1.000 linhas por consulta e corta o resto sem
// avisar. Para listas que podem crescer (séries de um aluno, desativações,
// demonstrações), busca em páginas até acabar.
//   fetchAllRows(() => db.from('t').select('id, x').order('id'))
// `buildQuery` precisa ordenar por uma coluna única (senão uma página repete ou
// pula linha) e é chamado de novo a cada página.
export const PAGE_SIZE = 1000;
const MAX_PAGES = 100; // trava de segurança: 100 mil linhas

export async function fetchAllRows(buildQuery, pageSize = PAGE_SIZE) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * pageSize;
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}
