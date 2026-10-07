import { t } from './i18n';
export const MAX_DIMENSION = 1024; // px — lado maior após redimensionar
export const JPEG_QUALITY = 0.85;

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(t('Não foi possível ler a imagem.')));
    reader.readAsDataURL(file);
  });
}

export function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(t('Não foi possível processar a imagem.')));
    img.src = dataUrl;
  });
}

async function resizeToCanvas(file, maxDimension) {
  const original = await fileToDataUrl(file);
  const img = await loadImage(original);

  let { width, height } = img;
  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height / width) * maxDimension);
      width = maxDimension;
    } else {
      width = Math.round((width / height) * maxDimension);
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  return canvas;
}

// Redimensiona (lado maior ≤ maxDimension) e recomprime em JPEG antes de salvar,
// mantendo boa qualidade visual sem guardar o arquivo original inteiro.
export async function compressImage(file, { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY } = {}) {
  const canvas = await resizeToCanvas(file, maxDimension);
  return canvas.toDataURL('image/jpeg', quality);
}

// Mesmo redimensionamento/compressão de compressImage, mas devolve um Blob
// (em vez de data URL base64) para upload direto ao Supabase Storage.
export async function compressImageBlob(file, { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY } = {}) {
  const canvas = await resizeToCanvas(file, maxDimension);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(t('Não foi possível processar a imagem.')))), 'image/jpeg', quality);
  });
}

export function assertValidImage(file, maxUploadSize) {
  if (!file.type.startsWith('image/')) throw new Error(t('Selecione um arquivo de imagem.'));
  if (file.size > maxUploadSize) throw new Error(t('Imagem muito grande (máx. {v1}MB).', { v1: Math.round(maxUploadSize / (1024 * 1024)) }));
}
