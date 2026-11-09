import { searchFoods, portionOf } from '../data/foodDatabase';

// Lê a dieta de um nutricionista (texto colado ou arquivo .txt/.csv) e devolve
// uma lista de refeições com itens no formato do diário: { label, icon, g,
// kcal, carbs, fat, fiber?, sodium?, amount }. Item com macros escritos usa
// esses números; sem macros, procura o alimento na base (TACO) pela
// quantidade. O que não achar fica com `unknown: true` para o aluno ver.

export const MAX_DIET_CHARS = 20000;
export const MAX_DIET_MEALS = 12;
export const MAX_MEAL_ITEMS = 30;

const plain = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Palavra da refeição no texto → chave do diário (lib/nutritionEntries MEALS).
const MEAL_WORDS = [
  [/^(cafe da manha|cafe|desjejum|breakfast)/, 'cafe'],
  [/^(almoco|lunch)/, 'almoco'],
  [/^(jantar|janta|dinner)/, 'jantar'],
  [/^(ceia|supper)/, 'ceia'],
  [/^(lanche|colacao|merenda|pre[- ]?treino|pos[- ]?treino|snack)/, 'lanche'],
  [/^(refeicao|outros?)/, 'outro'],
];

function mealKeyOf(text) {
  const p = plain(text).replace(/^[^a-z]+/, '').trim();
  for (const [re, key] of MEAL_WORDS) if (re.test(p)) return key;
  return null;
}

const NUM = '(\\d+(?:[.,]\\d+)?)';
const toNum = s => Number(String(s).replace(',', '.'));

// Pega o primeiro valor de um macro ("12g prot", "prot: 12", "P: 12") e tira
// o trecho do texto, para sobrar só o nome do alimento.
function takeMacro(text, words, letter) {
  const patterns = [
    new RegExp(`${NUM}\\s*g?\\s*(?:de\\s+)?(?:${words})\\w*`),
    new RegExp(`(?:${words})\\w*\\s*[:=]\\s*${NUM}\\s*g?`),
    new RegExp(`\\b${letter}\\s*[:=]\\s*${NUM}\\s*g?`),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return { value: toNum(m[1]), rest: text.replace(m[0], ' | ') };
  }
  return { value: null, rest: text };
}

function takeKcal(text) {
  for (const re of [new RegExp(`${NUM}\\s*(?:kcal|cal)\\b`), new RegExp(`(?:kcal|cal)\\s*[:=]\\s*${NUM}`)]) {
    const m = text.match(re);
    if (m) return { value: toNum(m[1]), rest: text.replace(m[0], ' | ') };
  }
  return { value: null, rest: text };
}

const UNIT = '(?:g|gr|gramas?|ml|un|unid\\w*|fatias?|colher(?:es)?(?:\\s+de\\s+(?:sopa|cha|sobremesa))?|xicaras?|copos?|scoops?|porcao|porcoes)';
const LEAD = new RegExp(`^${NUM}\\s*(${UNIT})?\\b\\s*(?:de\\s+)?`);

// "2 ovos" → { count: 2 }, "150g de arroz" → { grams: 150 }.
function quantityOf(name) {
  const m = plain(name).match(LEAD);
  if (!m) return { rest: name.trim() };
  const n = toNum(m[1]);
  const unit = m[2] || '';
  const rest = name.slice(m[0].length).trim();
  if (/^(g|gr|gramas?|ml)$/.test(unit)) return { grams: n, rest };
  return { count: n, rest };
}

const BULLET = /^\s*(?:[-*•·▪►]+|\d+[.)]|#{1,6})\s+/;
const clean = line => line.replace(/\*\*|__/g, '').replace(BULLET, '').trim();

