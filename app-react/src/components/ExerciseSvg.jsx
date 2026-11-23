import { useEffect, useMemo, useRef, useState } from 'react';
import { ANIMATIONS } from '../data/exerciseSvg';
import { buildTimeline, FAR_OFFSET, layout, LEN, sample, THICK } from '../lib/exerciseFigure';
import { t } from '../lib/i18n';

const GROUND = 160; // y do SVG onde fica o topo do tapete
const SPEEDS = [{ rate: 1, label: t('Normal') }, { rate: 0.5, label: t('Câmera lenta') }];

export const MUSCLE_LABEL = {
  abs: t('Abdômen'), lowback: t('Lombar'), glutes: t('Glúteos'), quads: t('Quadríceps'),
  hams: t('Posteriores de coxa'), calves: t('Panturrilhas'), chest: t('Peito'), shoulders: t('Ombros'),
  triceps: t('Tríceps'), biceps: t('Bíceps'), hipflex: t('Flexores do quadril'),
};

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

const px = ([x, y], far = false) => [x + (far ? FAR_OFFSET[0] : 0), GROUND - (y + (far ? FAR_OFFSET[1] : 0))];
const fmt = pts => pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

// Ponto a uma fração s (0–1) do caminho quadril→cintura→ombro, mais a normal local
// (o lado da frente do corpo é facing * (dy, -dx)).
function onTorso(l, s) {
  const total = LEN.lower + LEN.upper;
  const d = s * total;
  const [a, b] = d <= LEN.lower ? [l.hip, l.waist] : [l.waist, l.shoulder];
  const k = d <= LEN.lower ? d / LEN.lower : (d - LEN.lower) / LEN.upper;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] };
}

function torsoSlice(l, s0, s1, off, facing) {
  const steps = [s0, ...(s0 < LEN.lower / 58 && s1 > LEN.lower / 58 ? [LEN.lower / 58] : []), s1];
  return steps.map(s => {
    const { p, dir } = onTorso(l, s);
    const n = [dir[1] * facing, -dir[0] * facing];
    return [p[0] + n[0] * off, p[1] + n[1] * off];
  });
}

function MuscleLayer({ muscles, l, facing, e }) {
  const style = { opacity: 0.28 + 0.68 * e };
  const stroke = (pts, w, key) => (
    <polyline key={key} points={fmt(pts.map(p => px(p)))} fill="none" className="fig__muscle" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
  );
  const dot = (p, r, key) => {
    const [x, y] = px(p);
    return <circle key={key} cx={x} cy={y} r={r} className="fig__muscle" />;
  };
  const parts = [];
  for (const m of muscles) {
    if (m === 'abs') parts.push(stroke(torsoSlice(l, 0.2, 0.9, 3, facing), 9, m));
    else if (m === 'lowback') parts.push(stroke(torsoSlice(l, 0.05, 0.6, -3, facing), 9, m));
    else if (m === 'chest') parts.push(stroke(torsoSlice(l, 0.68, 0.96, 3, facing), 9, m));
    else if (m === 'glutes') parts.push(dot(torsoSlice(l, 0.02, 0.02, -2, facing)[0], 9, m));
    else if (m === 'shoulders') parts.push(dot(l.shoulder, 7, m));
    else if (m === 'quads' || m === 'hams') {
      for (const k of ['leg', 'leg2']) parts.push(stroke(l[k].slice(0, 2), 8, `${m}${k}`));
    } else if (m === 'calves') {
      for (const k of ['leg', 'leg2']) parts.push(stroke(l[k].slice(1), 6, `${m}${k}`));
    } else if (m === 'triceps' || m === 'biceps') {
      for (const k of ['arm', 'arm2']) parts.push(stroke(l[k].slice(0, 2), 6, `${m}${k}`));
    } else if (m === 'hipflex') {
      for (const k of ['leg', 'leg2']) {
        const [a, b] = l[k];
        parts.push(stroke([a, [a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55]], 7, `${m}${k}`));
      }
    }
  }
  return <g style={style}>{parts}</g>;
}

