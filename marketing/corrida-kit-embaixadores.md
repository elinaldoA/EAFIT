# Kit de lançamento: EAFIT Run (corrida)

Para embaixadores e influenciadores. Cada material abaixo vira um item em
**Pessoas → Embaixadores e influenciadores → Material de divulgação** (campo "Texto
pronto"; o link do parceiro entra sozinho no fim). Os arquivos estão em
`app-react/public/landing/img/marketing/`. Também dá para mandar da Biblioteca de mídia do Marketing.

Gerado por `app-admin/scripts/marketing-corrida-launch.mjs`. Só publicar depois de liberar o módulo em
Configurações do app → Módulos.

| Título no painel | Arquivo | Para | Texto pronto |
|---|---|---|---|
| EAFIT Run: chegou (feed) | `corrida-inicio-feed.jpg` | todos | Chegou o EAFIT Run 🏃 Grave a corrida com GPS, veja o mapa e o ritmo e receba aplausos dos amigos. Comece agora: |
| EAFIT Run: chegou (story) | `corrida-inicio-story.jpg` | todos | Corrida com mapa, ritmo e amigos no mesmo app. Toque no link: |
| EAFIT Run: GPS e voz (feed) | `corrida-ao-vivo-feed.jpg` | todos | Corro e o app anota tudo: tempo, distância e ritmo de cada km. Experimente: |
| EAFIT Run: desafios (feed) | `corrida-desafios-feed.jpg` | todos | Todo mês um desafio novo de corrida, com ranking de km entre amigos. Bora? |
| Carrossel: 5 motivos | `corrida-motivos-1.jpg` a `-7.jpg` | todos | 5 motivos para gravar a sua próxima corrida no EAFIT Run. Salve e mande para o seu parceiro de corrida: |
| Carrossel: do zero aos 5 km | `corrida-5k-1.jpg` a `-6.jpg` | todos | Quer começar a correr? Salve estes passos. O programa de 5K do app diz qual corrida fazer em cada dia: |
| Reel: chegou o EAFIT Run | `reel-corrida-lancamento.mp4` | todos | Corrida, mapa e amigos no mesmo app 🏃 |
| Reel: programa de 5K | `reel-corrida-5k.mp4` | todos | Primeiros 5 km sem improviso 👟 O app monta as semanas para você: |
| Reel: desafios entre amigos | `reel-corrida-amigos.mp4` | todos | Com amigo junto fica mais difícil faltar 👊 Chame o seu pelo código: |
| Story: chegou | `story-corrida-lancamento.mp4` | todos | (sem texto; usar o link) |
| Story: ao vivo | `story-corrida-ao-vivo.mp4` | todos | (sem texto; usar o link) |
| Story: desafio do mês | `story-corrida-desafios.mp4` | todos | (sem texto; usar o link) |

Os carrosséis têm vários arquivos: envie as imagens de cada um num único ZIP (até 50 MB).

## Sugestão de semana de lançamento

1. **Dia 1**: feed "Chegou o EAFIT Run" + story de lançamento + Reel de lançamento.
2. **Dia 2**: carrossel "5 motivos".
3. **Dia 3**: feed "GPS e voz a cada km" + story ao vivo.
4. **Dia 4**: Reel "Programa de 5K".
5. **Dia 5**: carrossel "Do zero aos 5 km".
6. **Dia 6**: feed de desafios + story do desafio do mês.
7. **Dia 7**: Reel "Desafios entre amigos".

A fila do autopost segue esta ordem: `supabase/migrations/20270227010000_marketing_corrida_lancamento.sql.txt`
(renomear para `.sql` e aplicar junto com a liberação do módulo).
