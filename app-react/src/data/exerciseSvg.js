// Animações em SVG (boneco de lado) dos exercícios de solo — ver lib/exerciseFigure.js
// pro significado dos campos de cada pose. Servem pra quem não tem vídeo real
// (data/exerciseVideos.js tem prioridade); funcionam offline e pesam poucos bytes.
// Cada animação cobre vários nomes do catálogo: a vista lateral não distingue,
// por exemplo, flexão aberta de fechada — o texto da técnica explica a diferença.
import { bodyLine } from '../lib/exerciseFigure';

const H = 9; // altura do centro do tronco deitado sobre o tapete

// Deitado de costas, cabeça à direita, mãos atrás da cabeça, pés no chão.
const supineBent = { hip: [140, H], foot: [100, 5], foot2: [104, 5], hand: 'head', hand2: 'head' };
// Quatro apoios: ombro sobre as mãos, coxa na vertical, canela deitada.
const quad = { shoulder: [168, 52], hand: [168, 4], hand2: [168, 4], leg: [-90, 180], head: -12 };
// Prancha com antebraços e prancha alta (mãos).
const forearmPlank = phi => ({ ...bodyLine(40, phi), hand: [212, 4], hand2: [212, 4], bend: { hand: 'down', hand2: 'down' } });
const handPlank = phi => ({ ...bodyLine(40, phi), hand: [182, 4], hand2: [182, 4], bend: { hand: 'left', hand2: 'left' } });
// Flexão com joelhos no chão: o corpo gira em torno do joelho.
const kneeLine = phi => {
  const r = Math.PI / 180;
  return {
    hip: [80 + 46 * Math.cos(phi * r), 4 + 46 * Math.sin(phi * r)],
    torso: phi, chest: phi, head: phi, leg: [180 + phi, 160],
    hand: [176, 4], hand2: [176, 4], bend: { hand: 'left', hand2: 'left' },
  };
};

