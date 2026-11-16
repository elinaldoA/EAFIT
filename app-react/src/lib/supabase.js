import { createClient } from '@supabase/supabase-js';
import { createTimeoutFetch } from './fetchTimeout';

export const db = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    // keepalive: uma request já em voo (ex.: save disparado bem antes de um
    // reload/fechar de aba) continua e completa mesmo depois da página descarregar.
    // Dados e login têm prazo (lib/fetchTimeout.js): sem sinal a escrita falha e
    // entra na fila de pendências em vez de ficar pendurada.
    global: {
      fetch: createTimeoutFetch((url, options) => fetch(url, options)),
    },
  }
);
