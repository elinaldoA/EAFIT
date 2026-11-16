# EAFIT — app-react

Código-fonte do app. Veja o [README na raiz do repositório](../README.md) para visão geral, funcionalidades, stack e instruções de setup/deploy.

## Testes

- `npm test` — testes de unidade e de componente (Vitest).
- `npm run e2e` — testes no navegador real (Playwright, Chromium), em `e2e/`.

### Testes no navegador (`npm run e2e`)

Rodam contra o **build de produção** (com service worker), gerado em `dist-e2e/` por `npm run e2e:build` — o `dist/` do deploy não é tocado. O Supabase é simulado na rede do navegador (`e2e/support/fakeSupabase.js`): o app usa o host da CSP do `index.html` com uma chave falsa e o Playwright intercepta tudo que vai para ele, então nenhum teste fala com o banco de verdade.

Primeira vez: `npx playwright install chromium`. Para rodar um só: `npx playwright test -g "sinal fraco"`. Se falhar, o relatório fica em `test-results/` (captura de tela e `trace.zip`, que abre com `npx playwright show-trace`).

`e2e/offline-workout.spec.js` cobre o treino sem rede: perder o sinal no meio do treino, reabrir o app offline (service worker), a rede voltando, sinal fraco (servidor que não responde) e a fila subindo com o servidor lento.
