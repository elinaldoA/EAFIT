import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './season.css'
import App from './App.jsx'

// O GitHub Pages não deixa mandar frame-ancestors/X-Frame-Options (e a CSP
// por <meta> ignora frame-ancestors): sem esta trava, outro site podia abrir
// o painel num iframe invisível e induzir o admin logado a clicar (clickjacking).
// Dentro de um frame, tenta sair dele e não desenha nada.
if (window.top !== window.self) {
  try { window.top.location.replace(window.location.href) } catch { /* frame com sandbox */ }
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
