import { db } from './supabase';

// Contas fixas que nunca entram no app, mesmo se o perfil não estiver marcado
// como admin. Vale também offline (não depende da consulta ao banco).
export const APP_BLOCKED_USER_IDS = ['b48fba11-b6f6-4d55-b5a2-0a6223e23e52'];

// Contas de administrador entram só no painel admin, nunca no app. Falha de
// rede ou de leitura conta como "não é admin": o app não pode travar por isso,
// e a barreira de verdade dos dados continua sendo a RLS no banco.
export async function isAdminAccount(userId) {
  if (!userId) return false;
  if (APP_BLOCKED_USER_IDS.includes(userId)) return true;
  try {
    const { data, error } = await db.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
    return !error && data?.is_admin === true;
  } catch {
    return false;
  }
}
