import { describe, it, expect, vi } from 'vitest';
import { deflateRawSync } from 'node:zlib';
vi.mock('./supabase', () => ({ db: {} }));
import { fileKind, pdfItemsToLines, readXlsxRows } from './workoutImportFiles';
import { parseImportSource } from './workoutImport';

// Zip mínimo (um arquivo guardado sem compressão, os outros com deflate),
// do jeito que o Excel grava um .xlsx.
function makeZip(files) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  Object.entries(files).forEach(([name, text], i) => {
    const raw = enc.encode(text);
    const method = i === 0 ? 0 : 8;
    const data = method ? deflateRawSync(raw) : raw;
    const nameBytes = enc.encode(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  });
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  const buf = Buffer.concat([...locals, cd, end]);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
}

describe('fileKind', () => {
  it('identifica pela extensão e pelo tipo', () => {
    expect(fileKind({ name: 'ficha.PDF', type: '' })).toBe('pdf');
    expect(fileKind({ name: 'IMG_1.heic', type: '' })).toBe('image');
    expect(fileKind({ name: 'x', type: 'image/jpeg' })).toBe('image');
    expect(fileKind({ name: 'treinos.xlsx', type: '' })).toBe('xlsx');
    expect(fileKind({ name: 'velho.xls', type: '' })).toBe('xls');
    expect(fileKind({ name: 'hevy.json', type: '' })).toBe('json');
    expect(fileKind({ name: 'strong.csv', type: 'text/csv' })).toBe('text');
  });
});

describe('readXlsxRows', () => {
  it('lê a primeira aba com textos compartilhados, inline e números', async () => {
    const zip = makeZip({
      'xl/workbook.xml': '<workbook><sheets><sheet name="Treinos" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst><si><t>Data</t></si><si><t>Exercício</t></si><si><r><t>Supino </t></r><r><t>&amp; cia</t></r></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData>'
        + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Reps</t></is></c></row>'
        + '<row r="2"><c r="A2" s="1"><v>45306</v></c><c r="B2" t="s"><v>2</v></c><c r="D2"><v>10</v></c></row>'
        + '</sheetData></worksheet>',
    });
    const rows = await readXlsxRows(zip);
    expect(rows).toEqual([['Data', 'Exercício', '', 'Reps'], ['45306', 'Supino & cia', '', '10']]);
    const { sessions } = parseImportSource({ rows });
    expect(sessions[0]).toEqual(expect.objectContaining({ date: '2024-01-15' }));
    expect(sessions[0].exercises[0].sets[0].reps).toBe(10);
  });
});

describe('pdfItemsToLines', () => {
  it('junta pedaços da mesma linha e separa colunas distantes com tab', () => {
    const item = (str, x, y, width) => ({ str, transform: [10, 0, 0, 10, x, y], width });
    const lines = pdfItemsToLines([
      item('Supino', 10, 700, 30), item('reto', 42, 700, 20), item('4x10', 200, 700, 20),
      item('Treino A', 10, 720, 40),
    ]);
    expect(lines).toEqual(['Treino A', 'Supino reto\t4x10']);
  });
});
