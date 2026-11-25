import { createClient } from '@supabase/supabase-js';
import { createTimeoutFetch } from './fetchTimeout';
import { isNative } from './native';

export const db = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    // No app Android o Google volta por um endereço que abre o app (lib/nativeAuth.js):
    // PKCE manda só um código de uso único nele, não os tokens da sessão.
    auth: { flowType: isNative() ? 'pkce' : 'implicit' },
    // keepalive: uma request já em voo (ex.: save disparado bem antes de um
    // reload/fechar de aba) continua e completa mesmo depois da página descarregar.
    // Dados e login têm prazo (lib/fetchTimeout.js): sem sinal a escrita falha e
    // entra na fila de pendências em vez de ficar pendurada.
    global: {
      fetch: createTimeoutFetch((url, options) => fetch(url, options)),
    },
  }
);

// O postgrest-js repete sozinho as leituras (GET) que falham na rede, esperando
// 1 s, 2 s e 4 s: sem sinal cada consulta levava ~7 s para falhar (com o prazo
// de lib/fetchTimeout.js, mais de 40 s). Abrir o app sem rede demorava ~15 s
// de "Carregando dados salvos…" antes de cair no plano guardado no aparelho.
// O app já trata a falha (plano em cache, fila de pendências, "Tentar agora"),
// então falhar logo é melhor. O supabase-js não repassa essa opção ao criar o
// cliente (campo `rest` é interno), por isso o ajuste é feito aqui.
if (db.rest) db.rest.retry = false;
