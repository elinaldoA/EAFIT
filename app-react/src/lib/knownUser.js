// "Este aparelho já teve conta logada". Sem a marca, quem chega na tela de
// acesso é provavelmente novo (veio de um link compartilhado ou da landing),
// então ela abre em "Criar conta" em vez de "Entrar". Marcado em App.jsx
// sempre que há sessão.
const KNOWN_USER_KEY = 'eafit_known_user';

export function isKnownUser() {
  try { return localStorage.getItem(KNOWN_USER_KEY) === '1'; } catch { return false; }
}

export function markKnownUser() {
  try { localStorage.setItem(KNOWN_USER_KEY, '1'); } catch { /* armazenamento bloqueado */ }
}
