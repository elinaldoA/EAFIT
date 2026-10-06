// Fonte única da navegação: a Sidebar agrupa os links e a Topbar usa os
// mesmos rótulos pro título da página atual.
export const NAV_GROUPS = [
  {
    label: 'Visão geral',
    links: [
      { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
      { to: '/engajamento', label: 'Engajamento', icon: 'trend' },
    ],
  },
  {
    label: 'Gestão',
    links: [
      { to: '/users', label: 'Usuários', icon: 'users' },
      { to: '/notificacoes', label: 'Notificações', icon: 'bell' },
      { to: '/seguranca', label: 'Segurança', icon: 'shield' },
    ],
  },
  {
    label: 'Conteúdo',
    links: [
      { to: '/conteudo', label: 'Conteúdo', icon: 'clipboard' },
      { to: '/demonstracoes', label: 'Demonstrações', icon: 'play' },
      { to: '/landing', label: 'Landing page', icon: 'monitor' },
    ],
  },
  {
    label: 'Sistema',
    links: [
      { to: '/auditoria', label: 'Auditoria', icon: 'clock' },
      { to: '/perfil', label: 'Meu perfil', icon: 'user' },
    ],
  },
];

export const ALL_LINKS = NAV_GROUPS.flatMap(g => g.links);

// '/users/:id' e afins herdam o rótulo da seção.
export function titleForPath(pathname) {
  const exact = ALL_LINKS.find(l => l.to === pathname);
  if (exact) return exact.label;
  const section = ALL_LINKS.find(l => l.to !== '/' && pathname.startsWith(`${l.to}/`));
  return section ? section.label : '';
}
