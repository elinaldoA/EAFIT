// Boneco 2D de lado para as animações em SVG dos exercícios de solo.
//
// Um exercício é uma lista de "poses" (quadros-chave) que repete em loop. Cada
// pose descreve o boneco por ângulos (0° = direita, 90° = pra cima; y medido
// a partir do tapete) e, quando um apoio precisa ficar parado no chão (pé, mão),
// por um ponto-alvo resolvido com cinemática inversa de 2 ossos. Toda pose é
// reduzida a ângulos ("forma canônica") e a animação interpola os ângulos —
// por isso os membros nunca encolhem no meio do movimento.
//
// Campos de uma pose (todos opcionais, exceto o ponto de ancoragem):
//   hip: [x, y]        quadril (ou)
//   shoulder: [x, y]   ombro — o quadril é calculado a partir dele
//   torso, chest, head ângulo da cintura (quadril→cintura), do tronco superior
//                      (cintura→ombro) e da cabeça (ombro→cabeça)
//   leg: [coxa, canela], leg2: perna de trás (padrão = leg)
//   arm: [braço, antebraço], arm2: braço de trás (padrão = arm)
//   foot, foot2, hand, hand2: [x, y] | 'head' | 'foot' | 'foot2' | 'knee' —
//                      apoio fixo (IK); com bend ('up'|'down'|'left'|'right')
//                      escolhendo pra onde o joelho/cotovelo dobra
//   e: 0..1            esforço (intensidade do destaque muscular)
//   ms / hold          duração da transição até esta pose / pausa nela

export const LEN = { lower: 28, upper: 30, thigh: 46, shin: 44, uarm: 27, farm: 25, neck: 17 };
export const THICK = { torso: 17, thigh: 12, shin: 9, uarm: 8, farm: 7, head: 10 };
// Ponto onde o boneco "de trás" aparece deslocado, pra não esconder atrás do da frente.
export const FAR_OFFSET = [-5, 2];

