import { cleanRoute } from './route';

// Mapa de calor pessoal: todos os percursos juntos num mapa só. Quem corre em mais
// de uma cidade teria um mapa do tamanho do país, então fica a região onde mais
// correu (um quadrado de ~0,5° e os vizinhos) e o resto é contado à parte.
const CELL = 0.5; // graus
const SCALE = 1e5;

const cellOf = seg => [Math.floor(seg[0][0] / SCALE / CELL), Math.floor(seg[0][1] / SCALE / CELL)];

// { route, runs, hidden }: route = todos os trechos da região principal (para o
// RouteDrawing em modo heat), runs = quantas corridas entraram e hidden = quantas
// ficaram de fora por serem de outra região. null sem nenhum percurso.
export function heatmapRoute(runs) {
  const items = [];
  for (const r of runs) {
    const segs = cleanRoute(r.route);
    if (segs.length) items.push({ segs, cell: cellOf(segs[0]) });
  }
  if (!items.length) return null;
  const count = new Map();
  for (const { cell } of items) count.set(cell.join(','), (count.get(cell.join(',')) || 0) + 1);
  const [best] = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  const [bx, by] = best.split(',').map(Number);
  const near = items.filter(({ cell }) => Math.abs(cell[0] - bx) <= 1 && Math.abs(cell[1] - by) <= 1);
  // Muitos pontos pesam no SVG: no máximo ~60 mil no total, tirando um sim, um não.
  const total = near.reduce((n, { segs }) => n + segs.reduce((m, s) => m + s.length, 0), 0);
  const step = Math.max(1, Math.ceil(total / 60000));
  const route = near.flatMap(({ segs }) => segs.map(seg => {
    const thin = seg.filter((_, i) => i % step === 0 || i === seg.length - 1);
    return thin.map(p => [p[0], p[1]]);
  })).filter(seg => seg.length >= 2);
  return { route, runs: near.length, hidden: items.length - near.length };
}
