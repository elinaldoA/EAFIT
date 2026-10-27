// Consulta de produto por código de barras no Open Food Facts (base aberta).
// Só o número do código sai do aparelho, e só quando a pessoa pede a leitura.
const URL_BASE = 'https://world.openfoodfacts.org/api/v2/product/';

const num = v => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// Código de barras de produto: EAN-8, UPC-A (12), EAN-13 ou GTIN-14.
export const isBarcode = code => /^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code);

// Devolve { name, icon, kcal, g, carbs, fat, portion } por 100 g, ou null se o
// produto não existe ou não traz informação nutricional.
export async function lookupBarcode(code, fetchFn = fetch) {
  if (!isBarcode(code)) return null;
  const res = await fetchFn(`${URL_BASE}${code}.json?fields=product_name,nutriments,serving_quantity`);
  if (!res.ok) throw new Error(`openfoodfacts ${res.status}`);
  const body = await res.json();
  const p = body?.status === 0 ? null : body?.product;
  const n = p?.nutriments;
  if (!p || !n) return null;
  const kcal = Math.round(num(n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : 0)) * 10) / 10;
  const g = num(n.proteins_100g);
  const carbs = num(n.carbohydrates_100g);
  const fat = num(n.fat_100g);
  if (!kcal && !g && !carbs && !fat) return null;
  return {
    id: `off${code}`, icon: '🏷️', name: (p.product_name || '').trim() || code,
    kcal, g, carbs, fat, portion: Math.round(num(p.serving_quantity)) || 100,
  };
}
