import { ALL_SECTIONS } from '../components/Layout/nav';
import { isHidden } from './adminAccess';

// Busca rápida (Ctrl+K): acha telas pelo nome, pela seção ou por palavras que
// o admin costuma usar para elas, sem precisar saber em que aba moram.

// Palavras extras por rota — o que alguém digitaria procurando a tela.
const KEYWORDS = {
  '/': 'inicio resumo visao geral kpi',
  '/meu-relatorio': 'resumo semana pessoal',
  '/engajamento': 'ativos retencao risco churn parar dau mau',
  '/analise-planos': 'planos treino ficha',
  '/comportamento': 'site visitas paginas emails sessoes trafego',
  '/campanhas': 'utm marketing anuncio',
  '/bem-estar': 'checkin sono humor energia agua proteina nutricao calorias',
  '/conquistas': 'badges medalhas recordes pr',
  '/users': 'usuarios contas clientes alunos banir email',
  '/personais': 'personal trainer professor',
  '/verificacao-cref': 'cref personal documento aprovar',
  '/embaixadores': 'influenciadores parceiros indicacao codigo',
  '/comissoes': 'pagamento pix repasse',
  '/segmentos': 'publico filtro grupo',
  '/suporte': 'tickets atendimento chamados ajuda',
  '/feedback': 'sugestoes reclamacoes opiniao',
  '/inatividade': 'cancelamento motivo churn parou',
  '/pesquisas': 'nps survey questionario',
  '/contato': 'formulario mensagens site',
  '/seguranca': 'dor lesao machucado',
  '/desafios': 'challenge competicao',
  '/ligas': 'ranking temporada divisao',
  '/amigos': 'social feed posts',
  '/moderacao': 'denuncias conteudo abuso',
  '/notificacoes': 'push broadcast enviar mensagem',
  '/historico-envios': 'push enviados',
  '/resultados-envios': 'push cliques abertura',
  '/automacoes': 'push automatica gatilho',
  '/calendario': 'agenda agendadas editorial',
  '/conteudo': 'templates modelos treino',
  '/biblioteca': 'exercicios',
  '/demonstracoes': 'videos gifs midia exercicio',
  '/ranking-conteudo': 'qualidade avaliacao',
  '/landing': 'site home pagina inicial',
  '/configuracoes': 'flags versao minima settings',
  '/experimentos': 'ab teste variante',
  '/saude': 'status cron jobs funcoes uptime',
  '/custos': 'gastos supabase faturamento',
  '/relatorios': 'digest alertas email semanal',
  '/auditoria': 'log historico quem alterou',
  '/erros': 'bugs crash exceptions',
  '/admins': 'permissoes papeis acesso equipe mfa',
  '/exclusoes': 'deletar apagar conta',
  '/lgpd': 'privacidade dados exportar',
  '/termos': 'politica privacidade juridico',
};

export function normalize(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Todas as telas visíveis para este admin, com o texto já preparado.
export function pageIndex(hidden) {
  return ALL_SECTIONS.flatMap(s => s.tabs
    .filter(t => !isHidden(hidden, t.to))
    .map(t => ({
      to: t.to,
      label: t.label,
      section: s.tabs.length > 1 ? s.label : '',
      icon: s.icon,
      label_n: normalize(t.label),
      extra_n: normalize(`${s.label} ${KEYWORDS[t.to] || ''}`),
    })));
}

// Pontua cada termo digitado: começo do nome > começo de palavra do nome >
// pedaço do nome > seção/sinônimo. Todo termo precisa casar em algum lugar.
function score(page, terms) {
  let total = 0;
  for (const term of terms) {
    const words = page.label_n.split(/\s+/);
    if (page.label_n.startsWith(term)) total += 100;
    else if (words.some(w => w.startsWith(term))) total += 60;
    else if (page.label_n.includes(term)) total += 40;
    else if (page.extra_n.split(/\s+/).some(w => w.startsWith(term))) total += 20;
    else return 0;
  }
  return total;
}

export function searchPages(query, pages, limit = 8) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return pages
    .map(p => ({ page: p, s: score(p, terms) }))
    .filter(r => r.s > 0)
    .sort((a, b) => b.s - a.s || a.page.label.length - b.page.label.length)
    .slice(0, limit)
    .map(r => r.page);
}

// Telas abertas por último (só nesta máquina; sem storage, lista vazia).
const RECENT_KEY = 'quickSearchRecent';
const RECENT_MAX = 5;

export function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecent(to) {
  if (!to || to === '/') return;
  const list = [to, ...readRecent().filter(x => x !== to)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* sem storage: só não lembra */ }
}
