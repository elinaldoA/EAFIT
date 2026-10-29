import { t } from '../lib/i18n';

// Medidas caseiras para a busca de alimentos: peso aproximado em gramas de
// cada medida, na linha das tabelas brasileiras de medidas caseiras. Vale para
// os itens próprios e para os da TACO, pelo nome sem acento; a primeira regra
// que casar decide. Sem regra, a pessoa informa em gramas.
const RULES = [
  [/suco/, [[t('copo'), 200]]],
  [/^arroz/, [[t('colher de sopa cheia'), 25], [t('colher de servir'), 45], [t('escumadeira'), 90]]],
  [/^(feijao|lentilha|grao-de-bico|feijoada|baiao)/, [[t('colher de sopa'), 20], [t('concha média'), 140]]],
  [/^macarrao/, [[t('pegador'), 110]]],
  [/^(estrogonofe|prato feito)/, [[t('colher de servir'), 50]]],
  [/^(pao frances|pao, trigo, frances)/, [[t('unidade'), 50]]],
  [/^hamburguer com pao/, [[t('unidade'), 150]]],
  [/^pastel/, [[t('unidade'), 80]]],
  [/^pao.*forma/, [[t('fatia'), 25]]],
  [/^pao,? de queijo/, [[t('unidade pequena'), 20], [t('unidade média'), 40]]],
  [/^crepioca/, [[t('unidade'), 70]]],
  [/^ovo/, [[t('unidade'), 50]]],
  [/desfiad|moid/, [[t('colher de sopa'), 20]]],
  [/^(peito de frango|coxa|frango|carne|alcatra|porco|tilapia|salmao)/, [[t('filé ou bife médio'), 100], [t('pedaço pequeno'), 60]]],
  [/^atum/, [[t('lata, drenada'), 120]]],
  [/^sardinha/, [[t('lata, drenada'), 84]]],
  [/^refrigerante/, [[t('copo'), 200], [t('lata'), 350]]],
  [/^leite (integral|desnatado)|^leite, de (vaca, achocolatado|cabra)/, [[t('copo'), 200], [t('xícara'), 160]]],
  [/^cafe( com|, infusao)/, [[t('xícara de cafezinho'), 50], [t('xícara'), 160]]],
  [/^iogurte/, [[t('pote'), 170]]],
  [/(mucarela|mozarela)/, [[t('fatia'), 15]]],
  [/minas/, [[t('fatia'), 30]]],
  [/(requeijao|cottage)/, [[t('colher de sopa'), 30]]],
  [/^(azeite|oleo)/, [[t('colher de sopa'), 8], [t('colher de chá'), 3]]],
  [/^(manteiga|margarina)/, [[t('colher de chá'), 5]]],
  [/^(aveia|granola|farofa|mandioca, farofa|farinha)/, [[t('colher de sopa'), 15]]],
  [/^whey/, [[t('dose (scoop)'), 30]]],
  [/pasta de amendoim/, [[t('colher de sopa'), 15]]],
  [/^castanha-do-(para|brasil)/, [[t('unidade'), 4]]],
  [/^banana/, [[t('unidade média'), 70]]],
  [/^maca/, [[t('unidade média'), 130]]],
  [/^laranja/, [[t('unidade média'), 140]]],
  [/^mamao/, [[t('fatia média'), 150]]],
  [/^melancia/, [[t('fatia média'), 200]]],
  [/^abacaxi/, [[t('fatia média'), 75]]],
  [/^morango/, [[t('unidade'), 12]]],
  [/^acai.*(tigela|xarope)/, [[t('tigela média'), 300]]],
  [/^tomate($|, com semente)/, [[t('unidade média'), 100], [t('rodela'), 15]]],
  [/^(brocolis|cenoura|abobrinha|beterraba|chuchu|couve)/, [[t('colher de sopa cheia'), 25]]],
  [/^(batata(?!.*frita)|batata-doce|mandioca)/, [[t('colher de sopa cheia'), 30], [t('unidade média'), 140]]],
  [/^acucar/, [[t('colher de chá'), 5], [t('colher de sopa'), 12]]],
  [/^mel($|,)/, [[t('colher de sopa'), 20], [t('colher de chá'), 7]]],
  [/^chocolate/, [[t('quadradinho'), 5], [t('barra pequena'), 25]]],
  [/cream cracker/, [[t('unidade'), 6]]],
  [/^pizza/, [[t('fatia'), 120]]],
];

const plain = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// [{ label, grams }] do alimento, ou [] quando só dá para pesar.
export function measuresFor(name) {
  const n = plain(name || '');
  const rule = RULES.find(([re]) => re.test(n));
  return rule ? rule[1].map(([label, grams]) => ({ label, grams })) : [];
}
