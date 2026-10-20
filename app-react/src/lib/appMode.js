// Quem é personal pode usar o app nos dois modos: "trainer" (painel de alunos)
// ou "aluno" (o app de treino normal, pra treinar ele mesmo). Influenciador
// tem o modo "influencer" (painel de divulgação), aberto pelo botão do topo.
// A escolha fica no aparelho; o padrão é "trainer", que só vale para personal
// (os outros caem no app de aluno).
const MODE_KEY = 'eafit_mode';
const TRAINER_KEY = 'eafit_is_trainer';
const INFLUENCER_KEY = 'eafit_is_influencer';
const MODES = ['aluno', 'trainer', 'influencer'];

export function readMode() {
  try {
    const mode = localStorage.getItem(MODE_KEY);
    return MODES.includes(mode) ? mode : 'trainer';
  } catch {
    return 'trainer';
  }
}

export function writeMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* sem storage */ }
}

// Último valor conhecido do papel por usuário: evita piscar o app de aluno na
// abertura de quem é personal ou influenciador (a confirmação vem do servidor).
function readCached(prefix, userId) {
  try { return localStorage.getItem(`${prefix}:${userId}`) === '1'; } catch { return false; }
}

function writeCached(prefix, userId, value) {
  try {
    if (value) localStorage.setItem(`${prefix}:${userId}`, '1');
    else localStorage.removeItem(`${prefix}:${userId}`);
  } catch { /* sem storage */ }
}

export const readCachedIsTrainer = userId => readCached(TRAINER_KEY, userId);
export const writeCachedIsTrainer = (userId, value) => writeCached(TRAINER_KEY, userId, value);
export const readCachedIsInfluencer = userId => readCached(INFLUENCER_KEY, userId);
export const writeCachedIsInfluencer = (userId, value) => writeCached(INFLUENCER_KEY, userId, value);
