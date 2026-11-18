import { t, lang } from '../lib/i18n';
import { TACO_FOODS } from './tacoFoods';

// Base de alimentos para a busca da aba Nutrição, por 100 g; `portion` é a
// quantidade em gramas que a busca sugere. Não substitui orientação de
// nutricionista.
//
// Cada linha: [ícone, nome, porção, origem]. A origem diz de onde saem os valores:
// - nome da TACO: os valores vêm da tabela, sem número copiado à mão;
// - [[nome da TACO, gramas], ...]: prato montado, calculado pelos ingredientes;
// - [kcal, proteína, carbo, gordura, fibra, sódio]: item que a TACO não tem
//   (valores do USDA FoodData Central ou do rótulo comum do produto).
const RAW = [
  ['🍚', 'Arroz branco cozido', 150, 'Arroz, tipo 1, cozido'],
  ['🍚', 'Arroz integral cozido', 150, 'Arroz, integral, cozido'],
  ['🫘', 'Feijão carioca cozido', 140, 'Feijão, carioca, cozido'],
  ['🫘', 'Feijão preto cozido', 140, 'Feijão, preto, cozido'],
  ['🫘', 'Lentilha cozida', 100, 'Lentilha, cozida'],
  ['🫛', 'Grão-de-bico cozido', 100, [164, 8.9, 27.4, 2.6, 7.6, 7]],
  ['🍝', 'Macarrão cozido', 150, [158, 5.8, 30.9, 0.9, 1.8, 1]],
  ['🥔', 'Batata inglesa cozida', 150, 'Batata, inglesa, cozida'],
  ['🍠', 'Batata-doce cozida', 150, 'Batata, doce, cozida'],
  ['🍠', 'Mandioca cozida', 100, 'Mandioca, cozida'],
  ['🌽', 'Cuscuz de milho', 120, 'Cuscuz, de milho, cozido com sal'],
  ['🫓', 'Tapioca (goma hidratada)', 50, [240, 0, 59, 0, 0, 0]],
  ['🥞', 'Crepioca', 70, [['Ovo, de galinha, inteiro, cru', 50], ['Fécula, de mandioca', 20]]],
  ['🥖', 'Pão francês', 50, 'Pão, trigo, francês'],
  ['🍞', 'Pão de forma integral', 50, 'Pão, trigo, forma, integral'],
  ['🧀', 'Pão de queijo', 40, 'Pão, de queijo, assado'],
  ['🥣', 'Aveia em flocos', 30, 'Aveia, flocos, crua'],
  ['🥣', 'Granola', 30, [420, 9, 66, 14, 7, 30]],
  ['🌽', 'Milho cozido', 100, [96, 3.4, 21, 1.5, 2.4, 1]],
  ['🍗', 'Peito de frango grelhado', 120, 'Frango, peito, sem pele, grelhado'],
  ['🍗', 'Frango desfiado (peito cozido)', 100, 'Frango, peito, sem pele, cozido'],
  ['🍗', 'Coxa de frango assada', 100, 'Frango, coxa, com pele, assada'],
  ['🥩', 'Carne bovina (patinho) grelhada', 120, 'Carne, bovina, patinho, sem gordura, grelhado'],
  ['🥩', 'Carne moída refogada', 100, 'Carne, bovina, acém, moído, cozido'],
  ['🥩', 'Alcatra grelhada', 120, [241, 31, 0, 12, 0, 60]],
  ['🥓', 'Carne de porco (lombo) assada', 100, 'Porco, lombo, assado'],
  ['🐟', 'Tilápia grelhada', 120, [128, 26.2, 0, 2.7, 0, 56]],
  ['🐟', 'Salmão grelhado', 120, 'Salmão, sem pele, fresco, grelhado'],
  ['🐟', 'Atum em lata (natural)', 120, [116, 25.5, 0, 0.8, 0, 247]],
  ['🐟', 'Sardinha em lata (óleo)', 84, 'Sardinha, conserva em óleo'],
  ['🥚', 'Ovo cozido', 50, 'Ovo, de galinha, inteiro, cozido/10minutos'],
  ['🍳', 'Ovo frito', 50, 'Ovo, de galinha, inteiro, frito'],
  ['🍳', 'Ovo mexido', 100, [149, 10, 1.6, 11, 0, 145]],
  ['🥛', 'Leite integral', 200, [61, 3.2, 4.8, 3.3, 0, 43]],
  ['🥛', 'Leite desnatado', 200, [34, 3.4, 5, 0.1, 0, 42]],
  ['🥛', 'Iogurte natural', 170, 'Iogurte, natural'],
  ['🥛', 'Iogurte grego natural', 170, [97, 9, 4, 5, 0, 35]],
  ['🧀', 'Queijo minas frescal', 30, 'Queijo, minas, frescal'],
  ['🧀', 'Queijo muçarela', 30, 'Queijo, mozarela'],
  ['🧀', 'Queijo cottage', 100, [98, 11.1, 3.4, 4.3, 0, 364]],
  ['🧈', 'Requeijão cremoso', 30, 'Queijo, requeijão, cremoso'],
  ['🧈', 'Manteiga', 10, 'Manteiga, com sal'],
  ['🥤', 'Whey protein (pó)', 30, [400, 80, 8, 6, 0, 250]],
  ['🌱', 'Tofu', 100, [76, 8.1, 1.9, 4.8, 0.3, 7]],
  ['🥬', 'Alface', 30, 'Alface, crespa, crua'],
  ['🍅', 'Tomate', 100, 'Tomate, com semente, cru'],
  ['🥕', 'Cenoura cozida', 80, 'Cenoura, cozida'],
  ['🥦', 'Brócolis cozido', 100, 'Brócolis, cozido'],
  ['🥒', 'Abobrinha cozida', 100, 'Abobrinha, italiana, cozida'],
  ['🥬', 'Couve refogada', 80, 'Couve, manteiga, refogada'],
  ['🍌', 'Banana prata', 70, 'Banana, prata, crua'],
  ['🍎', 'Maçã', 130, 'Maçã, Fuji, com casca, crua'],
  ['🍊', 'Laranja', 140, 'Laranja, pêra, crua'],
  ['🥭', 'Manga', 150, 'Manga, Tommy Atkins, crua'],
  ['🍉', 'Melancia', 200, 'Melancia, crua'],
  ['🍇', 'Uva', 100, 'Uva, Itália, crua'],
  ['🍓', 'Morango', 100, 'Morango, cru'],
  ['🍍', 'Abacaxi', 100, 'Abacaxi, cru'],
  ['🍈', 'Mamão', 150, 'Mamão, Papaia, cru'],
  ['🥑', 'Abacate', 80, 'Abacate, cru'],
  ['🍇', 'Açaí na tigela (com xarope de guaraná)', 300, 'Açaí, polpa, com xarope de guaraná e glucose'],
  ['🍇', 'Açaí (polpa pura)', 100, 'Açaí, polpa, congelada'],
  ['🥜', 'Amendoim', 30, 'Amendoim, torrado, salgado'],
  ['🥜', 'Pasta de amendoim', 15, [588, 25, 20, 50, 6, 17]],
  ['🌰', 'Castanha-do-pará', 15, 'Castanha-do-Brasil, crua'],
  ['🫒', 'Azeite de oliva', 8, 'Azeite, de oliva, extra virgem'],
  ['🍯', 'Mel', 20, 'Mel, de abelha'],
  ['🍫', 'Chocolate ao leite', 25, 'Chocolate, ao leite'],
  ['🍪', 'Biscoito cream cracker', 30, 'Biscoito, salgado, cream cracker'],
  ['☕', 'Café com açúcar', 100, [['Café, infusão 10%', 100], ['Açúcar, refinado', 5]]],
  ['🧃', 'Suco de laranja', 200, 'Laranja, pêra, suco'],
  ['🥤', 'Refrigerante', 350, 'Refrigerante, tipo cola'],
  ['🍛', 'Prato feito (arroz, feijão, carne e salada)', 410, [
    ['Arroz, tipo 1, cozido', 150], ['Feijão, carioca, cozido', 100], ['Carne, bovina, acém, moído, cozido', 100],
    ['Alface, crespa, crua', 30], ['Tomate, com semente, cru', 30],
  ]],
  ['🍲', 'Feijoada', 200, 'Feijoada'],
  ['🍲', 'Estrogonofe de frango', 150, 'Estrogonofe de frango'],
  ['🍲', 'Estrogonofe de carne', 150, 'Estrogonofe de carne'],
  ['🍛', 'Baião de dois', 150, 'Baião de dois, arroz e feijão-de-corda'],
  ['🥄', 'Farofa', 30, 'Mandioca, farofa, temperada'],
  ['🍟', 'Batata frita', 100, 'Batata, inglesa, frita'],
  ['🍕', 'Pizza (muçarela)', 120, [266, 11.4, 33.3, 9.7, 2.3, 598]],
  ['🍔', 'Hambúrguer com pão', 150, [['Hambúrguer, bovino, grelhado', 90], ['Pão, trigo, francês', 60]]],
  ['🥟', 'Pastel de carne frito', 80, 'Pastel, de carne, frito'],
  // Segunda leva: só alimentos que nem a lista acima nem a TACO têm.
  ['🌾', 'Quinoa cozida', 100, [120, 4.4, 21.3, 1.9, 2.8, 7]],
  ['🍚', 'Arroz parboilizado cozido', 150, [123, 2.9, 26, 0.4, 0.9, 2]],
  ['🍝', 'Macarrão integral cozido', 150, [149, 6, 30.1, 1.7, 3.9, 4]],
  ['🌾', 'Cuscuz marroquino cozido', 120, [112, 3.8, 23.2, 0.2, 1.4, 5]],
  ['🍠', 'Inhame cozido', 100, [142, 0.5, 34.6, 0.1, 5.1, 15]],
  ['🥔', 'Purê de batata', 150, [113, 1.9, 16.8, 4.2, 1.5, 333]],
  ['🍞', 'Pão de forma tradicional', 50, [266, 7.6, 50.6, 3.3, 2.4, 490]],
  ['🫓', 'Pão sírio', 60, [275, 9.1, 55.7, 1.2, 2.2, 536]],
  ['🌯', 'Tortilha de trigo (wrap)', 40, [306, 8.2, 50.3, 8, 3.5, 746]],
  ['🍔', 'Pão de hambúrguer', 50, [279, 9.5, 49.6, 4.3, 2, 465]],
  ['🥖', 'Bisnaguinha', 40, [300, 8.5, 54, 5.5, 2.5, 380]],
  ['🍘', 'Biscoito de arroz', 20, [387, 8.2, 81.5, 2.8, 4.2, 29]],
  ['🍫', 'Barra de cereal', 25, [360, 5, 68, 8, 4, 120]],
  ['🍫', 'Barra de proteína', 45, [370, 30, 38, 12, 8, 250]],
  ['🦃', 'Peito de peru fatiado', 30, [103, 17, 2.6, 2.6, 0, 1000]],
  ['🥓', 'Bacon frito', 15, [541, 37, 1.4, 42, 0, 1717]],
  ['🌭', 'Salsicha', 50, [230, 12, 4.8, 18, 0, 1120]],
  ['🍗', 'Nuggets de frango', 100, [263, 14, 17, 15, 1, 550]],
  ['🧀', 'Queijo coalho', 40, [317, 23, 1.7, 24, 0, 600]],
  ['🧀', 'Cream cheese', 30, [350, 6.2, 5.5, 34, 0, 314]],
  ['🥛', 'Iogurte proteico (sem açúcar)', 170, [60, 9, 5, 0.5, 0, 50]],
  ['🥛', 'Kefir', 200, [41, 3.8, 4.5, 0.9, 0, 40]],
  ['🥛', 'Leite semidesnatado', 200, [46, 3.2, 4.8, 1.5, 0, 45]],
  ['🥛', 'Bebida de amêndoas (sem açúcar)', 200, [15, 0.6, 0.3, 1.2, 0.2, 63]],
  ['🌱', 'Proteína de soja texturizada (seca)', 30, [333, 50, 30, 1, 12.7, 10]],
  ['🫘', 'Soja cozida', 100, [172, 18.2, 8.4, 9, 6, 1]],
  ['🫘', 'Feijão branco cozido', 140, [139, 9.7, 25.1, 0.4, 6.3, 6]],
  ['🫛', 'Edamame', 100, [121, 11.9, 8.9, 5.2, 5.2, 6]],
  ['🍄', 'Cogumelo champignon', 50, [22, 3.1, 3.3, 0.3, 1, 5]],
  ['🌿', 'Aspargos cozidos', 80, [22, 2.4, 4.1, 0.2, 2, 14]],
  ['🫚', 'Gengibre', 5, [80, 1.8, 17.8, 0.8, 2, 13]],
  ['🫐', 'Mirtilo (blueberry)', 100, [57, 0.7, 14.5, 0.3, 2.4, 1]],
  ['🍓', 'Framboesa', 100, [52, 1.2, 11.9, 0.7, 6.5, 1]],
  ['🫐', 'Amora', 100, [43, 1.4, 9.6, 0.5, 5.3, 1]],
  ['🍒', 'Cereja', 100, [63, 1.1, 16, 0.2, 2.1, 0]],
  ['🍒', 'Lichia', 100, [66, 0.8, 16.5, 0.4, 1.3, 1]],
  ['🍇', 'Uva-passa', 30, [299, 3.1, 79.2, 0.5, 3.7, 11]],
  ['🌴', 'Tâmara', 30, [277, 1.8, 75, 0.2, 6.7, 1]],
  ['🍑', 'Damasco seco', 30, [241, 3.4, 62.6, 0.5, 7.3, 10]],
  ['🍑', 'Ameixa seca', 30, [240, 2.2, 63.9, 0.4, 7.1, 2]],
  ['🍒', 'Cranberry desidratado', 30, [308, 0.2, 82.4, 1.1, 5.3, 5]],
  ['🥜', 'Pistache', 30, [560, 20.2, 27.2, 45.3, 10.6, 1]],
  ['🌰', 'Macadâmia', 30, [718, 7.9, 13.8, 75.8, 8.6, 5]],
  ['🌰', 'Avelã', 30, [628, 15, 16.7, 60.8, 9.7, 0]],
  ['🎃', 'Semente de abóbora', 15, [559, 30.2, 10.7, 49.1, 6, 7]],
  ['🌻', 'Semente de girassol', 15, [584, 20.8, 20, 51.5, 8.6, 9]],
  ['🌱', 'Chia', 15, [486, 16.5, 42.1, 30.7, 34.4, 16]],
  ['🥄', 'Tahine', 15, [595, 17, 21.2, 53.8, 9.3, 115]],
  ['🫘', 'Homus', 30, [166, 7.9, 14.3, 9.6, 6, 379]],
  ['🥥', 'Óleo de coco', 8, [892, 0, 0, 99.1, 0, 0]],
  ['🧈', 'Ghee', 10, [876, 0.3, 0, 99.5, 0, 2]],
  ['🍅', 'Ketchup', 15, [101, 1, 27.4, 0.1, 0.3, 907]],
  ['🌭', 'Mostarda', 10, [60, 3.7, 5.8, 3.3, 4, 1104]],
  ['🍨', 'Sorvete de creme', 100, [207, 3.5, 23.6, 11, 0.7, 80]],
  ['🍫', 'Chocolate 70% cacau', 25, [598, 7.8, 45.9, 42.6, 10.9, 20]],
  ['🍬', 'Brigadeiro', 20, [440, 6, 70, 15, 1, 120]],
  ['🥫', 'Energético', 250, [45, 0, 11, 0, 0, 40]],
  ['🥤', 'Refrigerante zero', 350, [0, 0, 0, 0, 0, 12]],
  ['☕', 'Café com leite (sem açúcar)', 160, [31, 1.6, 2.4, 1.7, 0, 22]],
  ['🥞', 'Panqueca de banana com aveia', 140, [
    ['Ovo, de galinha, inteiro, cru', 50], ['Banana, prata, crua', 70], ['Aveia, flocos, crua', 20],
  ]],
  ['🍳', 'Omelete simples (2 ovos)', 103, [['Ovo, de galinha, inteiro, cru', 100], ['Óleo, de soja', 3]]],
  ['🥖', 'Pão francês com manteiga', 60, [['Pão, trigo, francês', 50], ['Manteiga, com sal', 10]]],
  ['🥖', 'Pão com ovo', 100, [['Pão, trigo, francês', 50], ['Ovo, de galinha, inteiro, frito', 50]]],
  ['🥪', 'Misto quente', 95, [
    ['Pão, trigo, forma, integral', 50], ['Presunto, sem capa de gordura', 20], ['Queijo, mozarela', 20], ['Manteiga, com sal', 5],
  ]],
  ['🥪', 'Sanduíche natural de frango', 145, [
    ['Pão, trigo, forma, integral', 50], ['Frango, peito, sem pele, cozido', 50], ['Queijo, requeijão, cremoso', 15],
    ['Alface, crespa, crua', 10], ['Tomate, com semente, cru', 20],
  ]],
  ['🌽', 'Cuscuz com ovo', 170, [['Cuscuz, de milho, cozido com sal', 120], ['Ovo, de galinha, inteiro, frito', 50]]],
  ['🍱', 'Marmita fit (frango, batata-doce e brócolis)', 350, [
    ['Frango, peito, sem pele, grelhado', 120], ['Batata, doce, cozida', 150], ['Brócolis, cozido', 80],
  ]],
  ['🥗', 'Salada de frutas', 200, [
    ['Banana, prata, crua', 50], ['Maçã, Fuji, com casca, crua', 50], ['Mamão, Papaia, cru', 50], ['Laranja, pêra, crua', 50],
  ]],
  // Terceira leva, com a mesma regra.
  ['🌾', 'Triguilho (bulgur) cozido', 100, [83, 3.1, 18.6, 0.2, 4.5, 5]],
  ['🍜', 'Macarrão de arroz cozido', 150, [108, 1.8, 24, 0.2, 1, 19]],
  ['🥐', 'Croissant', 60, [406, 8.2, 45.8, 21, 2.6, 467]],
  ['🥞', 'Panqueca simples', 80, [227, 6.4, 28.3, 9.7, 0.9, 439]],
  ['🥣', 'Cereal matinal de chocolate', 30, [387, 7, 80, 4.7, 5, 180]],
  ['🐑', 'Pernil de cordeiro assado', 100, [258, 25.6, 0, 16.5, 0, 66]],
  ['🍗', 'Moela de frango cozida', 100, [154, 30.4, 0, 2.7, 0, 56]],
  ['🐟', 'Truta grelhada', 120, [168, 23.8, 0, 7.4, 0, 61]],
  ['🐟', 'Salmão defumado', 50, [117, 18.3, 0, 4.3, 0, 2000]],
  ['🐙', 'Polvo cozido', 100, [164, 29.8, 4.4, 2.1, 0, 460]],
  ['🦪', 'Mexilhão cozido', 100, [172, 23.8, 7.4, 4.5, 0, 369]],
  ['🦪', 'Ostra crua', 50, [81, 9.5, 5, 2.3, 0, 106]],
  ['🦀', 'Kani (surimi)', 50, [95, 7.6, 15, 0.5, 0.5, 530]],
  ['🧀', 'Queijo gorgonzola', 30, [353, 21.4, 2.3, 28.7, 0, 1146]],
  ['🧀', 'Queijo brie', 30, [334, 20.8, 0.5, 27.7, 0, 629]],
  ['🧀', 'Queijo provolone', 30, [351, 25.6, 2.1, 26.6, 0, 876]],
  ['🧀', 'Queijo de cabra', 30, [268, 18.5, 0.9, 21.1, 0, 459]],
  ['🌱', 'Tempeh', 100, [192, 20.3, 7.6, 10.8, 0, 9]],
  ['🫘', 'Feijão-azuki cozido', 140, [128, 7.5, 24.8, 0.1, 7.3, 8]],
  ['🥬', 'Couve-de-bruxelas cozida', 80, [36, 2.6, 7.1, 0.5, 2.6, 21]],
  ['🌿', 'Alcachofra cozida', 100, [53, 2.9, 11.4, 0.3, 8.6, 60]],
  ['🍄', 'Shiitake cozido', 50, [56, 1.6, 14.4, 0.2, 2.1, 4]],
  ['🍅', 'Tomate seco (sem óleo)', 20, [258, 14.1, 55.8, 3, 12.3, 107]],
  ['🥒', 'Picles de pepino', 30, [12, 0.5, 2.4, 0.2, 1, 809]],
  ['🍑', 'Nectarina', 140, [44, 1.1, 10.6, 0.3, 1.7, 0]],
  ['🥥', 'Coco ralado seco (sem açúcar)', 15, [660, 6.9, 23.7, 64.5, 16.3, 37]],
  ['🍌', 'Banana-passa', 30, [346, 3.9, 88.3, 1.8, 9.9, 3]],
  ['🌰', 'Noz-pecã', 30, [691, 9.2, 13.9, 72, 9.6, 0]],
  ['🥜', 'Pasta de amêndoa', 15, [614, 21, 18.8, 55.5, 10.3, 7]],
  ['🥜', 'Amendoim japonês', 30, [500, 16, 47, 28, 3, 370]],
  ['🐖', 'Banha de porco', 10, [902, 0, 0, 100, 0, 0]],
  ['🍖', 'Molho barbecue', 15, [172, 0.8, 40.8, 0.6, 0.9, 1027]],
  ['🥢', 'Molho teriyaki', 15, [89, 5.9, 15.6, 0, 0.1, 3833]],
  ['🍓', 'Geleia de morango', 20, [278, 0.4, 68.9, 0.1, 1.1, 32]],
  ['🌰', 'Creme de avelã com cacau', 20, [539, 6.3, 57.5, 30.9, 3.4, 41]],
  ['🥔', 'Batata palha', 25, [540, 6, 52, 35, 4, 400]],
  ['🍪', 'Cookies de chocolate', 30, [488, 4.9, 65, 24, 2.4, 351]],
  ['🍩', 'Donut', 60, [421, 5.7, 51, 22.9, 1.4, 316]],
  ['🍫', 'Chocolate branco', 25, [539, 5.9, 59.2, 32.1, 0.2, 90]],
  ['🍵', 'Chá verde (sem açúcar)', 200, [1, 0.2, 0, 0, 0, 1]],
  ['🍺', 'Cerveja sem álcool', 350, [37, 0.2, 8, 0, 0, 4]],
  ['🍛', 'Arroz com feijão', 180, [['Arroz, tipo 1, cozido', 100], ['Feijão, carioca, cozido', 80]]],
  ['🥩', 'Bife acebolado', 133, [
    ['Carne, bovina, contra-filé, sem gordura, grelhado', 100], ['Cebola, crua', 30], ['Óleo, de soja', 3],
  ]],
  ['🍲', 'Escondidinho de carne seca', 230, [
    ['Mandioca, cozida', 150], ['Carne, bovina, seca, cozida', 60], ['Queijo, mozarela', 20],
  ]],
  ['🍔', 'X-burguer', 170, [['Hambúrguer, bovino, grelhado', 90], ['Pão, trigo, francês', 60], ['Queijo, mozarela', 20]]],
  ['🥪', 'Sanduíche de atum', 110, [
    ['Pão, trigo, forma, integral', 50], ['Atum, conserva em óleo', 40], ['Maionese, tradicional com ovos', 10],
    ['Alface, crespa, crua', 10],
  ]],
  ['🥗', 'Salada de alface e tomate com azeite', 105, [
    ['Alface, crespa, crua', 50], ['Tomate, com semente, cru', 50], ['Azeite, de oliva, extra virgem', 5],
  ]],
  ['🍅', 'Vinagrete', 30, [
    ['Tomate, com semente, cru', 50], ['Cebola, crua', 25], ['Pimentão, verde, cru', 15], ['Azeite, de oliva, extra virgem', 5],
  ]],
  ['🥣', 'Bowl de iogurte, aveia e banana', 260, [
    ['Iogurte, natural', 170], ['Aveia, flocos, crua', 20], ['Banana, prata, crua', 70],
  ]],
  ['🍣', 'Poke de salmão', 300, [
    ['Arroz, tipo 1, cozido', 120], ['Salmão, sem pele, fresco, cru', 100], ['Pepino, cru', 30],
    ['Manga, Tommy Atkins, crua', 40], ['Shoyu', 10],
  ]],
  ['🍣', 'Sushi (niguiri de salmão)', 30, [['Arroz, tipo 1, cozido', 20], ['Salmão, sem pele, fresco, cru', 10]]],
  // Quarta leva, com a mesma regra.
  ['🥩', 'Picanha grelhada', 120, 'Carne, bovina, picanha, com gordura, grelhada'],
  ['🌭', 'Linguiça toscana grelhada', 80, [296, 16, 1, 25, 0, 800]],
  ['🥓', 'Lombo canadense fatiado', 30, [110, 18, 1, 3.5, 0, 900]],
  ['🥚', 'Ovo de codorna cozido', 10, [158, 13, 0.4, 11, 0, 141]],
  ['🍗', 'Frango à parmegiana', 150, [230, 18, 12, 12, 1, 500]],
  ['🥟', 'Esfiha de carne', 80, [260, 10, 32, 10, 1.5, 450]],
  ['🍚', 'Risoto de frango', 200, [150, 6, 22, 4, 0.5, 350]],
  ['🍲', 'Moqueca de peixe', 200, [110, 12, 3, 5.5, 0.5, 300]],
  ['🥣', 'Sopa de legumes', 300, [40, 1.5, 7, 0.6, 1.5, 250]],
  ['🫓', 'Tapioca com queijo', 80, [274, 8.5, 38.6, 9.4, 0, 225]],
  ['🥖', 'Pão de alho', 50, [350, 7, 42, 17, 2, 600]],
  ['🍞', 'Panetone', 60, [350, 7, 55, 11, 2, 200]],
  ['🍮', 'Pudim de leite', 100, [190, 5, 30, 5.5, 0, 90]],
  ['🍧', 'Picolé de frutas', 60, [70, 0.3, 17, 0, 0, 5]],
  ['🥑', 'Guacamole', 30, [160, 2, 8.5, 14.7, 6.7, 200]],
  ['🌿', 'Molho pesto', 15, [460, 5, 5, 47, 1, 700]],
  ['🥛', 'Leite em pó integral', 15, [500, 26, 38, 27, 0, 370]],
  ['🥛', 'Bebida de soja (sem açúcar)', 200, [33, 2.8, 1.7, 1.8, 0.4, 50]],
  ['🥛', 'Bebida de aveia', 200, [45, 1, 6.5, 1.5, 0.8, 40]],
  ['🍵', 'Kombucha', 200, [13, 0, 3, 0, 0, 10]],
  ['🍇', 'Goji berry', 15, [349, 14, 77, 0.4, 13, 298]],
  ['🍑', 'Figo seco', 30, [249, 3.3, 64, 0.9, 9.8, 10]],
  ['🐉', 'Pitaya', 100, [60, 1.2, 13, 0, 3, 0]],
  ['🥤', 'Isolado de whey (pó)', 30, [370, 88, 2, 1, 0, 150]],
  ['🥤', 'Caseína (pó)', 30, [370, 78, 6, 2, 0, 100]],
  ['🥤', 'Albumina (pó)', 30, [380, 80, 6, 1, 0, 1200]],
  ['🥤', 'Proteína vegetal (pó)', 30, [380, 80, 5, 6, 2, 900]],
  ['🥤', 'Colágeno hidrolisado (pó)', 10, [360, 90, 0, 0, 0, 300]],
  ['🥤', 'Hipercalórico (pó)', 100, [380, 15, 75, 2, 1, 200]],
  ['🥤', 'Maltodextrina', 30, [380, 0, 95, 0, 0, 10]],
  ['💊', 'Creatina (pó)', 5, [0, 0, 0, 0, 0, 0]],
  // Quinta leva, com a mesma regra.
  ['🍗', 'Frango xadrez', 150, [140, 14, 8, 6, 1, 450]],
  ['🍝', 'Espaguete à bolonhesa', 200, [135, 6.5, 17, 4.5, 1.5, 350]],
  ['🥩', 'Carne de panela', 100, [190, 26, 2, 8.5, 0.3, 300]],
  ['🍛', 'Galinhada', 200, [140, 11, 17, 3.5, 0.8, 350]],
  ['🍤', 'Bobó de camarão', 200, [140, 8, 10, 8, 1, 350]],
  ['🫘', 'Tutu de feijão', 100, [130, 6, 14, 5.5, 4, 300]],
  ['🍚', 'Arroz à grega', 150, [140, 3, 24, 3.5, 1.5, 300]],
  ['🥔', 'Batata rústica assada', 150, [130, 2.5, 22, 4, 2.5, 200]],
  ['🥕', 'Legumes assados', 150, [70, 1.5, 10, 3, 3, 100]],
  ['🥔', 'Maionese de batata', 100, [190, 2, 16, 13, 1.3, 320]],
  ['🌭', 'Cachorro-quente', 150, [250, 10, 24, 13, 1.3, 700]],
  ['🌯', 'Wrap de frango', 150, [180, 12, 22, 5, 2, 450]],
  ['🧇', 'Waffle', 75, [291, 7.9, 33, 14, 1.5, 511]],
  ['🥤', 'Smoothie de frutas', 300, [55, 0.8, 13, 0.2, 1.2, 5]],
  ['☕', 'Chocolate quente', 200, [89, 3.3, 13, 2.8, 0.5, 50]],
  ['🥔', 'Batata chips', 25, [536, 7, 53, 34, 4, 525]],
  ['🍪', 'Biscoito recheado de chocolate', 30, [480, 5, 68, 21, 2, 230]],
  ['🍬', 'Bombom', 15, [490, 5, 55, 28, 1, 50]],
  ['🍨', 'Sorvete de chocolate', 100, [216, 3.8, 28, 11, 1.2, 76]],
  ['🍫', 'Brownie', 60, [466, 5, 55, 26, 3, 230]],
  ['🥖', 'Churros', 50, [447, 5, 50, 25, 1, 300]],
  ['🍰', 'Cheesecake', 100, [321, 5.5, 26, 23, 0.4, 340]],
  ['🥜', 'Mix de castanhas', 30, [607, 17, 21, 51, 7, 10]],
  ['🥭', 'Manga desidratada', 30, [319, 2.5, 78, 1.2, 2.4, 162]],
  ['🫒', 'Kimchi', 50, [15, 1.1, 2.4, 0.5, 1.6, 498]],
  ['🥬', 'Chucrute', 50, [19, 0.9, 4.3, 0.1, 2.9, 661]],
  ['🧆', 'Falafel', 50, [333, 13.3, 31.8, 17.8, 4.9, 294]],
  ['🌱', 'Seitan', 100, [370, 75, 14, 2, 0.6, 29]],
  ['🥛', 'Skyr', 150, [63, 11, 4, 0.2, 0, 50]],
  ['🧀', 'Queijo mascarpone', 30, [429, 4.6, 3.6, 44, 0, 40]],
  ['🧀', 'Queijo feta', 30, [264, 14, 4.1, 21, 0, 917]],
  ['🧀', 'Queijo emmental', 30, [380, 28, 1.5, 29, 0, 450]],
  ['🥤', 'Bebida proteica pronta', 250, [45, 8, 3, 0.5, 0, 60]],
  ['🍬', 'Gel de carboidrato', 32, [250, 0, 62, 0, 0, 150]],
  ['🌰', 'Farinha de amêndoa', 15, [590, 21, 20, 53, 10, 1]],
  ['🫘', 'Farinha de grão-de-bico', 15, [387, 22, 58, 6.7, 11, 64]],
];

