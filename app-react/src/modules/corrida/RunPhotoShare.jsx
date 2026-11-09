import { useCallback } from 'react';
import PhotoShareModal from '../../components/PhotoShareModal';
import { renderRunPhotoCard, shareRunPhoto, RUN_PHOTO_STATS } from './runShareCard';

import { t } from '../../lib/i18n';
const STAT_LABELS = {
  percurso: 'Percurso',
  distancia: 'Distância',
  ritmo: 'Ritmo',
  tempo: 'Tempo',
};

// Compartilhar a corrida numa foto da própria pessoa (câmera ou galeria), com o
// traçado e os números por cima, como no card de musculação.
export default function RunPhotoShare({ run, onClose }) {
  const render = useCallback((img, show) => renderRunPhotoCard(run, img, show), [run]);
  const share = useCallback(blob => shareRunPhoto(run, blob), [run]);
  // Sem GPS não há traçado para mostrar.
  const keys = RUN_PHOTO_STATS.filter(k => k !== 'percurso' || (Array.isArray(run.route) && run.route.length > 0));
  return (
    <PhotoShareModal
      title={t('📸 Foto da corrida')}
      subtitle={t('Tire uma foto e mostre o percurso e os números')}
      ariaLabel={t('Foto com os dados da corrida')}
      previewAlt={t('Prévia da foto com os dados da corrida')}
      stats={keys.map(k => [k, t(STAT_LABELS[k])])}
      render={render}
      share={share}
      onClose={onClose}
    />
  );
}
