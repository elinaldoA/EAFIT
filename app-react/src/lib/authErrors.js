import { t } from './i18n';
// Traduz erros do Supabase Auth (que vêm em inglês, às vezes com detalhes
// técnicos) pra mensagens em português que o usuário final entende. Olha
// primeiro o `code` (estável entre versões do supabase-js/GoTrue) e cai pro
// texto da mensagem em versões/erros que não trazem code.
const BY_CODE = {
  invalid_credentials: t('E-mail ou senha inválidos.'),
  email_not_confirmed: t('Confirme seu e-mail antes de entrar — enviamos um link quando você criou a conta.'),
  user_already_exists: t('Já existe uma conta com este e-mail. Entre ou redefina a senha.'),
  email_exists: t('Já existe uma conta com este e-mail. Entre ou redefina a senha.'),
  weak_password: t('Senha fraca: use pelo menos 6 caracteres, misturando letras e números.'),
  same_password: t('A nova senha precisa ser diferente da atual.'),
  over_email_send_rate_limit: t('Muitos e-mails enviados. Aguarde alguns minutos e tente de novo.'),
  over_request_rate_limit: t('Muitas tentativas seguidas. Aguarde um pouco e tente de novo.'),
  email_address_invalid: t('E-mail inválido.'),
  validation_failed: t('Confira o e-mail e a senha informados.'),
  signup_disabled: t('Novos cadastros estão temporariamente desativados.'),
  user_banned: t('Esta conta está suspensa. Fale com o suporte.'),
  session_expired: t('Sua sessão expirou. Entre de novo.'),
  otp_expired: t('Este link expirou ou já foi usado. Peça um novo.'),
};

const BY_MESSAGE = [
  [/invalid login credentials/i, BY_CODE.invalid_credentials],
  [/email not confirmed/i, BY_CODE.email_not_confirmed],
  [/already registered|already exists/i, BY_CODE.user_already_exists],
  [/password should be|weak password/i, BY_CODE.weak_password],
  [/should be different from the old password/i, BY_CODE.same_password],
  [/for security purposes|rate limit|too many requests/i, BY_CODE.over_request_rate_limit],
  [/unable to validate email|invalid email|email address .* is invalid/i, BY_CODE.email_address_invalid],
  [/failed to fetch|network ?error|load failed/i, t('Sem conexão com a internet. Verifique e tente de novo.')],
  [/expired|invalid.*(token|link)/i, BY_CODE.otp_expired],
];

export const GENERIC_AUTH_ERROR = t('Não foi possível concluir agora. Tente de novo em instantes.');

export function translateAuthError(error) {
  if (!error) return null;
  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code];
  const msg = String(error.message || error);
  const match = BY_MESSAGE.find(([re]) => re.test(msg));
  return match ? match[1] : GENERIC_AUTH_ERROR;
}

// Falhas que ganham texto próprio no login (rede, limite de tentativas, conta suspensa)
// em vez da mensagem genérica de credenciais — decide pelo erro, não pelo texto traduzido.
export function isSpecificAuthError(error) {
  if (['over_request_rate_limit', 'over_email_send_rate_limit', 'user_banned'].includes(error?.code)) return true;
  return /failed to fetch|network ?error|load failed|for security purposes|rate limit|too many requests/i.test(String(error?.message || ''));
}

export function isEmailNotConfirmed(error) {
  return error?.code === 'email_not_confirmed' || /email not confirmed/i.test(String(error?.message || ''));
}
