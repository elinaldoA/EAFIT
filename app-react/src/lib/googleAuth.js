// Login com Google (Supabase OAuth). O Google devolve a pessoa para esta mesma
// página; quem cria a conta é o Supabase, então o que o cadastro por e-mail
// grava em user_metadata (aceite dos termos, idioma, origem) é gravado aqui,
// logo depois da volta.

// Janela em que uma conta do Google ainda conta como "recém-criada". Passou
// disso sem aceite gravado, é conta antiga (a tela de novo aceite cuida dela).
const FRESH_MS = 24 * 60 * 60 * 1000;

export function hasGoogleIdentity(user) {
  const providers = user?.app_metadata?.providers;
  if (Array.isArray(providers)) return providers.includes('google');
  return user?.app_metadata?.provider === 'google';
}

// Conta do Google criada há pouco e ainda sem o aceite dos Termos gravado:
// falta fechar o cadastro (aceite, idioma, origem e e-mail de boas-vindas).
export function needsGoogleSignupFinish(user, now = Date.now()) {
  if (!hasGoogleIdentity(user) || user.user_metadata?.termsAcceptedAt) return false;
  const created = new Date(user.created_at).getTime();
  return Number.isFinite(created) && now - created < FRESH_MS;
}

// Conta que só entra pelo Google: não tem senha (o Supabase só lista "email"
// em providers depois que a pessoa cria uma). Sem a lista, não presume nada.
export function isGoogleOnly(user) {
  const providers = user?.app_metadata?.providers;
  if (!Array.isArray(providers)) return user?.app_metadata?.provider === 'google';
  return providers.includes('google') && !providers.includes('email');
}
