import { t } from '../lib/i18n';

// Coordenadas dos hotspots de músculo sobre a imagem anatomia.jpg (350x615 por
// vista, frente e costas lado a lado numa imagem 700x615). Cada forma foi
// extraída independentemente (flood-fill a partir de um ponto dentro do
// músculo + rastreamento do contorno real dos pixels) — os dois lados NÃO são
// espelhados matematicamente um do outro porque a pose no desenho não é
// perfeitamente simétrica, e espelhar por x fazia o hotspot cair fora do
// músculo real do outro lado.
export const BODY_VIEW_SIZE = { width: 204, height: 358.5 };

export const MUSCLE_LABELS = {
  chest: t('Peitoral'),
  shoulders: t('Ombros'),
  triceps: t('Tríceps'),
  back: t('Costas'),
  biceps: t('Bíceps'),
  abs: t('Abdômen'),
  quads: t('Quadríceps'),
  calves: t('Panturrilhas'),
  hamstrings: t('Posterior de coxa'),
  glutes: t('Glúteos'),
};

export const FRONT_MUSCLE_PATHS = [
  { muscle: 'shoulders', d: 'M 74,66.4 L 85.7,66.4 L 88,68.2 L 79.9,74 L 71.1,87.4 L 61.8,92.1 L 60,88.6 L 61.2,75.8 L 65.9,69.4 L 73.4,66.4 Z' },
  { muscle: 'shoulders', d: 'M 128.2,66.4 L 140.5,66.4 L 149.8,71.1 L 153.9,83.3 L 152.7,92.1 L 141.6,86.3 L 134.1,74.6 L 125.9,68.2 L 127.6,66.4 Z' },
  { muscle: 'chest', d: 'M 89.2,69.9 L 95.6,71.1 L 102.6,76.9 L 104.3,86.8 L 103.2,95 L 89.2,97.3 L 81.6,95 L 72.9,89.2 L 81.6,75.2 L 88.6,69.9 Z' },
  { muscle: 'chest', d: 'M 121.2,69.9 L 128.2,71.7 L 140.5,88 L 135.2,93.3 L 126.5,96.8 L 114.8,96.2 L 109,93.3 L 110.7,76.9 L 120.7,69.9 Z' },
  { muscle: 'biceps', d: 'M 69.4,89.8 L 74,92.7 L 71.1,113.1 L 67.6,118.9 L 57.1,123.6 L 55.4,123.6 L 54.2,113.7 L 56.5,100.8 L 60,95 L 68.8,89.8 Z' },
  { muscle: 'biceps', d: 'M 144,89.8 L 153.3,95 L 156.8,100.3 L 159.1,109.6 L 158,124.1 L 146.3,118.9 L 142.8,113.7 L 139.9,103.7 L 139.3,92.7 L 143.4,89.8 Z' },
  { muscle: 'abs', d: 'M 106,98 C 95,97 88,105 88,120 C 89,133 96,142 106,144 C 116,142 123,133 124,120 C 124,105 117,97 106,98 Z' },
  { muscle: 'quads', d: 'M 82.2,169.6 L 89.8,199.9 L 86.3,227.3 L 76.9,208.1 L 74.6,194.7 L 75.2,179.5 L 81.6,169.6 Z' },
  { muscle: 'quads', d: 'M 131.7,170.2 L 138.7,181.3 L 137.6,205.2 L 127.1,227.3 L 123.6,202.3 L 131.7,169.6 Z' },
  { muscle: 'calves', d: 'M 77.5,243.1 L 82.8,249.5 L 89.2,251.2 L 79.9,273.9 L 77.5,303.1 L 72.3,279.2 L 72.3,247.7 L 76.9,243.1 Z' },
  { muscle: 'calves', d: 'M 135.8,243.1 L 140.5,246.5 L 141.6,251.2 L 141.1,280.4 L 136.4,304.3 L 134.6,278 L 124.7,251.8 L 131.7,248.9 L 135.2,243.1 Z' },
];

export const BACK_MUSCLE_PATHS = [
  { muscle: 'shoulders', d: 'M 64.7,60 L 71.7,60 L 72.9,62.4 L 68.2,67.6 L 58.3,74 L 57.7,79.3 L 45.5,85.7 L 45.5,75.2 L 47.8,68.8 L 53,63.5 L 64.1,60 Z' },
  { muscle: 'shoulders', d: 'M 120.1,59.5 L 130.6,61.2 L 138.7,65.9 L 143.4,75.2 L 143.4,86.3 L 139.9,82.2 L 131.1,79.3 L 130.6,74 L 118.9,65.9 L 116,61.8 L 119.5,59.5 Z' },
  { muscle: 'triceps', d: 'M 57.7,81.6 L 60.6,95.6 L 57.1,107.8 L 49,120.1 L 45.5,120.1 L 48.4,107.2 L 47.2,104.3 L 45.5,102.6 L 42.5,103.7 L 39.6,119.5 L 37.9,116 L 38.5,107.8 L 45.5,89.2 L 49,85.1 L 57.1,81.6 Z' },
  { muscle: 'triceps', d: 'M 131.7,81.6 L 141.6,86.8 L 149.2,103.2 L 151,110.7 L 149.2,119.5 L 146.3,104.3 L 143.4,102.6 L 140.5,105.5 L 143.4,120.1 L 138.1,118.3 L 131.7,107.8 L 128.2,95 L 131.1,81.6 Z' },
  { muscle: 'back', d: 'M 95,54.2 L 114.8,59.5 L 109,69.4 L 106.1,90.3 L 94.4,111.3 L 82.2,89.8 L 79.3,67 L 74,60 L 94.4,53.6 Z' },
  { muscle: 'glutes', d: 'M 78.7,146.3 L 87.4,150.4 L 93.3,158.5 L 93.3,178.9 L 90.9,188.3 L 87.4,190 L 71.1,188.8 L 64.7,184.2 L 62.9,178.9 L 62.9,172.5 L 68.2,157.4 L 78.1,146.3 Z' },
  { muscle: 'glutes', d: 'M 109,146.3 L 120.1,156.8 L 125.9,173.1 L 123.6,184.8 L 120.1,187.7 L 111.3,190 L 98.5,188.8 L 95.6,178.9 L 95.6,158 L 101.4,149.8 L 108.4,146.3 Z' },
  { muscle: 'hamstrings', d: 'M 76.9,195.3 L 81.6,225.6 L 80.4,234.3 L 72.9,255.3 L 66.4,243.1 L 67,233.7 L 71.1,223.8 L 72.3,209.8 L 76.9,194.7 Z' },
  { muscle: 'hamstrings', d: 'M 112.5,196.4 L 117.7,223.8 L 121.8,234.9 L 121.8,244.2 L 116.6,255.3 L 111.9,246.5 L 107.2,228.5 L 111.9,195.8 Z' },
  { muscle: 'calves', d: 'M 66.4,247.7 L 71.1,257 L 68.8,285 L 65.9,289.7 L 60,285 L 57.7,280.4 L 66.4,247.1 Z' },
  { muscle: 'calves', d: 'M 122.4,248.3 L 131.1,280.4 L 127.6,286.2 L 123,289.7 L 120.1,285 L 117.7,257 L 122.4,247.7 Z' },
];
