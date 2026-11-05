// Visual do mapa do percurso, usado na tela (RouteDrawing.jsx) e no card de
// compartilhar (runShareCard.js).

// Blocos do mapa. O OpenStreetMap pede atribuição visível e uso moderado; se o
// app crescer, trocar por um provedor pago (MapTiler, Stadia) é só esta URL —
// e o img-src da CSP em index.html (e a rota de cache em sw.js).
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const tileSrc = ({ z, x, y }) => TILE_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);

// Ritmo do mais lento ao mais rápido da própria corrida (route.js paceRuns);
// o do meio (no ritmo da corrida) é o laranja da marca.
export const PACE_COLORS = ['#38bdf8', '#22c55e', '#f97316', '#ef4444', '#d946ef'];

// Com muitos km, só algumas marcas, para o mapa não virar uma sopa de números.
export const kmStep = n => (n > 24 ? 5 : n > 12 ? 2 : 1);
