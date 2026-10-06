import { db } from './supabase';

// Recursos que o app de fato lê (isFlagOn em app-react). Chave sem valor =
// ligado. Só entra aqui o que existe no app: uma chave sem leitor no código
// não faria nada.
export const KNOWN_FLAGS = [
  { key: 'fotos_progresso', label: 'Fotos de progresso', hint: 'Card no Dashboard do app.' },
  { key: 'convite_amigos', label: 'Convidar amigos', hint: 'Atalho no Perfil do app.' },
  { key: 'feedback', label: 'Enviar feedback', hint: 'Formulário de sugestão/problema/elogio no Perfil do app.' },
];

export const BANNER_LEVELS = [
  { value: 'info', label: 'Informação' },
  { value: 'success', label: 'Novidade' },
  { value: 'warning', label: 'Atenção' },
];

export const DEFAULT_SETTINGS = {
  maintenance: { enabled: false, message: '' },
  banner: { enabled: false, message: '', level: 'info', linkUrl: '', linkLabel: '', version: 0 },
  flags: {},
};

// Mesma leitura de normalizeConfig em app-react/src/lib/appConfig.js (os dois
// apps não compartilham build, então é duplicada). Aqui o banner mantém o
// texto mesmo desligado, pra o admin editar sem perder o rascunho.
export function normalizeSettings(rows) {
  const map = Object.fromEntries((rows || []).map(r => [r.key, r.value && typeof r.value === 'object' ? r.value : {}]));
  const m = map.maintenance || {};
  const b = map.banner || {};
  const flags = {};
  for (const [k, v] of Object.entries(map.flags || {})) {
    if (typeof v === 'boolean') flags[k] = v;
  }
  return {
    maintenance: { enabled: m.enabled === true, message: String(m.message || '') },
    banner: {
      enabled: b.enabled === true,
      message: String(b.message || ''),
      level: BANNER_LEVELS.some(l => l.value === b.level) ? b.level : 'info',
      linkUrl: String(b.linkUrl || ''),
      linkLabel: String(b.linkLabel || ''),
      version: Number.isFinite(Number(b.version)) ? Number(b.version) : 0,
    },
    flags,
  };
}

// O app só abre link http(s) ou caminho relativo; avisa o admin antes de salvar.
export function isValidLink(url) {
  const u = String(url || '').trim();
  return u === '' || /^(https?:\/\/|\/)/i.test(u);
}

// Banner novo/editado muda de "versão": quem já fechou o aviso anterior volta a vê-lo.
export function nextBannerVersion(current, next) {
  const same = ['enabled', 'message', 'level', 'linkUrl', 'linkLabel'].every(k => current[k] === next[k]);
  return same ? current.version : current.version + 1;
}

export async function fetchSettings() {
  const { data, error } = await db.from('app_settings').select('key, value');
  if (error) throw error;
  return normalizeSettings(data);
}

// Grava a chave e registra no log de auditoria (quem mudou o quê).
export async function saveSetting(key, value, adminId) {
  const { error } = await db.from('app_settings').upsert({
    key, value, updated_at: new Date().toISOString(), updated_by: adminId,
  });
  if (error) throw error;
  const { error: auditError } = await db.from('admin_audit_log').insert({
    admin_id: adminId, target_user_id: null, action: 'updateAppSettings', details: { key, value },
  });
  if (auditError) console.error('audit log:', auditError.message);
}
