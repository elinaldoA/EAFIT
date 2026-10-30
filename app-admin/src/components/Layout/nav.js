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
          { to: '/meu-relatorio', label: 'Meu relatório' },
          { to: '/engajamento', label: 'Engajamento' },
          { to: '/analise-planos', label: 'Análise dos planos' },
          { to: '/comportamento', label: 'Comportamento' },
          { to: '/campanhas', label: 'Campanhas' },
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
          { to: '/verificacao-cref', label: 'Verificação de CREF' },
          { to: '/embaixadores', label: 'Embaixadores e influenciadores' },
          { to: '/comissoes', label: 'Comissões' },
          { to: '/campanhas-parceiros', label: 'Campanhas de parceiros' },
          { to: '/segmentos', label: 'Segmentos' },
        ],
      },
      {
        key: 'acompanhamento', label: 'Acompanhamento', icon: 'shield',
        tabs: [
          { to: '/suporte', label: 'Central de suporte' },
          { to: '/feedback', label: 'Feedback' },
          { to: '/inatividade', label: 'Por que pararam' },
          { to: '/pesquisas', label: 'Pesquisas' },
          { to: '/contato', label: 'Contato do site' },
          { to: '/seguranca', label: 'Segurança' },
        ],
      },
      {
        key: 'comunidade', label: 'Comunidade', icon: 'message',
        tabs: [
          { to: '/desafios', label: 'Desafios' },
          { to: '/ligas', label: 'Ligas' },
          { to: '/amigos', label: 'Amigos e feed' },
          { to: '/moderacao', label: 'Moderação' },
        ],
      },
      {
        key: 'comunicacao', label: 'Comunicação', icon: 'bell',
        tabs: [
          { to: '/notificacoes', label: 'Enviar notificação' },
          { to: '/sumidos', label: 'Sumidos' },
          { to: '/historico-envios', label: 'Histórico' },
          { to: '/resultados-envios', label: 'Resultados' },
          { to: '/automacoes', label: 'Automáticas' },
          { to: '/calendario', label: 'Calendário' },
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
          { to: '/ranking-conteudo', label: 'Ranking e qualidade' },
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
          { to: '/experimentos', label: 'Experimentos' },
          { to: '/saude', label: 'Saúde do sistema' },
          { to: '/custos', label: 'Custos' },
          { to: '/relatorios', label: 'Relatórios e alertas' },
          { to: '/auditoria', label: 'Auditoria' },
          { to: '/erros', label: 'Erros do app' },
          { to: '/admins', label: 'Administradores' },
          { to: '/exclusoes', label: 'Exclusões de conta' },
          { to: '/lgpd', label: 'Pedidos LGPD' },
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
