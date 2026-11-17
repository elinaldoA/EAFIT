import { t } from './i18n';

// Erro do servidor/rede em texto que a pessoa entende. As mensagens cruas do
// Supabase e do navegador ("Failed to fetch", "JWT expired") vinham direto para
// o aviso, em inglês e sem dizer o que fazer.
const NETWORK = /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out/i;
const SESSION = /jwt|token.*(expired|invalid)|not authenticated|invalid refresh|session.*(expired|missing)/i;

// Erro cuja mensagem o app escreveu para a pessoa (ex.: "Imagem muito grande"):
// friendlyError a mostra como está, em vez de trocar pelo texto geral.
export function userError(message) {
  return Object.assign(new Error(message), { userFacing: true });
}

export function friendlyError(err, fallback) {
  if (err?.userFacing) return err.message;
  const message = String(err?.message || err || '');
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (offline || NETWORK.test(message)) return t('Sem conexão. Confira a internet e tente de novo.');
  if (SESSION.test(message)) return t('Sua sessão expirou. Entre de novo.');
  return fallback || t('Não foi possível salvar. Tente de novo.');
}
