// Leitor reserva de EAN/UPC (Safari/iPhone, Firefox), carregado sob demanda por
// lib/barcodeScan.js. Importa só os arquivos de EAN/UPC da @zxing/library: o
// índice do pacote traria todos os formatos (~440 kB).
import BarcodeFormat from '@zxing/library/esm/core/BarcodeFormat';
import BinaryBitmap from '@zxing/library/esm/core/BinaryBitmap';
import DecodeHintType from '@zxing/library/esm/core/DecodeHintType';
import HybridBinarizer from '@zxing/library/esm/core/common/HybridBinarizer';
import MultiFormatUPCEANReader from '@zxing/library/esm/core/oned/MultiFormatUPCEANReader';
import { HTMLCanvasElementLuminanceSource } from '@zxing/library/esm/browser/HTMLCanvasElementLuminanceSource';

export function createZxingDetector() {
  const hints = new Map([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A]],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new MultiFormatUPCEANReader(hints);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return {
    async detect(video) {
      const w = video.videoWidth; const h = video.videoHeight;
      if (!w || !h) return null;
      // Quadro reduzido a até 800 px de largura: o código continua legível e a leitura fica rápida.
      const scale = Math.min(1, 800 / w);
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const bitmap = new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas)));
        return reader.decode(bitmap, hints).getText();
      } catch {
        return null; // quadro sem código
      }
    },
  };
}
