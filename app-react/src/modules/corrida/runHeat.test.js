import { describe, it, expect } from 'vitest';
import { heatmapRoute } from './runHeat';

const run = (lat, lon, n = 5) => ({ route: [Array.from({ length: n }, (_, i) => [Math.round((lat + i * 0.0005) * 1e5), Math.round(lon * 1e5)])] });

describe('mapa de calor', () => {
  it('sem percurso não há mapa', () => {
    expect(heatmapRoute([])).toBeNull();
    expect(heatmapRoute([{ route: [] }])).toBeNull();
  });
  it('junta os percursos da região onde mais correu e conta o que ficou de fora', () => {
    const sp = [run(-23.55, -46.65), run(-23.56, -46.66), run(-23.54, -46.64)];
    const rio = [run(-22.9, -43.2)];
    const heat = heatmapRoute([...sp, ...rio]);
    expect(heat.runs).toBe(3);
    expect(heat.hidden).toBe(1);
    expect(heat.route).toHaveLength(3);
  });
  it('desenha só [lat, lon] (o tempo do ponto não importa) e ignora percurso com 1 ponto', () => {
    const heat = heatmapRoute([{ route: [[[-2355000, -4665000, 10], [-2354900, -4665000, 20]]] }, { route: [[[1, 1]]] }]);
    expect(heat.route[0]).toEqual([[-2355000, -4665000], [-2354900, -4665000]]);
  });
});
