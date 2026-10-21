import './lib/seasonBoot'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { clearChunkReloadFlag, reloadOnceForChunkError } from './lib/chunkReload'
import { installErrorReporter } from './lib/errorReporter'
import { enableTracking, capturePushOpen } from './lib/tracking'
import { captureInstallPrompt } from './lib/installPrompt'
import { capturePushTarget } from './lib/appNav'
import { captureRef } from './lib/ambassadorRef'
import { captureAttribution } from './lib/attribution'
import { capturePersonalInvite } from './lib/trainerInvite'

// Import dinâmico que falha no preload (chunk de uma versão antiga que não
// existe mais depois de um deploy) — recarrega uma vez pra pegar a versão nova.
window.addEventListener('vite:preloadError', event => {
  if (reloadOnceForChunkError()) event.preventDefault()
})
clearChunkReloadFlag()
installErrorReporter()
enableTracking()
capturePushTarget()
capturePushOpen()
captureInstallPrompt()
captureRef()
captureAttribution()
capturePersonalInvite()

// O Safari do iOS rola o documento pra mostrar o campo acima do teclado e às
// vezes não volta ao fechar. Como o app não rola (html/body com
// overflow:hidden), a tela ficaria deslocada sem como arrastar de volta.
window.addEventListener('focusout', () => {
  setTimeout(() => {
    const el = document.activeElement
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0)
  }, 120)
})

// Sem frame-ancestors no GitHub Pages (e a CSP por <meta> ignora essa
// diretiva): dentro de um iframe de outro site, tenta sair dele e não desenha
// nada, pra ninguém induzir cliques na conta logada (clickjacking).
if (window.top !== window.self) {
  try { window.top.location.replace(window.location.href) } catch { /* frame com sandbox */ }
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}
