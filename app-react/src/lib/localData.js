// Dados do usuário guardados no aparelho (cache de treino, perfil e a fila de
// escritas pendentes). Ficam atrelados a quem os gravou: sem isso, em aparelho
// compartilhado a pessoa seguinte herdava séries marcadas, cargas e notas da
// anterior, e a fila dela era reexecutada (e falhava na RLS) para sempre.
// Tema e idioma não entram: são do aparelho, não da conta.
const OWNER_KEY = 'eafit_data_owner';
const PREFIXES = ['treino_', 'set_', 'carga_', 'profile_'];
const EXACT = ['pendingSyncQueue', 'plan_cache', 'dash_tab', 'reminders_enabled'];

function safe(fn) {
  try { return fn(); } catch { return undefined; }
}

export function clearUserLocalData() {
  safe(() => {
    Object.keys(localStorage).forEach(k => {
      if (EXACT.includes(k) || PREFIXES.some(p => k.startsWith(p))) localStorage.removeItem(k);
    });
    localStorage.removeItem(OWNER_KEY);
  });
}

// Chamado a cada sessão: se o dono dos dados locais é outro usuário, limpa tudo
// antes de o app ler o cache. Sem dono registrado (instalação anterior a esta
// versão) só registra — não dá para saber de quem são.
export function claimLocalData(userId) {
  if (!userId) return;
  safe(() => {
    const owner = localStorage.getItem(OWNER_KEY);
    if (owner && owner !== userId) clearUserLocalData();
    localStorage.setItem(OWNER_KEY, userId);
  });
}
