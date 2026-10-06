// Quem é personal pode usar o app nos dois modos: "trainer" (painel de alunos)
// ou "aluno" (o app de treino normal, pra treinar ele mesmo). A escolha fica
// no aparelho; o padrão para personal é o modo trainer.
const MODE_KEY = 'eafit_mode';
const TRAINER_KEY = 'eafit_is_trainer';

export function readMode() {
  try { return localStorage.getItem(MODE_KEY) === 'aluno' ? 'aluno' : 'trainer'; } catch { return 'trainer'; }
}

export function writeMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* sem storage */ }
}

// Último valor conhecido de "é personal" por usuário: evita piscar o app de
// aluno na abertura de quem é personal (a confirmação vem do servidor).
export function readCachedIsTrainer(userId) {
  try { return localStorage.getItem(`${TRAINER_KEY}:${userId}`) === '1'; } catch { return false; }
}

export function writeCachedIsTrainer(userId, value) {
  try {
    if (value) localStorage.setItem(`${TRAINER_KEY}:${userId}`, '1');
    else localStorage.removeItem(`${TRAINER_KEY}:${userId}`);
  } catch { /* sem storage */ }
}
