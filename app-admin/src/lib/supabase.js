import { createClient } from '@supabase/supabase-js';

export const db = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    // App e painel moram na mesma origem e, com a chave padrão, dividiriam a
    // mesma sessão no localStorage: entrar no painel logava o admin no app (e
    // sair/entrar de outra conta num derrubava o outro). Chave própria isola.
    auth: { storageKey: 'eafit-admin-auth' },
  }
);
