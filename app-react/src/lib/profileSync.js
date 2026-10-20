import { db } from './supabase';

// Versões antigas do app (e salvamentos que falharam sem rede) deixaram dados
// do Perfil só no aparelho (profile_* no localStorage). O Perfil do app lê esse
// cache quando a conta não tem o campo, então a pessoa via o nome dela — mas a
// conta não tinha, e o painel admin mostrava vazio. Ao abrir o app, os campos
// que existem só aqui sobem para a conta (user_metadata). Nunca sobrescreve o
// que a conta já tem.

const FIELDS = ['nome', 'sobrenome', 'apelido', 'sexo', 'idade', 'peso', 'altura', 'meta', 'nivel', 'local', 'pesoAlvo', 'macroAgua', 'weeklyGoal'];
const OWNER_KEY = 'eafit_data_owner'; // lib/localData.js

const empty = v => v === undefined || v === null || String(v).trim() === '';

// Campos que estão no aparelho e faltam na conta; null = nada a enviar. Só lê
// o cache se ele for desta conta (lib/localData.js limpa o de outra pessoa).
export function localOnlyProfileFields(userId, metadata = {}) {
  try {
    if (!userId || localStorage.getItem(OWNER_KEY) !== userId) return null;
    const fields = {};
    for (const key of FIELDS) {
      const local = localStorage.getItem(`profile_${key}`);
      if (!empty(local) && empty(metadata?.[key])) fields[key] = local.trim();
    }
    return Object.keys(fields).length ? fields : null;
  } catch {
    return null;
  }
}

// Devolve o usuário atualizado, ou null se não havia nada (ou falhou: tenta de
// novo na próxima abertura).
export async function syncLocalProfile(user) {
  const fields = localOnlyProfileFields(user?.id, user?.user_metadata);
  if (!fields) return null;
  try {
    const { data, error } = await db.auth.updateUser({ data: fields });
    return error ? null : data?.user || null;
  } catch {
    return null;
  }
}
