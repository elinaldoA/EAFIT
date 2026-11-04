import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './season.css'
import App from './App.jsx'

// O GitHub Pages não deixa mandar frame-ancestors/X-Frame-Options (e a CSP
// por <meta> ignora frame-ancestors): sem esta trava, outro site podia abrir
// o painel num iframe invisível e induzir o admin logado a clicar (clickjacking).
// Dentro de um frame, tenta sair dele e não desenha nada.
// Depois de um deploy, a aba aberta ainda aponta para arquivos antigos que não
// existem mais: a tela (carregada sob demanda) ficava em branco. Recarrega uma
// vez para pegar a versão nova (a trava evita laço de recarregamento).
window.addEventListener('vite:preloadError', event => {
  try {
    if (sessionStorage.getItem('admin-preload-reload')) return;
    sessionStorage.setItem('admin-preload-reload', '1');
    event.preventDefault();
    window.location.reload();
  } catch { /* sem sessionStorage: o ErrorBoundary mostra o erro */ }
});

if (window.top !== window.self) {
  try { window.top.location.replace(window.location.href) } catch { /* frame com sandbox */ }
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
