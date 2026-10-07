import { useState } from 'react';
import { useAppConfig } from '../context/useAppConfig';
import { dismissBanner, isBannerDismissed } from '../lib/appConfig';

import { t } from '../lib/i18n';
// Aviso do admin no topo do app. Dispensável: some até o admin publicar um
// aviso novo (a "version" muda a cada edição no painel).
export default function AnnouncementBanner() {
  const { config } = useAppConfig();
  const { banner } = config;
  const [dismissedVersion, setDismissedVersion] = useState(null);

  if (!banner.enabled) return null;
  if (dismissedVersion === banner.version || isBannerDismissed(banner.version)) return null;

  function handleDismiss() {
    dismissBanner(banner.version);
    setDismissedVersion(banner.version);
  }

  return (
    <div className={`announce announce--${banner.level}`} role="status">
      <span className="announce__text">
        {banner.message}
        {banner.linkUrl && (
          <>
            {' '}
            <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className="announce__link">
              {banner.linkLabel || t('Saiba mais')}
            </a>
          </>
        )}
      </span>
      <button type="button" className="announce__close" onClick={handleDismiss} aria-label={t('Fechar aviso')}>×</button>
    </div>
  );
}