function lookup(name) {
  const q = quantityOf(name);
  const words = plain(q.rest).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  // Tenta o nome inteiro e, se não achar, tira palavras do fim ("ovo mexido com sal" → "ovo mexido").
  for (let n = words.length; n >= 1; n--) {
    if (words.slice(0, n).join('').length < 3) continue;
    const [food] = searchFoods(words.slice(0, n).join(' '), undefined, 1);
    if (!food) continue;
    const grams = q.grams ?? Math.round((q.count ?? 1) * (food.portion || 100));
    return { food, grams, label: q.rest };
  }
  return null;
}

function itemFromLine(raw) {
  let rest = raw;
  const kcal = takeKcal(rest); rest = kcal.rest;
  const prot = takeMacro(rest, 'prot|ptn', 'p'); rest = prot.rest;
  const carb = takeMacro(rest, 'carb|cho', 'c'); rest = carb.rest;
  const fat = takeMacro(rest, 'gord|lip|fat', 'g'); rest = fat.rest;
  const parts = rest.split('|').map(s => s.replace(/^[\s\-–—:;,.()]+|[\s\-–—:;,.()]+$/g, '')).filter(Boolean);
  const nameText = parts[0] || '';
  if (!nameText) return null;
  const q = quantityOf(nameText);
  // "150g arroz" → nome "arroz" e quantidade à parte; "2 ovos" mantém o 2 no nome.
  const label = q.grams != null && q.rest ? q.rest : nameText;
  const hasMacros = [kcal, prot, carb, fat].some(m => m.value != null);

  if (hasMacros) {
    const amountMatch = parts.join(' ').match(/(\d+(?:[.,]\d+)?)\s*(g|gr|gramas?|ml)\b/i);
    const shown = amountMatch ? label.replace(amountMatch[0], '').replace(/\s{2,}/g, ' ').trim() || label : label;
    return {
      label: shown.slice(0, 60),
      icon: '🍽️',
      g: Math.round(prot.value ?? 0),
      kcal: Math.round(kcal.value ?? 0),
      carbs: Math.round(carb.value ?? 0),
      fat: Math.round(fat.value ?? 0),
      amount: amountMatch ? `${amountMatch[1]} ${amountMatch[2].toLowerCase().startsWith('m') ? 'ml' : 'g'}` : '',
    };
  }

  // Sem macros: o nome com a quantidade ("150 g arroz"), ou nome e quantidade em partes separadas.
  const found = lookup(q.grams != null || q.count != null ? nameText : parts.join(' ')) || lookup(nameText);
  if (!found) return { label: label.slice(0, 60), icon: '🍽️', g: 0, kcal: 0, carbs: 0, fat: 0, amount: '', unknown: true };
  const p = portionOf(found.food, found.grams);
  return {
    label: (found.label || found.food.name).slice(0, 60),
    icon: found.food.icon || '🍽️',
    ...p,
    amount: `${found.grams} g`,
    estimated: true,
  };
}

// Cabeçalho de refeição: "Almoço", "Almoço (12h)", "## Café da manhã - 7h30:".
// Linha com número de kcal ou macros é item, não cabeçalho.
function headerOf(line) {
  const key = mealKeyOf(line);
  if (!key) return null;
  if (/\d\s*(kcal|cal|g)\b|kcal/i.test(line)) return null;
  const words = plain(line).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length > 5) return null;
  const name = line.replace(/\s*[-–—:([]?\s*\d{1,2}\s*(?:h|:)\s*\d{0,2}\s*\)?\]?/i, '').replace(/[:\-–—\s]+$/, '').trim();
  return { meal: key, name: (name || line).slice(0, 40) };
}

const CSV_COLS = {
  meal: /^(refeicao|meal|horario)/,
  item: /^(alimento|item|food|descricao|nome)/,
  amount: /^(quantidade|qtd|gramas|porcao|amount|g)$/,
  kcal: /^(kcal|calorias|cal)/,
  g: /^(prot|ptn)/,
  carbs: /^(carb|cho)/,
  fat: /^(gord|lip|fat)/,
};

