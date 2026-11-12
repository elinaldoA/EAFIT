// Avisos de lista cortada pelo servidor. A API do Supabase limita cada resposta (1.000 linhas
// por padrão, ajustável nas configurações do projeto); sem aviso, uma exportação ou uma lista
// grande some com linhas e parece completa.
export const API_ROW_CAP = 1000;

const fmt = n => Number(n).toLocaleString('pt-BR');

// Quando o servidor informa o total (ex.: total_count das listas paginadas): compara o que
// chegou com o que existe. '' quando veio tudo.
export function exportCutNotice(received, total) {
  const got = Number(received);
  const all = Number(total);
  if (!Number.isFinite(got) || !Number.isFinite(all) || got >= all) return '';
  return `Exportei só ${fmt(got)} de ${fmt(all)}: o servidor corta respostas grandes. `
    + 'Filtre por status, nível ou meta e exporte em partes.';
}

// Quando não há total (RPCs que devolvem a lista inteira): chegar exatamente no limite é sinal
// de que pode haver mais linhas do que as mostradas.
export function capNotice(count, what = 'linhas') {
  if (Number(count) < API_ROW_CAP) return '';
  return `A lista chegou ao limite de ${fmt(API_ROW_CAP)} ${what} do servidor: pode haver mais do que as mostradas.`;
}
