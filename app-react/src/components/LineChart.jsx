import { useId } from 'react';

export default function LineChart({ points: rawPoints, emptyMsg, singleMsg, valueSuffix = '' }) {
  const svgId = useId();
  // Um valor não numérico (coluna nula, texto) virava NaN nas coordenadas e
  // quebrava o SVG inteiro — descarta o ponto em vez de desenhar lixo.
  const points = rawPoints.filter(p => Number.isFinite(p.value));

  if (points.length < 2) {
    const msg = points.length === 1 && singleMsg ? singleMsg(points[0].value) : (emptyMsg || 'Nenhum registro disponível');
    return <p className="dash-empty">{msg}</p>;
  }

  const W = 300, H = 120, pX = 12, pY = 18, pB = 22;
  const cW = W - pX * 2, cH = H - pY - pB;
  const values = points.map(p => p.value);
  const labels = points.map(p => p.label);
  const minV = Math.min(...values), maxV = Math.max(...values);
  const rangeV = maxV - minV || 1;

  const toXY = (i) => ({
    x: pX + (i / (values.length - 1)) * cW,
    y: pY + cH - ((values[i] - minV) / rangeV) * cH,
  });

  const coords = values.map((_, i) => toXY(i));
  const polyPoints = coords.map(p => `${p.x},${p.y}`).join(' ');
  const areaPoints = [`${pX},${pY + cH}`, ...coords.map(p => `${p.x},${p.y}`), `${pX + cW},${pY + cH}`].join(' ');

  const maxI = values.indexOf(maxV);
  const { x: mX, y: mY } = toXY(maxI);

  return (
    <svg className="line-chart" viewBox="0 0 300 120">
      <defs>
        <linearGradient id={`ag-${svgId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#ag-${svgId})`} />
      <polyline points={polyPoints} fill="none" stroke="var(--primary)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="3.5" fill="var(--primary)" stroke="var(--bg)" strokeWidth="1.5" />
      ))}
      {[0, values.length - 1].map(i => {
        const { x } = toXY(i);
        return (
          <text key={i} x={x.toFixed(1)} y={H - 4} textAnchor={i === 0 ? 'start' : 'end'} fontSize="8.5" fill="var(--text-dim)">
            {labels[i]}
          </text>
        );
      })}
      <text x={mX.toFixed(1)} y={(mY - 8).toFixed(1)} textAnchor="middle" fontSize="9.5" fontWeight="bold" fill="var(--primary)">
        {maxV.toLocaleString('pt-BR')}{valueSuffix}
      </text>
    </svg>
  );
}
