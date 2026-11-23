// Cadência opcional escrita no campo Técnica do plano: "3-1-1" (descer 3 s,
// pausa 1 s embaixo, subir 1 s) ou "3-1-1-0" (com pausa no topo). Aceita
// "cadência 3-1-1", "tempo 3-1-1" ou só o padrão.
const TEMPO_RE = /(?<![\d-])(\d)-(\d|x)-(\d|x)(?:-(\d))?(?![\d-])/i;

export function parseTempo(tecnica) {
  const m = String(tecnica || '').match(TEMPO_RE);
  if (!m) return null;
  const n = v => (v === undefined ? 0 : /x/i.test(v) ? 0 : Number(v));
  const [, down, bottom, up, top] = m;
  return { label: m[0], down: n(down), bottom: n(bottom), up: n(up), top: n(top) };
}