export const ANIMATIONS = {
  crunch: {
    facing: -1, muscles: ['abs'],
    poses: [
      { ...supineBent, e: 0.1 },
      { ...supineBent, chest: 30, head: 38, e: 1, hold: 250 },
    ],
  },
  vup: {
    facing: -1, muscles: ['abs', 'hipflex'],
    poses: [
      { hip: [140, H], leg: [178, 178], arm: [0, 0], arm2: [0, 0], e: 0.1, ms: 1100 },
      { hip: [140, H], torso: 70, chest: 78, head: 76, leg: [105, 105], hand: 'foot', hand2: 'foot2', e: 1, hold: 200, ms: 1100 },
    ],
  },
  bicycle: {
    facing: -1, muscles: ['abs'],
    poses: [
      { hip: [140, H], hand: 'head', hand2: 'head', chest: 28, head: 34, leg: [75, 200], leg2: [166, 166], e: 1, ms: 650 },
      { hip: [140, H], hand: 'head', hand2: 'head', chest: 14, head: 18, leg: [120, 175], leg2: [120, 175], e: 0.5, ms: 650 },
      { hip: [140, H], hand: 'head', hand2: 'head', chest: 28, head: 34, leg: [166, 166], leg2: [75, 200], e: 1, ms: 650 },
      { hip: [140, H], hand: 'head', hand2: 'head', chest: 14, head: 18, leg: [120, 175], leg2: [120, 175], e: 0.5, ms: 650 },
    ],
  },
  legRaise: {
    facing: -1, muscles: ['abs', 'hipflex'],
    poses: [
      { hip: [140, H], leg: [172, 172], arm: [180, 180], arm2: [180, 180], e: 0.2, ms: 1200 },
      { hip: [140, H], leg: [92, 92], arm: [180, 180], arm2: [180, 180], e: 1, hold: 150, ms: 1200 },
    ],
  },
  flutter: {
    facing: -1, muscles: ['abs', 'hipflex', 'quads'],
    poses: [
      { hip: [140, H], chest: 10, head: 16, leg: [160, 160], leg2: [175, 175], arm: [180, 180], arm2: [180, 180], e: 0.9, ms: 380 },
      { hip: [140, H], chest: 10, head: 16, leg: [175, 175], leg2: [160, 160], arm: [180, 180], arm2: [180, 180], e: 0.9, ms: 380 },
    ],
  },
  hollow: {
    facing: -1, muscles: ['abs', 'hipflex'],
    poses: [
      { hip: [140, H], leg: [178, 178], arm: [0, 0], arm2: [0, 0], e: 0.1, ms: 1000 },
      { hip: [140, H], chest: 16, head: 20, leg: [164, 164], arm: [16, 16], arm2: [16, 16], e: 1, hold: 900, ms: 1000 },
    ],
  },
  bridge: {
    facing: -1, muscles: ['glutes', 'hams'],
    poses: [
      { shoulder: [198, H], foot: [100, 5], foot2: [104, 5], hand: [150, 4], hand2: [150, 4], e: 0.1, ms: 1100 },
      { shoulder: [198, H], torso: -24, chest: -24, head: 0, foot: [100, 5], foot2: [104, 5], hand: [150, 4], hand2: [150, 4], e: 1, hold: 450, ms: 1100 },
    ],
  },
  bridgeSingle: {
    facing: -1, muscles: ['glutes', 'hams'],
    poses: [
      { shoulder: [198, H], foot: [100, 5], foot2: [104, 5], hand: [150, 4], hand2: [150, 4], e: 0.1, ms: 900 },
      { shoulder: [198, H], torso: -24, chest: -24, head: 0, foot: [100, 5], foot2: [104, 5], hand: [150, 4], hand2: [150, 4], e: 0.8, ms: 900 },
      { shoulder: [198, H], torso: -24, chest: -24, head: 0, foot: [100, 5], leg2: [156, 156], hand: [150, 4], hand2: [150, 4], e: 1, hold: 500, ms: 600 },
      { shoulder: [198, H], torso: -24, chest: -24, head: 0, foot: [100, 5], foot2: [104, 5], hand: [150, 4], hand2: [150, 4], e: 0.8, ms: 600 },
    ],
  },
  deadBug: {
    facing: -1, muscles: ['abs'],
    poses: [
      { hip: [140, H], leg: [90, 180], leg2: [90, 180], arm: [90, 90], arm2: [90, 90], e: 0.5, ms: 800 },
      { hip: [140, H], leg: [90, 180], leg2: [172, 172], arm: [0, 0], arm2: [90, 90], e: 1, hold: 200, ms: 900 },
      { hip: [140, H], leg: [90, 180], leg2: [90, 180], arm: [90, 90], arm2: [90, 90], e: 0.5, ms: 800 },
      { hip: [140, H], leg: [172, 172], leg2: [90, 180], arm: [90, 90], arm2: [0, 0], e: 1, hold: 200, ms: 900 },
    ],
  },
  plank: {
    facing: 1, muscles: ['abs', 'shoulders', 'glutes'],
    poses: [
      { ...forearmPlank(10), e: 0.7, ms: 1500 },
      { ...forearmPlank(10.6), e: 1, ms: 1500 },
    ],
  },
  sidePlank: {
    facing: 1, muscles: ['abs', 'shoulders'],
    poses: [
      { ...forearmPlank(12), arm2: [90, 90], hand2: undefined, e: 0.7, ms: 1500 },
      { ...forearmPlank(12.6), arm2: [90, 90], hand2: undefined, e: 1, ms: 1500 },
    ],
  },
  sideLegRaise: {
    facing: 1, muscles: ['glutes'],
    poses: [
      { hip: [140, H], leg: [180, 180], arm: [0, 0], hand2: [175, 4], bend: { hand2: 'up' }, e: 0.2, ms: 1000 },
      { hip: [140, H], leg: [180, 180], leg2: [150, 150], arm: [0, 0], hand2: [175, 4], bend: { hand2: 'up' }, e: 1, hold: 250, ms: 1000 },
    ],
  },
  reversePlank: {
    facing: -1, muscles: ['glutes', 'hams', 'lowback'],
    poses: [
      { ...bodyLine(40, 20), head: 32, hand: [182, 4], hand2: [182, 4], bend: { hand: 'right', hand2: 'right' }, e: 0.8, ms: 1500 },
      { ...bodyLine(40, 16), head: 28, hand: [182, 4], hand2: [182, 4], bend: { hand: 'right', hand2: 'right' }, e: 1, ms: 1500 },
    ],
  },
  pushup: {
    facing: 1, muscles: ['chest', 'triceps', 'shoulders'],
    poses: [
      { ...handPlank(20), e: 0.2, hold: 150, ms: 1000 },
      { ...handPlank(6.3), e: 1, hold: 150, ms: 1000 },
    ],
  },
  pushupKnees: {
    facing: 1, muscles: ['chest', 'triceps', 'shoulders'],
    poses: [
      { ...kneeLine(26), e: 0.2, hold: 150, ms: 1000 },
      { ...kneeLine(8), e: 1, hold: 150, ms: 1000 },
    ],
  },
  mountain: {
    facing: 1, muscles: ['abs', 'shoulders', 'quads'],
    // Os pés deslizam pelo chão: cada quadro-chave fixa os dois pés.
    poses: [
      { ...handPlank(20), foot: [152, 4], foot2: [40, 4], bend: { hand: 'left', hand2: 'left', foot: 'up', foot2: 'up' }, e: 1, ms: 260 },
      { ...handPlank(20), foot: [100, 4], foot2: [70, 4], bend: { hand: 'left', hand2: 'left', foot: 'up', foot2: 'up' }, e: 0.7, ms: 260 },
      { ...handPlank(20), foot: [40, 4], foot2: [152, 4], bend: { hand: 'left', hand2: 'left', foot: 'up', foot2: 'up' }, e: 1, ms: 260 },
      { ...handPlank(20), foot: [70, 4], foot2: [100, 4], bend: { hand: 'left', hand2: 'left', foot: 'up', foot2: 'up' }, e: 0.7, ms: 260 },
    ],
  },
  superman: {
    facing: 1, muscles: ['lowback', 'glutes'],
    poses: [
      { hip: [140, H], leg: [180, 180], arm: [0, 0], arm2: [0, 0], e: 0.1, ms: 1100 },
      { hip: [140, H], torso: 3, chest: 18, head: 22, leg: [166, 166], arm: [20, 20], arm2: [20, 20], e: 1, hold: 600, ms: 1100 },
    ],
  },
  birdDogElbowKnee: {
    facing: 1, muscles: ['abs', 'glutes', 'shoulders'],
    poses: [
      { ...quad, hand: undefined, arm: [0, 0], leg2: [180, 180], e: 0.8, hold: 250, ms: 700 },
      { ...quad, hand: undefined, arm: [-30, -30], leg2: [-90, 170], e: 0.5, ms: 450 },
      { ...quad, hand: 'knee2', leg2: [-40, 200], bend: { hand: 'up' }, e: 1, hold: 250, ms: 700 },
      { ...quad, hand: undefined, arm: [-30, -30], leg2: [-90, 170], e: 0.5, ms: 450 },
    ],
  },
  kickback: {
    facing: 1, muscles: ['glutes', 'hams'],
    poses: [
      { ...quad, e: 0.2, ms: 1000 },
      { ...quad, leg2: [180, 90], e: 1, hold: 300, ms: 1000 },
    ],
  },
};