const NUTRIENTS = ['kcal', 'g', 'carbs', 'fat', 'fiber', 'sodium'];
const TACO_BY_NAME = new Map(TACO_FOODS.map(f => [f.name, f]));
const r1 = n => Math.round(n * 10) / 10;

// Valores por 100 g de um alimento da TACO, pelo nome exato da tabela.
export function fromTaco(name) {
  const f = TACO_BY_NAME.get(name);
  if (!f) throw new Error(`TACO sem "${name}"`);
  return Object.fromEntries(NUTRIENTS.map(k => [k, f[k]]));
}

// Prato montado: soma os ingredientes e devolve por 100 g do prato pronto.
function mix(parts) {
  const total = parts.reduce((s, [, grams]) => s + grams, 0);
  const sum = Object.fromEntries(NUTRIENTS.map(k => [k, 0]));
  for (const [name, grams] of parts) {
    const f = fromTaco(name);
    for (const k of NUTRIENTS) sum[k] += (f[k] * grams) / 100;
  }
  const out = Object.fromEntries(NUTRIENTS.map(k => [k, r1((sum[k] / total) * 100)]));
  return { ...out, kcal: Math.round(out.kcal), sodium: Math.round(out.sodium) };
}

function valuesOf(source) {
  if (typeof source === 'string') return fromTaco(source);
  if (Array.isArray(source[0])) return mix(source);
  return Object.fromEntries(NUTRIENTS.map((k, i) => [k, source[i]]));
}

