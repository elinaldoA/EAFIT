import { db } from './supabase';
import { t } from './i18n';

// Pesquisa "por que você parou?" do e-mail semanal: cada motivo do e-mail é um
// link https://eafit.com.br/app/?motivo=<motivo>&r=<código>. Funciona sem
// login — o código é assinado pelo servidor e vale só pra conta que recebeu o
// e-mail (ver supabase/functions/inactivity-reason).

// Mesma lista de supabase/functions/_shared/inactivity.ts.
export const REASONS = [
  { value: 'sem_tempo', label: t('Estou sem tempo') },
  { value: 'treino', label: t('Os treinos não combinam comigo') },
  { value: 'app_dificil', label: t('Achei o app difícil de usar') },
  { value: 'outro_app', label: t('Uso outro app ou treino com um personal') },
  { value: 'saude', label: t('Lesão ou questão de saúde') },
  { value: 'pausa', label: t('Só dei um tempo, volto em breve') },
  { value: 'outro', label: t('Outro motivo') },
];

export const COMMENT_MAX = 500;

// Devolve { token, reason } e tira os dois da barra de endereço (não devem
// sobrar num recarregar). Motivo fora da lista vira null: a tela pede a escolha.
export function takeSurveyLink(win = window) {
  const url = new URL(win.location.href);
  const token = url.searchParams.get('r');
  const reason = url.searchParams.get('motivo');
  if (!token || reason === null) return null;
  url.searchParams.delete('r');
  url.searchParams.delete('motivo');
  win.history.replaceState(win.history.state, '', url.pathname + url.search + url.hash);
  return { token, reason: REASONS.some(r => r.value === reason) ? reason : null };
}

export async function sendInactivityReason(token, reason, comment = '') {
  try {
    const { data, error } = await db.functions.invoke('inactivity-reason', { body: { token, reason, comment } });
    return !error && !data?.error;
  } catch {
    return false;
  }
}
