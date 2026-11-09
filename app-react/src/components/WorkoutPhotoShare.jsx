import { useCallback } from 'react';
import PhotoShareModal from './PhotoShareModal';
import { renderWorkoutPhotoCard, shareWorkoutPhoto, PHOTO_STATS } from '../lib/shareCard';

import { t } from '../lib/i18n';
const STAT_LABELS = {
  duracao: 'Duração',
  carga: 'Carga total',
  series: 'Séries',
  exercicios: 'Exercícios',
};

// Compartilhar o treino numa foto da própria pessoa (câmera ou galeria).
export default function WorkoutPhotoShare({ summary, onClose }) {
  const render = useCallback((img, show) => renderWorkoutPhotoCard(summary, img, show), [summary]);
  return (
    <PhotoShareModal
      title={t('📸 Foto do treino')}
      subtitle={t('Tire uma foto e mostre os números do treino')}
      ariaLabel={t('Foto com os dados do treino')}
      previewAlt={t('Prévia da foto com os dados do treino')}
      stats={PHOTO_STATS.map(k => [k, t(STAT_LABELS[k])])}
      render={render}
      share={shareWorkoutPhoto}
      onClose={onClose}
    />
  );
}
