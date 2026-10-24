// Calculadora de anilhas: dada a carga total, quais anilhas vão em cada lado.
// A carga digitada na série é a total (barra + anilhas), como nas academias.
// Barra e anilhas disponíveis ficam só no aparelho: a barra por exercício
// (uma Barra W pesa diferente de uma olímpica) e as anilhas para todos.

export const ALL_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
export const BAR_OPTIONS = [20, 15, 10, 0];

const PLATES_KEY = 'plate_set';
const barKey = nome => `plate_bar_${nome}`;

// Exercícios carregados com anilha. "Barra fixa" e "Barra paralela" são
// aparelhos de peso corporal, não barra com anilha.
const BARBELL_RE = /\bbarra\b(?!\s+(fixa|paralela))|agachamento livre|levantamento terra|\bterra\b|smith|good morning|landmine/i;
const SLED_RE = /leg press|hack|barra t\b/i;
const EZ_RE = /barra w\b|barra ez\b/i;

// 'barra' | 'sled' (leg press, hack: só as anilhas contam) | null
export function plateKind(nome) {
  const n = String(nome || '');
  if (SLED_RE.test(n)) return 'sled';
  if (BARBELL_RE.test(n)) return 'barra';
  return null;
}

export function defaultBar(nome) {
  const kind = plateKind(nome);
  if (kind === 'sled') return 0;
  return EZ_RE.test(String(nome || '')) ? 10 : 20;
}

// Em quartos de quilo: toda anilha comum (1,25 inclusive) é múltipla de 0,25.
const UNIT = 0.25;
const MAX_SIDE_UNITS = 2000; // 500 kg por lado: acima disso não é carga real

// Divide (total − barra) / 2 entre as anilhas disponíveis, em quantos pares
// precisar, com o menor número de anilhas. Se não fecha exato (faltou anilha
// pequena), fica com o mais perto abaixo. Devolve:
//   { perSide: [20, 10, 2.5], loaded, remainder, belowBar }
// loaded = carga que de fato fecha; remainder = o que sobrou sem anilha.
export function platesPerSide(total, bar, plates = ALL_PLATES) {
  const kg = parseFloat(String(total ?? '').replace(',', '.'));
  if (!Number.isFinite(kg) || kg <= 0) return null;
  if (kg < bar) return { perSide: [], loaded: bar, remainder: 0, belowBar: true };
  const target = Math.min(MAX_SIDE_UNITS, Math.floor(((kg - bar) / 2) / UNIT + 1e-9));
  const units = plates.map(p => Math.round(p / UNIT)).filter(u => u > 0);
  // count[s] = menor nº de anilhas que soma s; from[s] = a última usada.
  const count = new Array(target + 1).fill(Infinity);
  const from = new Array(target + 1).fill(0);
  count[0] = 0;
  for (let s = 1; s <= target; s++) {
    units.forEach(u => {
      if (u <= s && count[s - u] + 1 < count[s]) { count[s] = count[s - u] + 1; from[s] = u; }
    });
  }
  let s = target;
  while (s > 0 && count[s] === Infinity) s--;
  const perSide = [];
  for (let k = s; k > 0; k -= from[k]) perSide.push(from[k] * UNIT);
  perSide.sort((a, b) => b - a);
  const loaded = bar + s * UNIT * 2;
  return { perSide, loaded, remainder: Math.round((kg - loaded) * 100) / 100, belowBar: false };
}

export function readPlates() {
  try {
    const saved = JSON.parse(localStorage.getItem(PLATES_KEY) || 'null');
    const list = Array.isArray(saved) ? ALL_PLATES.filter(p => saved.includes(p)) : [];
    return list.length ? list : ALL_PLATES;
  } catch {
    return ALL_PLATES;
  }
}

export function savePlates(list) {
  try { localStorage.setItem(PLATES_KEY, JSON.stringify(list)); } catch { /* sem storage */ }
}

export function readBar(nome) {
  try {
    const saved = Number(localStorage.getItem(barKey(nome)));
    if (localStorage.getItem(barKey(nome)) !== null && BAR_OPTIONS.includes(saved)) return saved;
  } catch { /* sem storage */ }
  return defaultBar(nome);
}

export function saveBar(nome, bar) {
  try { localStorage.setItem(barKey(nome), String(bar)); } catch { /* sem storage */ }
}
