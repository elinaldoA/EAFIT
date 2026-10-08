import { db } from './supabase';

// Recursos que o app de fato lê (isFlagOn em app-react). Chave sem valor =
// ligado. Só entra aqui o que existe no app: uma chave sem leitor no código
// não faria nada.
export const KNOWN_FLAGS = [
  { key: 'fotos_progresso', label: 'Fotos de progresso', hint: 'Card no Dashboard do app.' },
  { key: 'convite_amigos', label: 'Convidar amigos', hint: 'Atalho no Perfil do app.' },
  { key: 'feedback', label: 'Enviar feedback', hint: 'Formulário de sugestão/problema/elogio no Perfil do app.' },
  { key: 'avaliar_app', label: 'Pedir avaliação do app', hint: 'Modal "Está gostando do EAFIT?" ao fechar o resumo do treino. A nota cai na fila de Feedback.' },
  { key: 'desafios', label: 'Desafios', hint: 'Card de desafios em Dashboard → Treinos.' },
  { key: 'amigos', label: 'Amigos e feed', hint: 'Aba Amigos do Dashboard (lista de amigos, ranking semanal e feed).' },
  { key: 'checkin_diario', label: 'Check-in diário', hint: 'Pergunta de energia, sono e humor na tela de Treino e o resumo em Dashboard → Corpo.' },
  { key: 'medidas_corporais', label: 'Medidas corporais', hint: 'Registro de cintura, quadril, peito, braço e coxa em Dashboard → Corpo.' },
];

export const BANNER_LEVELS = [
  { value: 'info', label: 'Informação' },
  { value: 'success', label: 'Novidade' },
  { value: 'warning', label: 'Atenção' },
];

export const DEFAULT_SETTINGS = {
  maintenance: { enabled: false, message: '' },
  banner: { enabled: false, message: '', level: 'info', linkUrl: '', linkLabel: '', startsOn: '', endsOn: '', version: 0 },
  flags: {},
  moved: { enabled: false, url: '' },
};

const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Situação do aviso hoje, pelo período (datas YYYY-MM-DD no fuso do app;
// vazio = sem limite). 'agendado' | 'no_ar' | 'encerrado'.
export function bannerWindow(banner, today) {
  if (banner.startsOn && today < banner.startsOn) return 'agendado';
  if (banner.endsOn && today > banner.endsOn) return 'encerrado';
  return 'no_ar';
}

// Mesma leitura de normalizeConfig em app-react/src/lib/appConfig.js (os dois
// apps não compartilham build, então é duplicada). Aqui o banner mantém o
// texto mesmo desligado, pra o admin editar sem perder o rascunho.
export function normalizeSettings(rows) {
  const map = Object.fromEntries((rows || []).map(r => [r.key, r.value && typeof r.value === 'object' ? r.value : {}]));
  const m = map.maintenance || {};
  const b = map.banner || {};
  const mv = map.moved || {};
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
      startsOn: isDay(b.startsOn) ? b.startsOn : '',
      endsOn: isDay(b.endsOn) ? b.endsOn : '',
      version: Number.isFinite(Number(b.version)) ? Number(b.version) : 0,
    },
    flags,
    moved: { enabled: mv.enabled === true, url: String(mv.url || '') },
  };
}

// O app só aceita endereço novo absoluto em https (ver movedTarget em app-react).
export function isValidMovedUrl(url) {
  return /^https:\/\/\S+$/i.test(String(url || '').trim());
}

// O app só abre link http(s) ou caminho relativo; avisa o admin antes de salvar.
export function isValidLink(url) {
  const u = String(url || '').trim();
  return u === '' || /^(https?:\/\/|\/)/i.test(u);
}

// Banner novo/editado muda de "versão": quem já fechou o aviso anterior volta a vê-lo.
export function nextBannerVersion(current, next) {
  // Mudar só o período não reabre o aviso para quem já fechou.
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