function csvLines(text) {
  const rows = text.split(/\r?\n/).filter(l => l.trim());
  if (rows.length < 2) return null;
  const sep = rows[0].split(';').length > rows[0].split(',').length ? ';' : ',';
  const head = rows[0].split(sep).map(c => plain(c).trim());
  const idx = Object.fromEntries(Object.entries(CSV_COLS).map(([k, re]) => [k, head.findIndex(c => re.test(c))]));
  if (idx.meal < 0 || idx.item < 0) return null;
  return rows.slice(1).map(r => {
    const c = r.split(sep).map(s => s.trim());
    const get = k => (idx[k] >= 0 ? c[idx[k]] : '');
    const parts = [get('item') && (get('amount') ? `${get('amount')}${/^\d+([.,]\d+)?$/.test(get('amount')) ? ' g' : ''} ${get('item')}` : get('item'))];
    if (get('kcal')) parts.push(`${get('kcal')} kcal`);
    if (get('g')) parts.push(`${get('g')}g prot`);
    if (get('carbs')) parts.push(`${get('carbs')}g carbo`);
    if (get('fat')) parts.push(`${get('fat')}g gord`);
    return { meal: get('meal'), line: parts.filter(Boolean).join(' - ') };
  });
}

export const sumItems = items => items.reduce((s, f) => ({
  g: s.g + (f.g || 0), kcal: s.kcal + (f.kcal || 0), carbs: s.carbs + (f.carbs || 0), fat: s.fat + (f.fat || 0),
}), { g: 0, kcal: 0, carbs: 0, fat: 0 });

// → { meals: [{ meal, name, items }], skipped: nº de linhas ignoradas, truncated }
export function parseDiet(input) {
  const text = String(input || '').slice(0, MAX_DIET_CHARS);
  const meals = [];
  let skipped = 0;
  let truncated = false;
  let current = null;

  const open = (meal, name) => {
    const hit = meals.find(m => m.name === name && m.meal === meal);
    if (hit) { current = hit; return; }
    if (meals.length >= MAX_DIET_MEALS) { truncated = true; current = { meal, name, items: [], overflow: true }; return; }
    current = { meal, name, items: [] };
    meals.push(current);
  };
  const add = line => {
    const item = itemFromLine(line);
    if (!item) { skipped++; return; }
    if (!current) open('outro', 'Dieta');
    if (current.overflow) return;
    if (current.items.length >= MAX_MEAL_ITEMS) { truncated = true; return; }
    current.items.push(item);
  };

  const csv = csvLines(text);
  if (csv) {
    for (const { meal, line } of csv) {
      const key = mealKeyOf(meal) || 'outro';
      const name = meal.trim().slice(0, 40) || 'Dieta';
      if (!current || current.name !== name || current.meal !== key) open(key, name);
      add(line);
    }
  } else {
    for (const rawLine of text.split(/\r?\n/)) {
      const line = clean(rawLine);
      if (!line) continue;
      const head = headerOf(line);
      if (head) { open(head.meal, head.name); continue; }
      add(line);
    }
  }
  return { meals: meals.filter(m => m.items.length), skipped, truncated };
}

// O que vai para o banco: só os campos do item e números limpos.
export function cleanMeals(meals) {
  return (meals || []).slice(0, MAX_DIET_MEALS).map(m => ({
    meal: m.meal,
    name: String(m.name || '').slice(0, 40),
    items: (m.items || []).slice(0, MAX_MEAL_ITEMS).map(i => ({
      label: String(i.label || '').slice(0, 60),
      icon: i.icon || '🍽️',
      g: Math.max(0, Math.round(i.g) || 0),
      kcal: Math.max(0, Math.round(i.kcal) || 0),
      carbs: Math.max(0, Math.round(i.carbs) || 0),
      fat: Math.max(0, Math.round(i.fat) || 0),
      ...(Number.isFinite(i.fiber) && { fiber: i.fiber }),
      ...(Number.isFinite(i.sodium) && { sodium: i.sodium }),
      amount: String(i.amount || '').slice(0, 20),
    })),
  })).filter(m => m.items.length);
}
