# Ponte do endereço antigo

Conteúdo publicado em `https://elinaldoa.github.io/EAFIT/`, o endereço do app
antes do domínio próprio (`eafit.com.br`). Fica num repositório separado
chamado `EAFIT`, porque é o nome do repositório que define esse caminho no
GitHub Pages; o código do app mora em `eafit-app`, e esta pasta
(`legacy-site/`) é a fonte do que vai publicado lá.

- `sw.js` substitui o service worker do app instalado no endereço antigo, que
  de outro jeito ficaria preso na última versão baixada.
- `index.html` (e `404.html`, cópia idêntica) redireciona o navegador pro
  endereço novo e, no app instalado, mostra como instalar o novo.

Pode ser removido quando ninguém mais abrir o app pelo endereço antigo.