function Limb({ pts, widths, far }) {
  const p = pts.map(q => px(q, far));
  return (
    <g className={far ? 'fig__limb fig__limb--far' : 'fig__limb'}>
      {[0, 1].map(i => (
        <line key={i} x1={p[i][0]} y1={p[i][1]} x2={p[i + 1][0]} y2={p[i + 1][1]} strokeWidth={widths[i]} strokeLinecap="round" />
      ))}
    </g>
  );
}

export function FigureSvg({ anim, c, title }) {
  const l = layout(c);
  const torso = [l.hip, l.waist, l.shoulder].map(q => px(q));
  const [hx, hy] = px(l.head);
  const nose = (() => {
    // Rosto no lado da frente do corpo (mesmo critério dos músculos).
    const dx = l.head[0] - l.shoulder[0];
    const dy = l.head[1] - l.shoulder[1];
    const n = Math.hypot(dx, dy) || 1;
    return px([l.head[0] + ((dy / n) * anim.facing) * THICK.head, l.head[1] - ((dx / n) * anim.facing) * THICK.head]);
  })();
  return (
    <svg className="fig" viewBox="15 44 260 146" role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
      <rect className="fig__mat" x="15" y={GROUND} width="260" height="9" rx="4" />
      <Limb pts={l.leg2} widths={[THICK.thigh, THICK.shin]} far />
      <Limb pts={l.arm2} widths={[THICK.uarm, THICK.farm]} far />
      <polyline className="fig__torso" points={fmt(torso)} fill="none" strokeWidth={THICK.torso} strokeLinecap="round" strokeLinejoin="round" />
      <Limb pts={l.leg} widths={[THICK.thigh, THICK.shin]} />
      <Limb pts={l.arm} widths={[THICK.uarm, THICK.farm]} />
      <circle className="fig__head" cx={hx} cy={hy} r={THICK.head} />
      <circle className="fig__face" cx={nose[0]} cy={nose[1]} r="2.2" />
      <MuscleLayer muscles={anim.muscles} l={l} facing={anim.facing} e={c.e} />
    </svg>
  );
}

// Palco do boneco animado: toque pausa/continua; com "reduzir movimento" no
// sistema abre parado. Velocidade normal ou câmera lenta.
export default function ExerciseSvgStage({ nome, svg }) {
  const anim = ANIMATIONS[svg];
  const timeline = useMemo(() => buildTimeline(anim.poses), [anim]);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [rate, setRate] = useState(1);
  const [pose, setPose] = useState(() => sample(timeline, 0));
  const clock = useRef(0);

  useEffect(() => {
    setPose(sample(timeline, clock.current));
    if (!playing) return undefined;
    let raf;
    let last = null;
    const tick = now => {
      if (last !== null) clock.current += (now - last) * rate;
      last = now;
      setPose(sample(timeline, clock.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, timeline]);

  return (
    <>
      <button
        type="button" className="demo-modal__stage demo-modal__stage--svg"
        aria-label={playing ? t('Pausar demonstração') : t('Continuar demonstração')}
        onClick={() => setPlaying(p => !p)}
      >
        <FigureSvg anim={anim} c={pose} title={t('Demonstração de {nome}', { nome })} />
        <span className="demo-modal__badge">{playing ? '⏸' : '▶'}</span>
      </button>
      <div className="demo-modal__steps demo-modal__speed" role="group" aria-label={t('Velocidade do vídeo')}>
        {SPEEDS.map(s => (
          <button
            key={s.rate} type="button" aria-pressed={rate === s.rate}
            className={rate === s.rate ? 'is-on' : undefined} onClick={() => setRate(s.rate)}
          >{s.label}</button>
        ))}
      </div>
      <p className="demo-modal__muscles">
        <span aria-hidden="true">🔴</span> {t('Músculos em destaque')}: {anim.muscles.map(m => MUSCLE_LABEL[m]).join(', ')}
      </p>
    </>
  );
}
