// Código do influenciador logado, para o card de treino sair com o link (e o
// QR) dele. O App
// carrega o valor guardado no aparelho ao entrar e o servidor confirma
// (hooks/useInfluencer.js); link pausado não entra no card.
const KEY = 'eafit_my_ref';
let current = '';

export function loadMyRef(userId) {
  try { current = userId ? (localStorage.getItem(`${KEY}:${userId}`) || '') : ''; } catch { current = ''; }
}

export function saveMyRef(userId, amb) {
  current = amb?.active && amb.code ? amb.code : '';
  try {
    if (current) localStorage.setItem(`${KEY}:${userId}`, current);
    else localStorage.removeItem(`${KEY}:${userId}`);
  } catch { /* sem storage: vale só nesta sessão */ }
}

export const myRefCode = () => current;
