import { db } from './supabase';
import { t } from './i18n';

// Pedido de acesso de personal (Perfil → Sou personal trainer). O admin
// confere o CREF e libera; SQL em supabase/migrations/20261128190000_trainer_verification.sql.

// Mesma regra de normalize_cref no banco: "12345 g sp" → "012345-G/SP".
export function normalizeCref(raw) {
  const m = /^\s*([0-9]{3,6})\s*[-/ ]?\s*([GP])\s*[-/ ]?\s*([A-Z]{2})\s*$/.exec(String(raw || '').toUpperCase());
  return m ? `${m[1].padStart(6, '0')}-${m[2]}/${m[3]}` : null;
}

const ERRORS = {
  invalid_cref: t('CREF inválido. Use o formato 012345-G/SP.'),
  invalid_name: t('Informe seu nome completo.'),
  already_pending: t('Você já tem um pedido em análise.'),
  already_trainer: t('Seu acesso de personal já está liberado.'),
};

export function friendlyTrainerRequestError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : t('Não foi possível concluir. Tente de novo.');
}

export async function fetchMyTrainerRequest() {
  const { data, error } = await db.rpc('my_trainer_request');
  if (error) throw error;
  return data || null;
}

export async function requestTrainerAccess(name, cref, note) {
  const { error } = await db.rpc('request_trainer_access', { p_name: name, p_cref: cref, p_note: note || '' });
  if (error) throw error;
}