const rad = d => (d * Math.PI) / 180;
const vec = (a, len) => [Math.cos(rad(a)) * len, Math.sin(rad(a)) * len];
const add = (p, v) => [p[0] + v[0], p[1] + v[1]];
const deg = (from, to) => (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;

// Cinemática inversa de 2 ossos: devolve o ângulo absoluto de cada osso pra
// ponta chegar em target (ou o mais perto possível, com o membro esticado).
export function solveIK(root, target, l1, l2, bend = 'up') {
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const dist = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
  const base = Math.atan2(dy, dx);
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const a = Math.acos(Math.min(1, Math.max(-1, cosA)));
  const cands = [base + a, base - a].map(ang => {
    const j = [root[0] + Math.cos(ang) * l1, root[1] + Math.sin(ang) * l1];
    return { ang, j };
  });
  const score = { up: c => c.j[1], down: c => -c.j[1], right: c => c.j[0], left: c => -c.j[0] }[bend] || (c => c.j[1]);
  const best = score(cands[0]) >= score(cands[1]) ? cands[0] : cands[1];
  const joint = best.j;
  const end = [root[0] + Math.cos(base) * dist, root[1] + Math.sin(base) * dist];
  return [(best.ang * 180) / Math.PI, deg(joint, end)];
}

const LIMBS = { leg: ['thigh', 'shin'], arm: ['uarm', 'farm'] };

// Pose escrita à mão → forma canônica (ângulos + quadril), resolvendo os apoios.
export function canonicalize(pose) {
  const torso = pose.torso ?? 0;
  const chest = pose.chest ?? torso;
  const head = pose.head ?? chest;
  const lowerV = vec(torso, LEN.lower);
  const upperV = vec(chest, LEN.upper);
  let hip;
  if (pose.shoulder) hip = [pose.shoulder[0] - lowerV[0] - upperV[0], pose.shoulder[1] - lowerV[1] - upperV[1]];
  else hip = pose.hip || [0, 0];
  const waist = add(hip, lowerV);
  const shoulder = add(waist, upperV);
  const headPos = add(shoulder, vec(head, LEN.neck));

  const c = { hip, torso, chest, head, e: pose.e ?? 0 };
  const pts = { head: headPos };

  // Pernas primeiro (os braços podem mirar o pé), depois os braços.
  const sides = [['leg', ''], ['leg', '2'], ['arm', ''], ['arm', '2']];
  const resolved = {};
  const pins = {};
  for (const [kind, sfx] of sides) {
    const root = kind === 'leg' ? hip : shoulder;
    const [n1, n2] = LIMBS[kind];
    const key = kind + sfx;
    const pinKey = (kind === 'leg' ? 'foot' : 'hand') + sfx;
    const angles = pose[key] || pose[kind] || (kind === 'leg' ? [180, 180] : [-90, -90]);
    let a1 = angles[0];
    let a2 = angles[1];
    let pin = pose[pinKey];
    if (typeof pin === 'string') pin = pts[pin];
    if (pin) {
      const bend = pose[pinKey + 'Bend'] ?? pose.bend?.[pinKey] ?? (kind === 'leg' ? 'up' : 'left');
      [a1, a2] = solveIK(root, pin, LEN[n1], LEN[n2], bend);
      pins[key] = { to: pin, bend };
    }
    const joint = add(root, vec(a1, LEN[n1]));
    const end = add(joint, vec(a2, LEN[n2]));
    resolved[key] = [a1, a2];
    pts[kind === 'leg' ? 'foot' + sfx : 'hand' + sfx] = end;
    pts['knee' + sfx] = kind === 'leg' ? joint : pts['knee' + sfx];
  }
  c.pins = pins;
  c.leg = resolved.leg;
  c.leg2 = resolved.leg2;
  c.arm = resolved.arm;
  c.arm2 = resolved.arm2;
  return c;
}

// Forma canônica → posições de cada articulação.
export function layout(c) {
  const hip = c.hip;
  const waist = add(hip, vec(c.torso, LEN.lower));
  const shoulder = add(waist, vec(c.chest, LEN.upper));
  const headPos = add(shoulder, vec(c.head, LEN.neck));
  const limb = (root, [a1, a2], l1, l2) => {
    const mid = add(root, vec(a1, l1));
    return [root, mid, add(mid, vec(a2, l2))];
  };
  return {
    hip, waist, shoulder, head: headPos,
    leg: limb(hip, c.leg, LEN.thigh, LEN.shin),
    leg2: limb(hip, c.leg2, LEN.thigh, LEN.shin),
    arm: limb(shoulder, c.arm, LEN.uarm, LEN.farm),
    arm2: limb(shoulder, c.arm2, LEN.uarm, LEN.farm),
  };
}

const lerp = (a, b, k) => a + (b - a) * k;
// Ângulos sempre pelo caminho mais curto.
const lerpAngle = (a, b, k) => a + ((((b - a) % 360) + 540) % 360 - 180) * k;
const lerpPair = (p, q, k) => [lerpAngle(p[0], q[0], k), lerpAngle(p[1], q[1], k)];

export function blend(a, b, k) {
  const c = blendAngles(a, b, k);
  // Apoio fixo nas duas pontas da transição: interpola o ponto-alvo e refaz a
  // cinemática inversa (o pé desliza pelo chão em vez de varrer um arco).
  const pa = a.pins || {};
  const pb = b.pins || {};
  const waist = add(c.hip, vec(c.torso, LEN.lower));
  const shoulder = add(waist, vec(c.chest, LEN.upper));
  for (const key of Object.keys(pb)) {
    if (!pa[key]) continue;
    const kind = key.startsWith('leg') ? 'leg' : 'arm';
    const [n1, n2] = LIMBS[kind];
    const to = [lerp(pa[key].to[0], pb[key].to[0], k), lerp(pa[key].to[1], pb[key].to[1], k)];
    c[key] = solveIK(kind === 'leg' ? c.hip : shoulder, to, LEN[n1], LEN[n2], pb[key].bend);
  }
  c.pins = pb;
  return c;
}

function blendAngles(a, b, k) {
  return {
    hip: [lerp(a.hip[0], b.hip[0], k), lerp(a.hip[1], b.hip[1], k)],
    torso: lerpAngle(a.torso, b.torso, k),
    chest: lerpAngle(a.chest, b.chest, k),
    head: lerpAngle(a.head, b.head, k),
    leg: lerpPair(a.leg, b.leg, k),
    leg2: lerpPair(a.leg2, b.leg2, k),
    arm: lerpPair(a.arm, b.arm, k),
    arm2: lerpPair(a.arm2, b.arm2, k),
    e: lerp(a.e, b.e, k),
  };
}

const ease = k => (1 - Math.cos(Math.PI * k)) / 2;
const DEFAULT_MS = 900;

// Quadros-chave prontos pra tocar: [{ c, ms, hold }].
export function buildTimeline(poses) {
  return poses.map(p => ({ c: canonicalize(p), ms: p.ms ?? DEFAULT_MS, hold: p.hold ?? 0 }));
}

export function cycleLength(timeline) {
  return timeline.reduce((s, f) => s + f.ms + f.hold, 0);
}

// Pose no instante t (ms) do ciclo. Cada quadro-chave i é alcançado em f.ms a
// partir do anterior (o primeiro vem do último, fechando o loop) e depois fica
// parado por f.hold.
export function sample(timeline, t) {
  const total = cycleLength(timeline);
  let rest = ((t % total) + total) % total;
  for (let i = 0; i < timeline.length; i++) {
    const f = timeline[i];
    const prev = timeline[(i - 1 + timeline.length) % timeline.length].c;
    if (rest < f.ms) return blend(prev, f.c, ease(rest / f.ms));
    rest -= f.ms;
    if (rest < f.hold) return f.c;
    rest -= f.hold;
  }
  return timeline[timeline.length - 1].c;
}

// Corpo reto do pé até o ombro (pranchas e flexões): pé no chão em (x0, 4),
// inclinação phi. Devolve os campos de pose do tronco e das pernas.
export function bodyLine(x0, phi) {
  const total = LEN.thigh + LEN.shin;
  const hip = [x0 + Math.cos(rad(phi)) * total, 4 + Math.sin(rad(phi)) * total];
  return { hip, torso: phi, chest: phi, head: phi, leg: [180 + phi, 180 + phi] };
}
