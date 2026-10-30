import { MAX_IMPORT_BYTES, workoutJSONToRows } from './workoutImport';

// Lê o arquivo escolhido na importação de treinos e devolve { rows } (planilha,
// JSON) ou { text } (CSV/TSV/TXT, PDF, foto), que lib/workoutImport.js
// transforma em sessões (parseImportSource).
//
// PDF usa o PDF.js; PDF escaneado (sem texto) e foto passam pelo OCR do
// Tesseract. Os dois só carregam quando usados. O Tesseract roda num worker
// servido do próprio app (public/ocr, copiado de node_modules por
// scripts/copy-ocr.mjs) — a CSP da página não deixa buscar script em CDN nem
// criar worker a partir de blob:. O WASM roda dentro do worker, que não herda a
// CSP do <meta> da página.

export const MAX_SCAN_BYTES = 20 * 1024 * 1024;
const MAX_PDF_OCR_PAGES = 5;
// Abaixo disso a página é tratada como imagem (um rodapé sozinho não conta).
const MIN_PAGE_LETTERS = 80;
const OCR_MAX_SIDE = 2000;

export class ImportFileError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const ext = name => (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';

// 'pdf' | 'image' | 'xlsx' | 'xls' | 'json' | 'text'
export function fileKind(file) {
  const e = ext(file.name);
  const type = file.type || '';
  if (e === 'pdf' || type === 'application/pdf') return 'pdf';
  if (type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'bmp', 'gif'].includes(e)) return 'image';
  if (e === 'xlsx' || type.includes('spreadsheetml')) return 'xlsx';
  if (e === 'xls' || e === 'ods' || e === 'numbers') return 'xls';
  if (e === 'json' || type === 'application/json') return 'json';
  return 'text';
}

// onProgress({ step: 'pdf' | 'ocr-load' | 'ocr', progress: 0..1 })
export async function readWorkoutFile(file, onProgress) {
  const kind = fileKind(file);
  const limit = kind === 'pdf' || kind === 'image' ? MAX_SCAN_BYTES : MAX_IMPORT_BYTES;
  if (file.size > limit) throw new ImportFileError(kind === 'pdf' || kind === 'image' ? 'size-scan' : 'size');

  switch (kind) {
    case 'xls': throw new ImportFileError('xls');
    case 'xlsx': return { rows: await readXlsxRows(await file.arrayBuffer()) };
    case 'json':
      try { return { rows: workoutJSONToRows(await file.text()) }; } catch { throw new ImportFileError('json'); }
    case 'pdf': return { text: await readPdfText(file, onProgress) };
    case 'image': return { text: (await ocrImages([await imageToCanvas(file)], onProgress))[0] };
    default: return { text: await file.text() };
  }
}

// ---------- PDF ----------

async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.min.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

// Junta os pedaços de texto da página em linhas (mesma altura) e separa
// colunas distantes com tab, pra uma tabela do PDF virar linhas de TSV.
export function pdfItemsToLines(items) {
  const rows = [];
  items.filter(i => i.str && i.str.trim()).forEach(i => {
    const x = i.transform[4];
    const y = i.transform[5];
    const h = Math.abs(i.transform[3]) || i.height || 10;
    let row = rows.find(r => Math.abs(r.y - y) < Math.min(r.h, h) * 0.5);
    if (!row) { row = { y, h, items: [] }; rows.push(row); }
    row.items.push({ x, w: i.width || 0, str: i.str });
  });
  return rows
    .sort((a, b) => b.y - a.y)
    .map(r => {
      r.items.sort((a, b) => a.x - b.x);
      let out = '';
      let end = null;
      r.items.forEach(it => {
        if (end !== null) {
          const gap = it.x - end;
          out += gap > r.h * 2 ? '\t' : gap > r.h * 0.15 ? ' ' : '';
        }
        out += it.str;
        end = it.x + it.w;
      });
      return out.trim();
    })
    .filter(Boolean);
}

