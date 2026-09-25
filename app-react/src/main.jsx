import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { clearChunkReloadFlag, reloadOnceForChunkError } from './lib/chunkReload'

// Import dinâmico que falha no preload (chunk de uma versão antiga que não
// existe mais depois de um deploy) — recarrega uma vez pra pegar a versão nova.
window.addEventListener('vite:preloadError', event => {
  if (reloadOnceForChunkError()) event.preventDefault()
})
clearChunkReloadFlag()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
