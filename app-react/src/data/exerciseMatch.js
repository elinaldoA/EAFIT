// Acha o exercício do catálogo de demonstrações para um nome digitado fora do
// app — ficha importada (PDF, foto, planilha), CSV do Strong/Hevy em inglês,
// plano do personal. O catálogo usa o nome exato ("Supino Reto com Barra");
// a ficha traz "supino reto c/ barra", "Supino reto" ou "Bench Press
// (Barbell)". O nome do exercício NÃO muda (é a chave de carga e recordes):
// isso só decide qual demonstração mostrar.
//
// Regra conservadora, igual à dos vídeos: na dúvida, não mostra — mostrar o
// movimento errado é pior que não mostrar nenhum. Cada palavra é do MOVIMENTO
// (rosca, martelo, inclinado, romeno…) ou só de EQUIPAMENTO/POSIÇÃO (barra,
// halter, máquina, sentado…). As do movimento têm que bater todas; as de
// equipamento podem diferir em até 2, e o que faltar no nome digitado é
// completado pelo padrão de academia (QUALIFIERS: peso do corpo > barra >
// halter > máquina > polia). Empate = não mostra.

import { names as EN_NAMES } from '../i18n/en/exercises';

// Palavras que viram a mesma coisa (pt, en e abreviações de ficha).
const SYNONYMS = {
  with: 'com',
  halteres: 'halter', haltere: 'halter', dumbbell: 'halter', dumbbells: 'halter', db: 'halter', hlt: 'halter',
  barbell: 'barra', bb: 'barra',
  machine: 'maquina', aparelho: 'maquina',
  cabo: 'polia', cable: 'polia', crossover: 'cross',
  kb: 'kettlebell',
  unilat: 'unilateral', single: 'unilateral',
  alternada: 'alternado', alt: 'alternado', alternating: 'alternado',
  sentada: 'sentado', seated: 'sentado',
  standing: 'pe',
  deitada: 'deitado', lying: 'deitado',
  inclinada: 'inclinado', incline: 'inclinado', inc: 'inclinado',
  declinada: 'declinado', decline: 'declinado', dec: 'declinado',
  reta: 'reto', flat: 'reto',
  front: 'frontal', frente: 'frontal',
  estatico: 'estatica', static: 'estatica',
  wide: 'aberta', aberto: 'aberta',
  close: 'fechada', fechado: 'fechada',
  tri: 'triceps', tricep: 'triceps', bi: 'biceps', bicep: 'biceps',
  romanian: 'romeno', rdl: 'romeno',
  pushdown: 'pulley',
  deadlift: 'terra',
  supinado: 'supinada', pronado: 'pronada', neutro: 'neutra',
  agacho: 'agachamento', agach: 'agachamento', squat: 'agachamento',
  abd: 'abdominal',
  elev: 'elevacao',
  desenv: 'desenvolvimento',
  floor: 'solo', chao: 'solo',
  bodyweight: 'pc',
};

// Não mudam nada.
const STOPWORDS = new Set(['com', 'de', 'da', 'do', 'das', 'dos', 'na', 'no', 'nas', 'nos', 'em', 'a', 'o', 'e',
  'the', 'on', 'of', 'and', 'pegada', 'grip', 'livre', 'exercicio', 'levantamento', 'foco']);

// Equipamento/posição: pode faltar ou sobrar sem trocar o movimento. O número
// é a preferência quando o nome digitado não diz (maior = padrão de academia).
const QUALIFIERS = {
  pc: 7, barra: 6, halter: 5, maquina: 3, polia: 2,
  kettlebell: -3, back: 1, aberta: 1, reto: 1, estatica: 1,
  smith: 0, solo: 0, alternado: 0, frontal: 0, sentado: 0, pe: 0, deitado: 0, 45: 0,
};
// Equipamento dito dos dois lados e diferente (halter x máquina) = outro exercício.
const EQUIPMENT = new Set(['pc', 'barra', 'halter', 'maquina', 'polia', 'smith', 'kettlebell']);

