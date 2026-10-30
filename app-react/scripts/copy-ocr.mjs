// Copia o worker, o núcleo WASM e o idioma português do Tesseract para
// public/ocr, de onde o app serve o OCR da importação de treinos por foto/PDF
// (lib/workoutImportFiles.js). A CSP só deixa carregar script do próprio app,
// então nada disso pode vir de CDN. Roda antes do dev e do build (predev/prebuild);
// public/ocr fica fora do git.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mod = p => join(root, 'node_modules', p);
const out = join(root, 'public', 'ocr');
mkdirSync(out, { recursive: true });

const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  // O worker escolhe um destes conforme o aparelho (só o modelo LSTM é usado).
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz', 'por.traineddata.gz'],
];
files.forEach(([from, to]) => copyFileSync(mod(from), join(out, to)));
console.log(`copy-ocr: ${files.length} arquivos em public/ocr`);
