// Dois exercícios com o mesmo nome no mesmo dia dividem as mesmas séries: as
// cargas e os ✓ são guardados por (dia, nome, série), no aparelho e no servidor.
// O editor avisa para a pessoa diferenciar o nome ("Rosca Direta (2)").
const norm = nome => String(nome || '').replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim().toLowerCase();

// Nomes repetidos entre as listas de um dia (força e pós-treino): Set de nomes normalizados.
export function repeatedNames(...lists) {
  const seen = new Set();
  const repeated = new Set();
  lists.flat().forEach(ex => {
    const key = norm(ex?.nome);
    if (!key) return;
    if (seen.has(key)) repeated.add(key); else seen.add(key);
  });
  return repeated;
}

export const isRepeatedName = (nome, repeated) => !!repeated && repeated.has(norm(nome));