// `ptName`: o nome original, que as medidas caseiras usam com o app em inglês.
// `estimated`: prato montado por ingredientes, valor aproximado.
export const FOOD_DATABASE = RAW.map(([icon, name, portion, source], i) => ({
  id: `db${i}`, icon, name: t(name), ptName: name, ...valuesOf(source), portion, ...(Array.isArray(source[0]) && { estimated: true }),
}));

const plain = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Base da busca: os itens acima (nomes simples, traduzidos) e a Tabela TACO completa.
export const ALL_FOODS = [...FOOD_DATABASE, ...TACO_FOODS];

// Sinônimos e grafias comuns: a palavra digitada vale também pelas alternativas.
const SYNONYMS = {
  macaxeira: ['mandioca'], aipim: ['mandioca'], castelinha: ['mandioca'],
  bolacha: ['biscoito'], refri: ['refrigerante'], mussarela: ['mucarela', 'mozarela'],
  mucarela: ['mozarela'], mozarela: ['mucarela'], mozzarella: ['mucarela', 'mozarela'],
  yogurt: ['iogurte'], iogurt: ['iogurte'], hamburger: ['hamburguer'], hamburguer: ['hamburger'],
  fecula: ['polvilho'], batatinha: ['batata'],
};

// Distância de edição, cortada: só interessa saber se é pequena.
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      low = Math.min(low, cur[j]);
    }
    if (low > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const TOKENS = new WeakMap();
const tokensOf = f => {
  let t = TOKENS.get(f);
  if (!t) { t = plain(f.name).split(/[^a-z0-9]+/).filter(w => w.length >= 3); TOKENS.set(f, t); }
  return t;
};

// Palavra com erro de digitação: perto de alguma palavra do nome (1 letra de
// diferença até 6 letras, 2 a partir de 7), inclusive pelo começo dela.
function fuzzyHit(word, f) {
  if (word.length < 4) return false;
  const max = word.length >= 7 ? 2 : 1;
  return tokensOf(f).some(tok => editDistance(word, tok, max) <= max || (tok.length > word.length && editDistance(word, tok.slice(0, word.length), max) <= max));
}

// Alimento do catálogo do painel (tabela food_catalog), no formato da busca.
export function foodFromCatalog(r) {
  return {
    id: `cat${r.id}`, icon: r.icon || '🍽️', name: (lang === 'en' && r.name_en) || r.name, ptName: r.name, source: 'catalog',
    kcal: Number(r.kcal) || 0, g: Number(r.protein_g) || 0, carbs: Number(r.carbs_g) || 0, fat: Number(r.fat_g) || 0,
    fiber: Number(r.fiber_g) || 0, sodium: Number(r.sodium_mg) || 0,
    portion: Number(r.portion_g) || 100, estimated: !!r.estimated,
    ...(r.sugar_g != null && { sugar: Number(r.sugar_g) }),
    ...(r.sat_fat_g != null && { satFat: Number(r.sat_fat_g) }),
    ...(Array.isArray(r.measures) && r.measures.length && { measures: r.measures }),
  };
}

// Lista da busca com o catálogo do painel: os itens dele vêm junto dos próprios
// do app (antes da TACO) e um item de mesmo nome substitui o do app. A lista do
// app fica como reserva (sem rede, antes do catálogo carregar).
export function foodsWithCatalog(rows) {
  if (!rows?.length) return ALL_FOODS;
  // Item desativado no painel não aparece, mas também tira da lista o de mesmo nome do app.
  const extra = rows.filter(r => r.active !== false).map(foodFromCatalog);
  const names = new Set(rows.flatMap(r => [plain(r.name), r.name_en && plain(r.name_en)]).filter(Boolean));
  return [...extra, ...FOOD_DATABASE.filter(f => !names.has(plain(f.ptName)) && !names.has(plain(f.name))), ...TACO_FOODS];
}

// Todas as palavras digitadas precisam aparecer no nome (sem acento, qualquer
// ordem). Os itens acima vêm antes dos da TACO e, em cada grupo, os que começam
// pela primeira palavra ("feijão" → "Feijão, carioca…" antes de "Acarajé…").
// Item cru vai depois do preparado, a não ser que a busca peça "cru".
// `opts.loose` (a busca da tela): aceita plural ("ovos"), sinônimos ("macaxeira")
// e, sem resultado nenhum, erro de digitação ("frango grelhdo"); `opts.used`
// (nomes sem acento que a pessoa já registrou) sobe os alimentos dela.
export function searchFoods(query, list = ALL_FOODS, limit = 10, opts = {}) {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const wantsRaw = words.some(w => w.startsWith('cru'));
  const used = opts.used;
  const rank = f => (f.source === 'taco' ? 2 : 0) + (plain(f.name).startsWith(words[0]) ? 0 : 1)
    + (!wantsRaw && /\bcrua?\b/.test(plain(f.name)) ? 0.5 : 0)
    + (used?.has(plain(f.name)) ? -1.5 : 0);
  const top = hits => hits
    .map((f, i) => [rank(f), i, f])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .slice(0, limit)
    .map(([, , f]) => f);

  const strict = list.filter(f => words.every(w => plain(f.name).includes(w)));
  if (!opts.loose) return top(strict);

  const alts = w => [w, ...(w.length > 3 && w.endsWith('s') ? [w.slice(0, -1)] : []), ...(SYNONYMS[w] || [])];
  const loose = list.filter(f => {
    const name = plain(f.name);
    return words.every(w => alts(w).some(a => name.includes(a)));
  });
  if (loose.length) return top(loose);
  return top(list.filter(f => words.every(w => alts(w).some(a => plain(f.name).includes(a)) || fuzzyHit(w, f))));
}

// Macros de `grams` gramas de um alimento por 100 g, no formato do registro do
// dia. Fibra e sódio só vêm quando o alimento traz esse dado.
export function portionOf(food, grams) {
  const k = (Number(grams) || 0) / 100;
  return {
    g: Math.round(food.g * k),
    kcal: Math.round(food.kcal * k),
    carbs: Math.round(food.carbs * k),
    fat: Math.round(food.fat * k),
    ...(Number.isFinite(food.fiber) && { fiber: r1(food.fiber * k) }),
    ...(Number.isFinite(food.sodium) && { sodium: Math.round(food.sodium * k) }),
    ...(Number.isFinite(food.sugar) && { sugar: r1(food.sugar * k) }),
    ...(Number.isFinite(food.satFat) && { satFat: r1(food.satFat * k) }),
  };
}
