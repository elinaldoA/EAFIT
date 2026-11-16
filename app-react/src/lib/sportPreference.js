// Esporte de interesse vindo do link de divulgação (https://eafit.com.br/app/?esporte=corrida):
// fica guardado no navegador e o onboarding abre com esse esporte já marcado,
// para quem chega de um anúncio de corrida não cair numa tela de musculação.
// É só uma sugestão: o onboarding confere se o esporte está liberado para a
// pessoa (useSportModule) e ela pode trocar antes de continuar.

const KEY = 'eafit_sport_pref';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ID = /^[a-z]{3,20}$/;

export const normalizeSport = value => {
  const id = String(value ?? '').trim().toLowerCase();
  return ID.test(id) ? id : null;
};

function read(now) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && normalizeSport(saved.id) && now - Number(saved.at) < TTL_MS) return saved;
  } catch { /* sem armazenamento ou valor inválido */ }
  return null;
}

// Chamado ao abrir o app. O link mais recente vale (quem clica em outro anúncio
// mudou de ideia).
export function captureSportPref(search = window.location.search, now = Date.now()) {
  let id = null;
  try { id = normalizeSport(new URLSearchParams(search).get('esporte')); } catch { /* busca inválida */ }
  if (!id) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ id, at: now }));
  } catch { /* sem armazenamento: o onboarding só não abre marcado */ }
}

// Esporte sugerido pelo link ainda válido, ou null.
export function preferredSport(now = Date.now()) {
  const saved = read(now);
  return saved ? normalizeSport(saved.id) : null;
}

export function clearSportPref() {
  try { localStorage.removeItem(KEY); } catch { /* sem armazenamento */ }
}
