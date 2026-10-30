import { db } from './supabase';
import { NAV_GROUPS } from '../components/Layout/nav';

// Permissões por admin (Sistema → Administradores). SQL em
// supabase/migrations/20261128210000_admin_access.sql: papel + áreas extras
// (escrita, vale no banco) + telas ocultas (só menu; não vale para superadmin).

export const ROLE_LABELS = {
  superadmin: 'Superadmin (tudo)',
  suporte: 'Suporte',
  conteudo: 'Conteúdo',
  leitura: 'Só leitura',
};

export const AREA_LABELS = {
  users: 'Usuários (editar, banir, personais, comissões)',
  notifications: 'Notificações (enviar e agendar)',
  segments: 'Segmentos',
  content: 'Conteúdo (exercícios, desafios, ligas, landing)',
  settings: 'Configurações do app',
  marketing: 'Marketing (redes sociais: publicar e responder)',
};

export const ROLE_AREAS = {
  superadmin: Object.keys(AREA_LABELS),
  suporte: ['users', 'notifications', 'segments'],
  conteudo: ['content', 'settings'],
  leitura: [],
};

// Telas que podem ser ocultadas: todas as do menu, menos o Dashboard e a de
// administradores (para ninguém ficar sem como desfazer).
export const SCREENS = NAV_GROUPS.flatMap(g => g.sections.map(s => ({
  key: s.key, label: s.label,
  tabs: s.tabs.filter(t => t.to !== '/' && t.to !== '/admins'),
}))).filter(s => s.tabs.length);

function matches(to, pathname) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function isHidden(hidden, pathname) {
  return (hidden || []).some(to => to !== '/' && matches(to, pathname));
}

// Navegação sem as telas ocultas (seção some quando todas as abas somem).
export function visibleNav(groups, hidden) {
  if (!hidden?.length) return groups;
  return groups
    .map(g => ({
      ...g,
      sections: g.sections
        .map(s => ({ ...s, tabs: s.tabs.filter(t => !isHidden(hidden, t.to)) }))
        .filter(s => s.tabs.length),
    }))
    .filter(g => g.sections.length);
}

export function effectiveAreas(role, extra) {
  return [...new Set([...(ROLE_AREAS[role] || []), ...(extra || [])])];
}

export async function fetchMyAccess() {
  const { data, error } = await db.rpc('my_admin_access');
  if (error) throw error;
  return {
    role: data?.role || 'leitura',
    extraAreas: data?.extra_areas || [],
    hiddenScreens: data?.hidden_screens || [],
  };
}

export async function fetchAccessList() {
  const { data, error } = await db.rpc('admin_list_access');
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.aa_user, email: r.aa_email, role: r.aa_role, extraAreas: r.aa_extra || [], hiddenScreens: r.aa_hidden || [], updatedAt: r.aa_updated,
  }));
}

async function audit(adminId, targetId, action, details) {
  const { error } = await db.from('admin_audit_log').insert({ admin_id: adminId, target_user_id: targetId, action, details });
  if (error) console.error('audit log:', error.message);
}

// O papel muda direto em profiles: a trigger guard_profiles_is_admin só deixa
// superadmin mudar e não deixa rebaixar o último.
export async function setRole(userId, role, adminId) {
  const { error } = await db.from('profiles').update({ admin_role: role }).eq('id', userId);
  if (error) throw error;
  await audit(adminId, userId, 'setAdminRole', { role });
}

export async function saveAccess(userId, { extraAreas, hiddenScreens }, adminId) {
  const { error } = await db.from('admin_access').upsert({
    admin_id: userId, extra_areas: extraAreas, hidden_screens: hiddenScreens,
    updated_at: new Date().toISOString(), updated_by: adminId,
  });
  if (error) throw error;
  await audit(adminId, userId, 'setAdminAccess', { extraAreas, hiddenScreens });
}
