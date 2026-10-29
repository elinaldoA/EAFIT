// Contas dos gráficos (charts/*), separadas para dar para testar sem DOM.

// Marcas "redondas" do eixo Y: 0, meio e topo, com o topo em 1/2/2,5/5 × 10^n
// logo acima do máximo. Inteiros sempre (os gráficos contam pessoas e eventos).
export function chartTicks(max) {
  const m = Number(max) || 0;
  if (m <= 0) return [0, 1];
  if (m <= 2) return [0, 1, 2];
  const raw = m / 2;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw && Number.isInteger(s)) ?? Math.ceil(raw);
  return [0, step, step * 2];
}

// Fatias da rosca: no máximo `max`; passando disso, as maiores ficam e o
// resto vira "Outros". `ordered` mantém a ordem das faixas (durações, idade).
export function donutSlices(rows, { max = 6, ordered = false } = {}) {
  const list = (rows || [])
    .map(r => ({ key: String(r.key ?? r.value ?? r.label), label: r.label, total: Number(r.total) || 0 }))
    .filter(r => r.total > 0);
  const sum = list.reduce((t, r) => t + r.total, 0);
  if (!sum) return { sum: 0, slices: [] };
  let slices = ordered ? list : [...list].sort((a, b) => b.total - a.total);
  if (slices.length > max) {
    const keep = [...slices].sort((a, b) => b.total - a.total).slice(0, max - 1);
    const kept = new Set(keep.map(s => s.key));
    const rest = slices.filter(s => !kept.has(s.key));
    slices = [...slices.filter(s => kept.has(s.key)), {
      key: '__outros__', label: `Outros (${rest.length})`, total: rest.reduce((t, r) => t + r.total, 0), other: true,
    }];
  }
  return { sum, slices: slices.map(s => ({ ...s, pct: Math.round((s.total / sum) * 1000) / 10 })) };
}

// Intensidade (0–1) de cada célula do mapa de calor; zero fica sem cor.
export function heatLevels(values) {
  const max = Math.max(0, ...values.map(v => Number(v) || 0));
  return values.map(v => (max > 0 && Number(v) > 0 ? Number(v) / max : 0));
}
