import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const CHECK_INTERVAL_MS = 60_000;
const RELOAD_FALLBACK_MS = 5_000;

// Aviso de versão nova do app (service worker novo esperando pra ativar).
// Cartão flutuante acima da navegação inferior — a faixa fina antiga, colada
// no topo por cima do cabeçalho, passava despercebida.
//
// Checa atualização no intervalo E sempre que o app volta pro primeiro plano
// ou a conexão volta: no celular, com o PWA em segundo plano, o setInterval
// fica congelado, e é justamente ao reabrir o app que o usuário precisa ver o
// aviso.
export default function UpdatePrompt({ aboveNav = false }) {
  const registrationRef = useRef(null);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      registrationRef.current = registration;
      setInterval(() => registration.update().catch(() => {}), CHECK_INTERVAL_MS);
    },
  });

  useEffect(() => {
    function check() {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        registrationRef.current?.update().catch(() => {});
      }
    }
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
    };
  }, []);

  if (!needRefresh || dismissed) return null;

  // O reload automático do vite-plugin-pwa depende do evento "controlling" do
  // workbox-window vir marcado como isUpdate — o que não acontece quando a
  // versão nova é a segunda encontrada na mesma sessão (app aberto por muito
  // tempo, dois deploys seguidos): o SW novo ativa, mas a página não recarrega
  // e o botão parece não fazer nada. Recarrega aqui mesmo quando o SW novo
  // assume a página, com um fallback caso o evento nunca chegue.
  function handleUpdate() {
    setUpdating(true);
    let reloaded = false;
    const reload = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true });
    setTimeout(reload, RELOAD_FALLBACK_MS);
    updateServiceWorker(true);
  }

  return (
    <div className={`update-card${aboveNav ? ' update-card--above-nav' : ''}`} role="alert">
      <div className="update-card__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-3-6.7" /><polyline points="21 3 21 9 15 9" />
        </svg>
      </div>
      <div className="update-card__text">
        <strong className="update-card__title">Nova versão disponível</strong>
        <span className="update-card__desc">Atualize para usar as melhorias mais recentes.</span>
      </div>
      <div className="update-card__actions">
        <button type="button" className="update-card__later" onClick={() => setDismissed(true)} disabled={updating}>
          Depois
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={handleUpdate} disabled={updating}>
          {updating ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>
    </div>
  );
}
