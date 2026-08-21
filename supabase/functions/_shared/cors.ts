// Cabeçalhos CORS pras edge functions chamadas pelo navegador (app-react/
// app-admin) via supabase-js .functions.invoke(). Sem isso, o preflight
// OPTIONS que o navegador manda antes do POST (por causa do header
// Authorization customizado) cai na própria função, que respondia 405 sem
// Access-Control-Allow-Origin — o navegador bloqueia o POST real e
// supabase-js reporta só "Failed to send a request to the Edge Function",
// sem detalhe nenhum do erro de verdade.
//
// Restrito a uma allowlist (em vez de '*'): essas funções expõem ações
// privilegiadas (excluir conta, banir/editar/apagar usuário, broadcast).
// A autorização de verdade já vem do JWT + checagem is_admin no corpo da
// função — CORS sozinho não protege nada —, mas restringir a origem evita
// que um site qualquer consiga ao menos tentar a chamada a partir do
// navegador de um usuário/admin logado.
const ALLOWED_ORIGINS = [
  'https://elinaldoa.github.io', // produção (app-react em /EAFIT/, app-admin em /EAFIT/admin/)
  'http://localhost:5173', // app-react em dev (porta padrão do Vite)
  'http://localhost:5174', // app-admin em dev (vite.config.js define essa porta)
];

export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}
