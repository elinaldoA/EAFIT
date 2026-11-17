import { describe, it, expect } from 'vitest';
import { runsToCsv, csvHeader, csvRow, runsCsvFilename } from './runExport';

const run = (over = {}) => ({
  client_id: 'a', run_date: '2026-11-05', started_at: '2026-11-05T10:30:00', title: 'Volta do parque', kind: 'longao',
  distance_m: 12340, duration_s: 4200, elev_gain_m: 85, cadence: 168, effort: 7, visibility: 'amigos', notes: 'Foi bem',
  weather: { t: 24, w: 12, h: 60, c: 0 }, ...over,
});

describe('exportar corridas em CSV', () => {
  it('começa com BOM, separa por ponto e vírgula e usa vírgula decimal', () => {
    const csv = runsToCsv([run()]);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    const [head, line] = csv.slice(1).split('\r\n');
    expect(head.split(';')).toHaveLength(csvHeader().length);
    expect(line.split(';')).toEqual([
      '2026-11-05', '10:30', 'Volta do parque', 'Longão', '12,34', '1:10:00', '5:40', '85', '168', '7', '24', '12', '60', 'Amigos', 'Foi bem',
    ]);
  });

  it('as corridas saem da mais antiga para a mais nova', () => {
    const csv = runsToCsv([run({ run_date: '2026-11-09', started_at: '2026-11-09T07:00:00', title: 'B' }), run({ title: 'A' })]);
    const rows = csv.trim().split('\r\n').slice(1);
    expect(rows[0]).toContain(';A;');
    expect(rows[1]).toContain(';B;');
  });

  it('campos vazios ficam vazios: sem clima, subida, cadência, esforço ou distância curta', () => {
    const row = csvRow(run({ weather: null, elev_gain_m: null, cadence: null, effort: null, distance_m: 500, notes: null, visibility: 'privado' }));
    expect(row.slice(6)).toEqual(['', '', '', '', '', '', '', 'Só eu', '']);
  });

  it('texto com ponto e vírgula, aspas ou quebra de linha vai entre aspas', () => {
    const csv = runsToCsv([run({ title: 'Treino; "forte"', notes: 'linha 1\nlinha 2' })]);
    expect(csv).toContain('"Treino; ""forte"""');
    expect(csv).toContain('"linha 1\nlinha 2"');
  });

  it('título ou anotação que começa como fórmula não vira fórmula na planilha', () => {
    const csv = runsToCsv([run({ title: '=HYPERLINK("http://x")', notes: '+55 11' })]);
    expect(csv).not.toMatch(/;=HYPERLINK/);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+55 11");
  });

  it('nome do arquivo leva a data', () => {
    expect(runsCsvFilename('2026-11-17')).toBe('eafit-run-corridas-2026-11-17.csv');
  });
});
