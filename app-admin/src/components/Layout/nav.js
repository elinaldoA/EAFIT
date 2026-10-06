// Fonte única da navegação: a Sidebar agrupa os links e a Topbar usa os
// mesmos rótulos pro título da página atual.
export const NAV_GROUPS = [
  {
    label: 'Visão geral',
    links: [
      { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
      { to: '/engajamento', label: 'Engajamento', icon: 'trend' },
      { to: '/analise-planos', label: 'Análise dos planos', icon: 'chart' },
    ],
  },
  {
    label: 'Gestão',
    links: [
      { to: '/users', label: 'Usuários', icon: 'users' },
      { to: '/feedback', label: 'Feedback', icon: 'message' },
      { to: '/segmentos', label: 'Segmentos', icon: 'target' },
      { to: '/notificacoes', label: 'Notificações', icon: 'bell' },
      { to: '/automacoes', label: 'Notif. automáticas', icon: 'zap' },
      { to: '/seguranca', label: 'Segurança', icon: 'shield' },
    ],
  },
  {
    label: 'Conteúdo',
    links: [
      { to: '/conteudo', label: 'Conteúdo', icon: 'clipboard' },
      { to: '/biblioteca', label: 'Biblioteca de exercícios', icon: 'dumbbell' },
      { to: '/demonstracoes', label: 'Demonstrações', icon: 'play' },
      { to: '/landing', label: 'Landing page', icon: 'monitor' },
    ],
  },
  {
    label: 'Sistema',
    links: [
      { to: '/configuracoes', label: 'Configurações do app', icon: 'sliders' },
      { to: '/saude', label: 'Saúde do sistema', icon: 'pulse' },
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
