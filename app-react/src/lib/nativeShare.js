import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { isNative } from './native';

// A WebView do Android não tem navigator.share / navigator.canShare, então convite,
// cartões de treino, relatório etc. caíam no fallback (copiar ou baixar). Aqui o app
// nativo ganha as duas funções por cima da folha de compartilhar do Android, e todo o
// código existente passa a funcionar sem mudança. Arquivos vão antes para o cache.

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.readAsDataURL(file);
  });
}

// Mesmo nome sobrescreve o anterior: o cache não cresce a cada compartilhamento.
async function stageFile(file) {
  const path = `share/${file.name || 'arquivo'}`;
  const { uri } = await Filesystem.writeFile({ path, data: await fileToBase64(file), directory: Directory.Cache, recursive: true });
  return uri;
}

function isCancel(err) {
  return /cancel/i.test(String(err?.message || err));
}

export async function nativeShare(data = {}) {
  try {
    const files = data.files?.length ? await Promise.all(data.files.map(stageFile)) : undefined;
    await Share.share({
      title: data.title,
      text: data.text,
      // Plugin só aceita http(s) em url; com arquivo o link já vai no texto.
      url: files ? undefined : data.url,
      files,
      dialogTitle: data.title,
    });
  } catch (err) {
    // Mesmo contrato da Web Share API: fechar a folha vira AbortError.
    if (isCancel(err)) throw new DOMException('Share canceled', 'AbortError');
    throw err;
  }
}

export function installNativeShare() {
  if (!isNative() || typeof navigator === 'undefined') return;
  const define = (name, value) => {
    try { Object.defineProperty(navigator, name, { value, configurable: true, writable: true }); } catch { /* somente leitura */ }
  };
  define('share', nativeShare);
  define('canShare', (data = {}) => !!(data.files?.length || data.text || data.url || data.title));
}
