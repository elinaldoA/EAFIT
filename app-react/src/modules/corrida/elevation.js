// Subida e descida acumuladas pela altitude do GPS. A altitude do celular é
// bem mais ruidosa que a posição (±10 m é comum): cada leitura passa por uma
// média móvel e só degraus de STEP_M em relação à última referência contam,
// senão uma corrida plana "subiria" dezenas de metros só com o ruído.
//
// Estado (guardado na corrida ao vivo): { smooth, ref, gain, loss } em metros.

// Leitura com precisão vertical pior que isso (m) é descartada.
export const MAX_ALT_ACCURACY_M = 30;
// Peso da leitura nova na média móvel. Calibrado com ruído de ±4 m (desvio
// padrão): 30 min plano somam 0 m e uma ladeira de 30 m soma ~31 m.
export const SMOOTH = 0.1;
// Degrau mínimo (m) para contar subida ou descida.
export const STEP_M = 5;

export const emptyElevation = () => ({ smooth: null, ref: null, gain: 0, loss: 0 });

// altitude e altitudeAccuracy vêm de GeolocationCoordinates (podem ser null).
export function addAltitude(elev, altitude, altitudeAccuracy) {
  if (!Number.isFinite(altitude)) return elev;
  if (Number.isFinite(altitudeAccuracy) && altitudeAccuracy > MAX_ALT_ACCURACY_M) return elev;
  const cur = elev || emptyElevation();
  if (cur.smooth == null) return { ...cur, smooth: altitude, ref: altitude };
  const smooth = cur.smooth + SMOOTH * (altitude - cur.smooth);
  const diff = smooth - cur.ref;
  if (diff >= STEP_M) return { ...cur, smooth, ref: smooth, gain: cur.gain + diff };
  if (diff <= -STEP_M) return { ...cur, smooth, ref: smooth, loss: cur.loss - diff };
  return { ...cur, smooth };
}

// Foto da subida e descida acumuladas (m) neste momento; null sem altitude.
export const elevMark = elev => (elev && elev.smooth != null ? { g: elev.gain, l: elev.loss } : null);

// Subida e descida de cada km, a partir das fotos tiradas ao completar cada um
// (cumulativas): [[subida, descida], ...] em metros inteiros. Foto vazia (sem
// altitude naquele km) vale 0. null se nenhum km teve altitude.
export function kmElevOf(marks, count) {
  const list = Array.isArray(marks) ? marks : [];
  if (!list.slice(0, count).some(Boolean)) return null;
  const out = [];
  let prev = { g: 0, l: 0 };
  for (let i = 0; i < count; i++) {
    const cur = list[i];
    if (!cur) { out.push([0, 0]); continue; }
    out.push([Math.max(0, Math.round(cur.g) - Math.round(prev.g)), Math.max(0, Math.round(cur.l) - Math.round(prev.l))]);
    prev = cur;
  }
  return out;
}

// Lista vinda do aparelho ou do banco: só pares [subida, descida] válidos, até 600 km.
export function cleanKmElev(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const pair of list.slice(0, 600)) {
    const g = Math.round(Number(pair?.[0]));
    const l = Math.round(Number(pair?.[1]));
    if (!(g >= 0 && g <= 9999 && l >= 0 && l <= 9999)) return [];
    out.push([g, l]);
  }
  return out;
}

// Subida (m) para salvar; null se o GPS nunca deu altitude.
export const elevationGain = elev => (elev && elev.smooth != null ? Math.min(20000, Math.round(elev.gain)) : null);
