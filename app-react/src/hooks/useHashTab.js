import { useCallback, useEffect, useState } from 'react';

// Aba atual no hash da URL (#treino, #hidratacao, #dash, #perfil) e no
// histórico do navegador: o "voltar" do Android volta pra aba anterior em vez
// de fechar o app, recarregar mantém a aba, e os atalhos do ícone instalado
// (manifest.shortcuts em vite.config.js) abrem direto numa aba.
//
// Hash que não é uma aba conhecida (ex.: #access_token=...&type=recovery do
// link de redefinição de senha do Supabase) é ignorado e não é tocado — o
// supabase-js precisa lê-lo.
function tabFromHash(tabs, fallback) {
  const key = window.location.hash.replace(/^#/, '');
  return tabs.includes(key) ? key : fallback;
}

export function useHashTab(tabs, fallback) {
  const [tab, setTabState] = useState(() => tabFromHash(tabs, fallback));

  useEffect(() => {
    function sync() { setTabState(tabFromHash(tabs, fallback)); }
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, [tabs, fallback]);

  const setTab = useCallback(next => {
    if (next === tab) return;
    window.history.pushState(null, '', `#${next}`);
    setTabState(next);
  }, [tab]);

  return [tab, setTab];
}
