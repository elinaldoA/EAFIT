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

// Subida (m) para salvar; null se o GPS nunca deu altitude.
export const elevationGain = elev => (elev && elev.smooth != null ? Math.min(20000, Math.round(elev.gain)) : null);
