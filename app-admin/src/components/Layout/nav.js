// Fonte única da navegação. Cada seção aparece UMA vez na Sidebar e as suas
// páginas viram abas (SectionTabs) — as rotas continuam as mesmas, então
// links e favoritos antigos seguem funcionando.
export const NAV_GROUPS = [
  {
    label: 'Visão geral',
    sections: [
      {
        key: 'dashboard', label: 'Dashboard', icon: 'dashboard', end: true,
        tabs: [{ to: '/', label: 'Dashboard' }],
      },
      {
        key: 'analises', label: 'Análises', icon: 'chart',
        tabs: [
          { to: '/engajamento', label: 'Engajamento' },
          { to: '/analise-planos', label: 'Análise dos planos' },
          { to: '/comportamento', label: 'Comportamento' },
          { to: '/bem-estar', label: 'Bem-estar' },
          { to: '/conquistas', label: 'Conquistas e recordes' },
        ],
      },
    ],
  },
  {
    label: 'Pessoas',
    sections: [
      {
        key: 'pessoas', label: 'Pessoas', icon: 'users',
        tabs: [
          { to: '/users', label: 'Usuários' },
          { to: '/personais', label: 'Personais' },
          { to: '/segmentos', label: 'Segmentos' },
        ],
      },
      {
        key: 'acompanhamento', label: 'Acompanhamento', icon: 'shield',
        tabs: [
          { to: '/feedback', label: 'Feedback' },
          { to: '/contato', label: 'Contato do site' },
          { to: '/seguranca', label: 'Segurança' },
        ],
      },
      {
        key: 'comunidade', label: 'Comunidade', icon: 'message',
        tabs: [
          { to: '/desafios', label: 'Desafios' },
          { to: '/amigos', label: 'Amigos e feed' },
        ],
      },
      {
        key: 'comunicacao', label: 'Comunicação', icon: 'bell',
        tabs: [
          { to: '/notificacoes', label: 'Enviar notificação' },
          { to: '/historico-envios', label: 'Histórico' },
          { to: '/automacoes', label: 'Automáticas' },
        ],
      },
    ],
  },
  {
    label: 'Conteúdo',
    sections: [
      {
        key: 'conteudo', label: 'Conteúdo', icon: 'clipboard',
        tabs: [
          { to: '/conteudo', label: 'Modelos' },
          { to: '/biblioteca', label: 'Biblioteca de exercícios' },
          { to: '/demonstracoes', label: 'Demonstrações' },
          { to: '/landing', label: 'Landing page' },
        ],
      },
    ],
  },
  {
    label: 'Sistema',
    sections: [
      {
        key: 'sistema', label: 'Sistema', icon: 'sliders',
        tabs: [
          { to: '/configuracoes', label: 'Configurações do app' },
          { to: '/saude', label: 'Saúde do sistema' },
          { to: '/auditoria', label: 'Auditoria' },
          { to: '/erros', label: 'Erros do app' },
          { to: '/admins', label: 'Administradores' },
          { to: '/exclusoes', label: 'Exclusões de conta' },
          { to: '/termos', label: 'Termos e privacidade' },
        ],
      },
    ],
  },
];

export const ALL_SECTIONS = NAV_GROUPS.flatMap(g => g.sections);

// Páginas fora do menu (acessadas pelo avatar na Topbar).
const EXTRA_PAGES = [{ to: '/perfil', label: 'Meu perfil' }];

function matches(to, pathname) {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

// Seção dona do caminho ('/users/:id' pertence à seção de '/users').
export function sectionForPath(pathname) {
  return ALL_SECTIONS.find(s => s.tabs.some(t => matches(t.to, pathname))) || null;
}

// Aba exata do caminho; é só nela que a faixa de abas aparece (detalhes como
// '/users/:id' têm cabeçalho próprio).
export function tabForPath(pathname) {
  const section = sectionForPath(pathname);
  return section?.tabs.find(t => t.to === pathname) || null;
}

export function titleForPath(pathname) {
  const section = sectionForPath(pathname);
  if (section) {
    const tab = section.tabs.find(t => matches(t.to, pathname));
    return section.tabs.length > 1 && tab ? `${section.label} / ${tab.label}` : section.label;
  }
  return EXTRA_PAGES.find(p => matches(p.to, pathname))?.label || '';
}