async function readPdfText(file, onProgress) {
  onProgress?.({ step: 'pdf', progress: 0 });
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const text = pdfItemsToLines(content.items).join('\n');
      pages.push({ page, text, scanned: (text.match(/[a-zà-ú]/gi) || []).length < MIN_PAGE_LETTERS });
      onProgress?.({ step: 'pdf', progress: p / doc.numPages });
    }

    // Página sem camada de texto (escaneada, ou tabela colada como imagem —
    // às vezes só o rodapé é texto): vira imagem e passa no OCR.
    const toOcr = pages.filter(p => p.scanned).slice(0, MAX_PDF_OCR_PAGES);
    if (toOcr.length) {
      const canvases = [];
      for (const { page } of toOcr) {
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(3, OCR_MAX_SIDE / Math.max(base.width, base.height)) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        canvases.push(canvas);
      }
      const texts = await ocrImages(canvases, onProgress);
      toOcr.forEach((p, i) => { p.text = texts[i]; });
    }
    return pages.map(p => p.text).join('\n');
  } finally {
    task.destroy();
  }
}

// ---------- Foto / OCR ----------

// Reduz a foto (celular tira 12 MP+): o OCR fica bem mais rápido e acerta igual.
async function imageToCanvas(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImportFileError('image');
  }
  const scale = Math.min(1, OCR_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

async function ocrImages(images, onProgress) {
  const base = new URL(`${import.meta.env.BASE_URL}ocr/`, window.location.href).href;
  let done = 0;
  let worker;
  try {
    const { createWorker } = await import('tesseract.js');
    onProgress?.({ step: 'ocr-load', progress: 0 });
    worker = await createWorker('por', 1, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: base,
      workerBlobURL: false,
      logger: m => {
        if (m.status === 'recognizing text') onProgress?.({ step: 'ocr', progress: (done + m.progress) / images.length });
        else if (typeof m.progress === 'number') onProgress?.({ step: 'ocr-load', progress: m.progress });
      },
    });
  } catch (err) {
    console.error('OCR:', err);
    await worker?.terminate();
    throw new ImportFileError('ocr');
  }
  try {
    const texts = [];
    for (const img of images) {
      const { data } = await worker.recognize(img);
      texts.push(data.text);
      done++;
    }
    return texts;
  } finally {
    await worker.terminate();
  }
}

// ---------- Planilha .xlsx ----------
// .xlsx é um zip de XMLs: lê o diretório central do zip, descompacta com o
// DecompressionStream do navegador e pega a primeira aba. Sem biblioteca.

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ImportFileError('xlsx');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map();
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new ImportFileError('xlsx');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    files.set(name, { method, data: bytes.subarray(start, start + size) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    has: name => files.has(name),
    async text(name) {
      const f = files.get(name);
      if (!f) return '';
      if (f.method === 0) return dec.decode(f.data);
      if (f.method === 8) return dec.decode(await inflate(f.data));
      throw new ImportFileError('xlsx');
    },
  };
}

const xmlText = s => s
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
  .replace(/&amp;/g, '&');

const colIndex = ref => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export async function readXlsxRows(buffer) {
  const zip = await unzip(buffer);
  // Primeira aba do workbook (a ordem em workbook.xml é a das abas).
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = await zip.text('xl/workbook.xml');
  const rid = wb.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  if (rid) {
    const rels = await zip.text('xl/_rels/workbook.xml.rels');
    const target = rels.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1]
      || rels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1];
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  if (!zip.has(sheetPath)) throw new ImportFileError('xlsx');

  const shared = [...(await zip.text('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => xmlText(t[1])).join(''));

  const sheet = await zip.text(sheetPath);
  return [...sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(rm => {
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const inner = cm[2] || '';
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = xmlText(inner.match(/<is>([\s\S]*?)<\/is>/)?.[1] || '');
      else if (v !== undefined) value = xmlText(v);
      const i = ref ? colIndex(ref) : row.length;
      while (row.length < i) row.push('');
      row[i] = value;
    }
    return row;
  }).filter(r => r.some(v => String(v).trim()));
}