// Nome do exercício (catálogo) → animação. Nomes que já têm vídeo real em
// data/exerciseVideos.js ficam de fora (o vídeo ganha).
export const EXERCISE_SVG = {
  'Abdominal Supra no Solo': 'crunch',
  'Abdominal Curto': 'crunch',
  'Abdominal Canivete (V-Up)': 'vup',
  'Bicicleta no Solo': 'bicycle',
  'Abdominal Infra (Elevação de Pernas)': 'legRaise',
  'Elevação de Pernas Deitado': 'legRaise',
  'Abdominal Flutter': 'flutter',
  'Abdominal Tesoura': 'flutter',
  'Tesoura (Scissor Kicks)': 'flutter',
  'Hollow Hold (Canoa)': 'hollow',
  'Ponte de Glúteo no Solo': 'bridge',
  'Ponte de Glúteo Isométrica': 'bridge',
  'Ponte Unilateral (Glúteo)': 'bridgeSingle',
  'Dead Bug (Core Anti-Extensão)': 'deadBug',
  'Prancha Frontal Estática': 'plank',
  'Prancha Lateral Estática': 'sidePlank',
  'Elevação Lateral de Perna Deitado': 'sideLegRaise',
  'Prancha Reversa': 'reversePlank',
  'Flexão de Braço Aberta': 'pushup',
  'Flexão Fechada': 'pushup',
  'Flexão Diamante': 'pushup',
  'Flexão de Braço com Joelhos Apoiados': 'pushupKnees',
  'Flexão Fechada com Joelhos Apoiados': 'pushupKnees',
  'Flexão Diamante com Joelhos Apoiados': 'pushupKnees',
  'Glúteo 4 Apoios com Caneleira': 'kickback',
  'Mountain Climber': 'mountain',
  'Superman': 'superman',
  'Bird Dog com Cotovelo ao Joelho': 'birdDogElbowKnee',
};

// Rótulos dos músculos em destaque (t() fica em componentes/ExerciseSvg.jsx).
export const MUSCLE_KEYS = ['abs', 'lowback', 'glutes', 'quads', 'hams', 'calves', 'chest', 'shoulders', 'triceps', 'biceps', 'hipflex'];
