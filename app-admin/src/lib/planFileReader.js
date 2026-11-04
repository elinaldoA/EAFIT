// Leitura dos arquivos aceitos na importação de plano do painel: planilha
// .xlsx (sem biblioteca), PDF com texto (PDF.js) e texto/CSV/TSV. Adaptado de
// app-react/src/lib/workoutImportFiles.js, sem OCR (PDF escaneado e foto não).

export class PlanFileError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const ImportFileError = PlanFileError;

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

export async function readPdfText(file) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      pages.push(pdfItemsToLines(content.items).join('\n'));
    }
    return pages.join('\n');
  } finally {
    task.destroy();
  }
}

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
