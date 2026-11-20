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
          { to: '/uso-por-modulo', label: 'Uso por módulo' },
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
          { to: '/pre-cadastro-run', label: 'Pré-cadastro do Run' },
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
    label: 'Marketing',
    sections: [
      {
        key: 'marketing', label: 'Marketing', icon: 'megaphone',
        tabs: [
          { to: '/marketing', label: 'Publicar' },
          { to: '/marketing-resultados', label: 'Resultados' },
          { to: '/marketing-comentarios', label: 'Comentários' },
          { to: '/marketing-midia', label: 'Biblioteca de mídia' },
          { to: '/marketing-destaques', label: 'Destaques' },
          { to: '/marketing-contas', label: 'Contas conectadas' },
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
          { to: '/alimentos', label: 'Catálogo de alimentos' },
          { to: '/provas-corrida', label: 'Provas de corrida' },
          { to: '/desafios-run', label: 'Desafios do Run' },
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

// Uma linha por tela: aparece sob as abas e como dica ao passar o mouse, para
// quem não sabe em que aba mora o que procura.
export const TAB_HINTS = {
  '/': 'Números do dia e alertas que pedem atenção.',
  '/meu-relatorio': 'Resumo da semana do app para você.',
  '/engajamento': 'Quem está ativo, quem está em risco e como a retenção evolui.',
  '/analise-planos': 'Como os planos de treino são usados e concluídos.',
  '/comportamento': 'Visitas, páginas e origem do tráfego no site e no app.',
  '/campanhas': 'Resultado dos links com UTM: de onde vêm os cadastros.',
  '/bem-estar': 'Check-ins de sono, humor, água e nutrição dos alunos.',
  '/conquistas': 'Medalhas liberadas e recordes pessoais.',
  '/users': 'Lista e detalhe das contas: buscar, banir, ver treinos e dados.',
  '/uso-por-modulo': 'Quem usa musculação, só o Run ou os dois.',
  '/personais': 'Personais cadastrados, seus alunos e convites.',
  '/verificacao-cref': 'Aprovar ou recusar o CREF enviado pelos personais.',
  '/embaixadores': 'Embaixadores e influenciadores, códigos e indicações.',
  '/comissoes': 'Comissões a pagar e o histórico de repasses.',
  '/campanhas-parceiros': 'Ofertas de parceiros mostradas no app.',
  '/segmentos': 'Públicos salvos para usar em envios e análises.',
  '/suporte': 'Chamados abertos pelos usuários.',
  '/feedback': 'Sugestões e reclamações enviadas pelo app.',
  '/inatividade': 'Motivos que quem parou de treinar deu ao sair.',
  '/pesquisas': 'Pesquisas e NPS: criar, ativar e ver respostas.',
  '/contato': 'Mensagens recebidas pelo formulário do site.',
  '/pre-cadastro-run': 'Quem pediu aviso do lançamento do EAFIT Run.',
  '/seguranca': 'Relatos de dor ou lesão feitos durante o treino.',
  '/desafios': 'Desafios da comunidade: criar e encerrar.',
  '/ligas': 'Temporadas, divisões e ranking das ligas.',
  '/amigos': 'Amizades e posts do feed.',
  '/moderacao': 'Denúncias de conteúdo para analisar.',
  '/notificacoes': 'Mandar uma notificação push para um público.',
  '/sumidos': 'Quem parou de abrir o app, com atalho para reativar.',
  '/historico-envios': 'Tudo o que já foi enviado por push.',
  '/resultados-envios': 'Aberturas e cliques de cada envio.',
  '/automacoes': 'Notificações que saem sozinhas por gatilho.',
  '/calendario': 'Envios e publicações agendados.',
  '/marketing': 'Montar e publicar posts nas redes sociais.',
  '/marketing-resultados': 'Alcance e engajamento dos posts publicados.',
  '/marketing-comentarios': 'Responder comentários das redes.',
  '/marketing-midia': 'Fotos e vídeos prontos para os posts.',
  '/marketing-destaques': 'Destaques fixos do perfil.',
  '/marketing-contas': 'Contas das redes conectadas ao painel.',
  '/conteudo': 'Modelos de treino que o app oferece.',
  '/biblioteca': 'Catálogo de exercícios e suas informações.',
  '/alimentos': 'Alimentos da busca da aba Nutrição, com valores por 100 g.',
  '/provas-corrida': 'Calendário de provas que o EAFIT Run mostra perto de cada pessoa: revise e aprove.',
  '/desafios-run': 'Desafios de km, horas ou corridas para a comunidade do EAFIT Run: crie, acompanhe o ranking e tire quem fraudou.',
  '/demonstracoes': 'Vídeo ou imagem de demonstração de cada exercício.',
  '/ranking-conteudo': 'Quais conteúdos mais funcionam e a qualidade de cada um.',
  '/landing': 'Textos e blocos da página inicial do site.',
  '/configuracoes': 'Recursos ligados ou desligados, versão mínima, manutenção e temporada.',
  '/experimentos': 'Testes A/B e suas variantes.',
  '/saude': 'Estado do sistema, rotinas automáticas e limpeza de dados antigos.',
  '/custos': 'Gastos com a infraestrutura.',
  '/relatorios': 'Relatórios por e-mail e alertas automáticos.',
  '/auditoria': 'Quem mudou o quê no painel e quando.',
  '/erros': 'Erros que o app registrou nos aparelhos.',
  '/admins': 'Quem acessa o painel e com qual papel.',
  '/exclusoes': 'Contas excluídas e o motivo.',
  '/lgpd': 'Pedidos de dados e exclusão (LGPD).',
  '/termos': 'Versões dos termos e da política de privacidade.',
};

export function hintForPath(pathname) {
  return TAB_HINTS[pathname] || '';
}

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

// Aba (com a seção dona) de uma rota exata; usado pelas telas fixadas.
export function tabByRoute(to) {
  for (const section of ALL_SECTIONS) {
    const tab = section.tabs.find(t => t.to === to);
    if (tab) return { tab, section };
  }
  return null;
}
