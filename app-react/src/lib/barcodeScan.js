// Leitor de código de barras para a busca de alimentos. Usa o BarcodeDetector
// do navegador quando existe (Chrome/Edge); no Safari/iPhone e no Firefox cai
// para a @zxing/library (lib/barcodeZxing.js: JavaScript puro, sem WASM, que a
// CSP bloquearia), carregada só na primeira vez que a câmera abre.
const FORMATS = ['ean_13', 'ean_8', 'upc_a'];

export const canUseCamera = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

async function nativeDetector() {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats?.();
    if (supported && !FORMATS.some(f => supported.includes(f))) return null;
    const detector = new window.BarcodeDetector({ formats: FORMATS });
    return {
      async detect(video) {
        const found = await detector.detect(video);
        return found[0]?.rawValue || null;
      },
    };
  } catch {
    return null;
  }
}

// Devolve { detect(video) → código ou null }. Falha só se nem o leitor reserva carregar.
export async function createBarcodeDetector() {
  const native = await nativeDetector();
  if (native) return native;
  const { createZxingDetector } = await import('./barcodeZxing');
  return createZxingDetector();
}