// Nomes de academia que não saem palavra por palavra do catálogo.
const PHRASES = [
  [/\b(agachamento|agacho|agach)\s+bulgaro\b/g, 'afundo bulgaro'],
  [/^bulgaro\b/, 'afundo bulgaro'],
  [/\bpeck\s*deck\b/g, 'crucifixo maquina'],
  [/\bserrote\b/g, 'remada unilateral halter'],
  [/\bskull\s*crushers?\b/g, 'triceps testa'],
  [/\b(chest|pec)\s+fly\b/g, 'crucifixo'],
];
const MAX_DIFF = 2;

export function exerciseTokens(nome) {
  const s = String(nome || '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[°º]/g, '')
    .replace(/\b([cw])\s*\/\s*/g, 'com ')
    .replace(/\bpeso\s+(do\s+)?corp(o|oral)\b|\bbody\s*weight\b|\bsem\s+peso\b/g, ' pc ')
    .replace(/\bem\s+pe\b/g, ' pe ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const s2 = PHRASES.reduce((acc, [re, to]) => acc.replace(re, to), s);
  const out = new Set();
  for (const raw of s2.split(' ')) {
    if (!raw) continue;
    if (/^\d+(kg|lbs?|seg|min)$|^\d+x\d+/.test(raw)) continue; // carga, tempo ou "4x10" que sobrou no nome
    const tok = SYNONYMS[raw] || raw;
    if (!STOPWORDS.has(tok)) out.add(tok);
  }
  return out;
}

function split(tokens) {
  const core = []; const quals = new Set();
  tokens.forEach(tk => (tk in QUALIFIERS ? quals.add(tk) : core.push(tk)));
  return { coreKey: core.sort().join(' '), quals };
}

// Índice: palavras do movimento -> [{ quals, nome }], pelo nome em português e
// pelo inglês da tradução. Refeito só quando a lista de nomes muda.
let cache = { source: null, byCore: new Map() };

function index(catalogNames) {
  if (cache.source === catalogNames) return cache.byCore;
  const byCore = new Map();
  const add = (label, nome, penalty = 0) => {
    const { coreKey, quals } = split(exerciseTokens(label));
    if (!coreKey) return;
    if (!byCore.has(coreKey)) byCore.set(coreKey, []);
    byCore.get(coreKey).push({ quals, nome, penalty });
  };
  for (const nome of catalogNames) {
    add(nome, nome);
    if (EN_NAMES[nome]) add(EN_NAMES[nome], nome);
    // "Barra Fixa Supinada (Chin-Up)" também é achada sem o parêntese, um
    // pouco atrás do nome exato ("Levantamento Terra" ganha de "(déficit)").
    const bare = nome.replace(/\s*\([^)]*\)/g, '').trim();
    if (bare && bare !== nome) add(bare, nome, 5);
  }
  cache = { source: catalogNames, byCore };
  return byCore;
}

// -> nome do catálogo ou null.
export function matchCatalogExercise(nome, catalogNames) {
  const { coreKey, quals: input } = split(exerciseTokens(nome));
  if (!coreKey) return null;
  const candidates = index(catalogNames).get(coreKey);
  if (!candidates) return null;
  let best = null; let bestScore = -Infinity; let tie = false;
  const inputEquip = [...input].filter(q => EQUIPMENT.has(q));
  for (const { quals, nome: nomeCat, penalty } of candidates) {
    if (inputEquip.length && [...quals].some(q => EQUIPMENT.has(q)) && !inputEquip.some(q => quals.has(q))) continue;
    let diff = 0; let score = 100 - penalty;
    // Nome sem equipamento: a versão no solo/peso do corpo é a mais provável
    // ("Abdominal supra" = no solo, não com halter).
    if (!inputEquip.length && quals.has('solo') && ![...quals].some(q => EQUIPMENT.has(q))) score += 6;
    quals.forEach(q => {
      if (input.has(q)) score += 2;
      else { diff++; score += QUALIFIERS[q] - 10; }
    });
    input.forEach(q => { if (!quals.has(q)) { diff++; score -= 10; } });
    if (diff > MAX_DIFF) continue;
    if (score > bestScore) { best = nomeCat; bestScore = score; tie = false; }
    else if (score === bestScore && nomeCat !== best) tie = true;
  }
  return best && !tie ? best : null;
}
