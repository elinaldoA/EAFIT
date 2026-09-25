# EAFIT — Treino

PWA (Progressive Web App) para acompanhamento de treino, hidratação e evolução física, com sincronização em nuvem e uso offline.

🔗 **App em produção:** https://elinaldoa.github.io/EAFIT/
📣 **Landing page:** https://elinaldoa.github.io/EAFIT/landing/

<img src="docs/landing-demo.gif" alt="Demonstração das telas de Treino, Água, Evolução e Perfil do EAFIT" width="280" />

## Funcionalidades

- **Treino semanal** — plano de treino dividido por dia da semana, com séries, repetições, técnica e tempo de descanso por exercício. Marque séries concluídas e registre a carga usada em cada uma.
- **Modo treino ao vivo** — tela cheia com um exercício por vez: séries com campos grandes, descanso embutido (com +15s/pular e alarme), progresso do treino, tela sempre acesa (Wake Lock) e navegação entre exercícios. Abre pelo card "Treino de hoje" ou pelo botão ⚡ de cada dia.
- **Histórico** — calendário mensal dos treinos (concluídos e incompletos), resumo do mês (treinos, tempo, séries, volume) e o detalhe de cada sessão com a comparação de cada exercício contra a última vez que ele foi feito.
- **Demonstração de execução** — botão "▶ Ver execução" na lista de exercícios e no modo ao vivo. 38 exercícios têm vídeo curto real (≈7s, sem áudio, com opção de câmera lenta) do [wger](https://wger.de) (CC BY-SA 4.0, autor Goulart), em `app-react/public/videos/` (mapeamento em `app-react/src/data/exerciseVideos.js`); os demais alternam dois quadros do movimento. Cobre 200 nomes de exercício; os sem equivalente seguro não mostram o botão. Imagens do [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) (domínio público), em `app-react/public/exercicios/`, fora do precache e guardadas em cache após a primeira visualização. Mapeamento em `app-react/src/data/exerciseMedia.js`. O admin pode enviar GIF, imagem ou vídeo próprio (até 15MB) por exercício em **Painel admin → Demonstrações**; a mídia própria substitui a padrão no app (tabela `exercise_media` + bucket público `exercise-media`).
- **Hidratação** — meta diária de água calculada a partir do peso, anel de progresso do dia, adições rápidas (copo, caneca, garrafa, squeeze) com desfazer, média dos últimos 7 dias, sequência de dias na meta, barras dos últimos 14 dias e lembretes.
- **Evolução** — resumo no topo (treinos em 30 dias, sequência, recordes, conquistas) e abas Treinos, Recordes e Corpo, com:
  - avatar corporal indicando os grupos musculares trabalhados no dia
  - gráfico de volume total por treino
  - heatmap dos últimos 35 dias
  - treinos concluídos por semana
  - evolução de carga por exercício
  - recordes pessoais (PRs)
- **Perfil** — dados corporais (peso, altura), cálculo de IMC, meta principal, estatísticas de frequência e sequência de treinos.
- **Conta e sincronização** — login/cadastro por e-mail, dados salvos na nuvem e sincronizados entre dispositivos.
- **Offline-first** — funciona como PWA instalável, com cache local e atualização automática de versão.
- **Tema claro/escuro** com detecção automática da preferência do sistema.

## Stack

- [React](https://react.dev/) + [Vite](https://vite.dev/)
- Backend como serviço para autenticação e persistência de dados (configurado via variáveis de ambiente, não versionadas)
- `vite-plugin-pwa` para o service worker e manifest do PWA
- Deploy automático no GitHub Pages via GitHub Actions

## Estrutura do repositório

```
.
├── app-react/          # código-fonte do app (React + Vite)
│   ├── public/
│   │   └── landing/      # landing page estática de divulgação (/landing)
│   ├── src/
│   │   ├── components/  # componentes de UI reutilizáveis
│   │   ├── context/      # estado global (auth, tema, toast, treino)
│   │   ├── data/         # dados estáticos do plano de treino
│   │   ├── lib/           # cliente de dados e utilitários
│   │   ├── pages/        # telas do app (Treino, Histórico, Água, Evolução, Perfil)
│   │   └── styles/       # CSS por área, importado em ordem por index.css
│   └── vite.config.js
├── app-admin/          # backoffice (React + Vite), publicado em /admin
├── supabase/
│   ├── functions/       # Edge Functions (Deno); _shared/ tem código + testes
│   └── migrations/      # schema, RLS e RPCs
└── .github/workflows/   # deploy.yml (Pages) e supabase.yml (testes/deploy do backend)
```

## Convenções

- **Nomenclatura**: termos de domínio (treino, carga, dia, foco, água) ficam em
  português; infraestrutura e nomes de código genéricos (`WorkoutContext`,
  `fetchDashboardData`, `useReminders`) ficam em inglês. A mistura é
  intencional, não inconsistência — ao criar algo novo, siga o que já existe
  ao redor do arquivo que você está mexendo.
- **Context**: cada `context/XContext.jsx` exporta só o `XProvider`; o objeto
  de context e o hook (`useX`) ficam em `context/useX.js`. Arquivo `.jsx` que
  exporta componente e não-componente juntos perde o Fast Refresh (o lint
  avisa).
- **Duplicação entre app-react e as Edge Functions (Deno)**: como os dois
  ambientes não compartilham build, algumas lógicas (geração de plano por
  IMC/nível, exclusão de dados do usuário) são portadas manualmente em vez de
  importadas de um pacote comum. Cada arquivo com esse tipo de duplicação
  documenta no topo qual é o "original" e onde fica a cópia — ver
  `app-react/src/data/workoutAdjustments.js` e
  `supabase/functions/_shared/workoutAdjustments.ts` como exemplo (o mesmo vale
  pra `exerciseLibrary.js` ↔ `_shared/exerciseLibrary.ts`). Ao mudar um lado,
  replique no outro — os testes dos dois lados rodam no CI.

## Rodando localmente

```bash
cd app-react
npm install
```

Crie um arquivo `.env` dentro de `app-react/` (não é versionado) com as credenciais do seu próprio projeto de backend — use `app-react/.env.example` como modelo:

```
VITE_SUPABASE_URL=<url do seu projeto>
VITE_SUPABASE_ANON_KEY=<chave publica/anon do seu projeto>
VITE_VAPID_PUBLIC_KEY=<chave publica VAPID, gerada com `npx web-push generate-vapid-keys`>
```

`VITE_VAPID_PUBLIC_KEY` é usada para inscrever o navegador em notificações push (funcionam com o app fechado). Sem ela, o app funciona normalmente, só a inscrição de push falha com "Push não configurado". A chave privada correspondente fica só no backend, como secret `VAPID_PRIVATE_KEY` das Edge Functions `send-reminders` e `send-push` (nunca no frontend).

Edge Functions de push (implantadas pelo workflow `supabase.yml`, ver [Deploy](#deploy)):
- `send-reminders` e `send-scheduled-broadcast` — chamadas só pelo cron (`pg_cron`, a cada minuto); **Verify JWT desativado**, pois não há usuário logado numa chamada interna do cron. Em vez de JWT, só aceitam requisição com o header `x-cron-secret` (valor guardado no Supabase Vault e no secret `CRON_SECRET` das funções — ver `supabase/migrations/20260925010000_cron_secret.sql`). `send-reminders` cobre refeição/água (horário fixo) e as notificações inteligentes: sequência em risco, inatividade, resumo semanal e lembrete de atualizar o peso (segunda de manhã).
- `send-push` — chamada pelo próprio app logo após um evento (novo recorde, conquista desbloqueada); **Verify JWT ativado**, já que o usuário só pode mandar push pra si mesmo (o `user_id` vem do token da sessão, nunca do corpo da requisição).

Depois:

```bash
npm run dev      # ambiente de desenvolvimento
npm run build    # build de produção em app-react/dist
```

## Deploy

O deploy é automático: qualquer push em `main` que altere arquivos dentro de `app-react/` dispara o workflow `.github/workflows/deploy.yml`, que builda o projeto e publica no GitHub Pages.

Backend (Supabase): o workflow `.github/workflows/supabase.yml` roda os testes e a checagem de tipos das Edge Functions em todo push/PR que mexe em `supabase/`. Aplicar migrations e implantar funções em produção é **manual**, em Actions → Supabase → Run workflow (marque "Aplicar migrations" e/ou "Implantar todas as Edge Functions"; migrations rodam antes das funções). Precisa dos secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID` e `SUPABASE_DB_PASSWORD` no repositório. Localmente, `supabase db push` (com o CLI linkado) continua funcionando.

## Antes de abrir pra outras pessoas

O app já suporta múltiplas contas (cadastro por e-mail, RLS isolando os dados de cada
usuário) e tem Termos de Uso + Política de Privacidade em `app-react/public/legal/`
(com checkbox obrigatório no cadastro). Antes de divulgar amplamente, faltam alguns
passos manuais:

- **Revisão jurídica dos textos legais**: `legal/termos.html` e `legal/privacidade.html`
  já têm e-mail de contato e foro preenchidos; falta só `[nome/razão social, CNPJ ou
  CPF]` — preencher e pedir revisão antes de tratar como documento válido.
- **Leaked password protection**: ativar em Authentication → Policies no dashboard do
  Supabase (não dá pra fazer via CLI sem risco de sobrescrever outras configs de Auth).
- **E-mail transacional**: o SMTP embutido do Supabase tem limite baixo de e-mails/hora.
  Se confirmação de cadastro ou reset de senha começarem a falhar silenciosamente com
  mais gente se cadastrando, configurar um provedor próprio (Resend, SES, etc.) em
  Authentication → Email Templates → SMTP.
- **Custo/escala**: checar os limites do plano atual do Supabase (linhas de banco,
  storage de fotos, invocações de Edge Function) antes de divulgar amplamente.
