// Quem é personal pode usar o app nos dois modos: "trainer" (painel de alunos)
// ou "aluno" (o app de treino normal, pra treinar ele mesmo). Embaixador e
// influenciador têm o modo "program" (painel de divulgação), aberto pelo botão
// do topo. A escolha fica no aparelho; o padrão é "trainer", que só vale para
// personal (os outros caem no app de aluno).
const MODE_KEY = 'eafit_mode';
const TRAINER_KEY = 'eafit_is_trainer';
const PROGRAM_KEY = 'eafit_program_kind';
const MODES = ['aluno', 'trainer', 'program'];
// Nome antigo do modo do programa, quando só o influenciador tinha.
const LEGACY = { influencer: 'program' };

export function readMode() {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    const mode = LEGACY[stored] || stored;
    return MODES.includes(mode) ? mode : 'trainer';
  } catch {
    return 'trainer';
  }
}

export function writeMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* sem storage */ }
}

// Último valor conhecido do papel por usuário: evita piscar o app de aluno na
// abertura de quem é personal, embaixador ou influenciador (a confirmação vem
// do servidor).
export function readCachedIsTrainer(userId) {
  try { return localStorage.getItem(`${TRAINER_KEY}:${userId}`) === '1'; } catch { return false; }
}

export function writeCachedIsTrainer(userId, value) {
  try {
    if (value) localStorage.setItem(`${TRAINER_KEY}:${userId}`, '1');
    else localStorage.removeItem(`${TRAINER_KEY}:${userId}`);
  } catch { /* sem storage */ }
}

export function readCachedProgramKind(userId) {
  try {
    const v = localStorage.getItem(`${PROGRAM_KEY}:${userId}`);
    return v === 'embaixador' || v === 'influenciador' ? v : null;
  } catch {
    return null;
  }
}

export function writeCachedProgramKind(userId, kind) {
  try {
    if (kind) localStorage.setItem(`${PROGRAM_KEY}:${userId}`, kind);
    else localStorage.removeItem(`${PROGRAM_KEY}:${userId}`);
  } catch { /* sem storage */ }
}
