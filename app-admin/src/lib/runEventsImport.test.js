import { describe, it, expect } from 'vitest';
import { decodeEntities, parseDistances, inferDate, parseCalendar, parseDetail, diffCalendar, isComplete, insertSql, missedSql, parseArgs } from '../../scripts/run-events-import.mjs';

const CAL = `<table>
<tr align="center"><td width="40">20.11</span></td>
<td width="160"><a href='/ES/por_cidade.asp?cidade=Vila Velha' class="tipo4">Vila Velha</a></td>
<td width="340"><a href='mostracorrida.asp?escolha=63892&Corrida Cibien' class="tipo4">Corrida Cibien</a></td>
<td width="120">6,5km</td></tr>
<tr><td width="40">28.11</td><td><a href='/x'>Castelo</a></td>
<td><a href='mostracorrida.asp?escolha=61996&Insanity' class="tipo4">Insanity &amp; Co</a></td><td>55/35/21/12km</td></tr>
<tr><td>cabeçalho sem prova</td></tr></table>`;

const DETAIL = `<td>Data:</td><td><span>20/11/2026</span></td>
<td>Largada:</td><td><span>Pra&#231;a do Ciclista</span></td>
<script>function paraonde(){ window.open('https://www.corridasbr.com.br/siteevento.asp?c=https://www.resultadofinal.com/corridacibien'); }</script>`;

describe('importação do CorridasBR', () => {
  it('lê as linhas do calendário', () => {
    const rows = parseCalendar(CAL);
    expect(rows).toEqual([
      { id: '63892', dayMonth: '20.11', city: 'Vila Velha', name: 'Corrida Cibien', distances: [6.5] },
      { id: '61996', dayMonth: '28.11', city: 'Castelo', name: 'Insanity & Co', distances: [55, 35, 21, 12] },
    ]);
  });

  it('lê data, largada e link do organizador na página da prova', () => {
    expect(parseDetail(DETAIL)).toEqual({ date: '2026-11-20', venue: 'Praça do Ciclista', url: 'https://www.resultadofinal.com/corridacibien' });
  });

  it('não aceita link que volta para o próprio agregador', () => {
    expect(parseDetail('<script>x(\'https://www.corridasbr.com.br/siteevento.asp?c=https://www.corridasbr.com.br/ES/x\')</script>').url).toBeNull();
  });

  it('decodifica entidades, distâncias e o ano da data', () => {
    expect(decodeEntities('Pra&#231;a &amp; Dist&acirc;ncia')).toBe('Praça & Distância');
    expect(parseDistances('não informada')).toEqual([]);
    expect(inferDate('20.11', new Date(2026, 10, 18))).toBe('2026-11-20');
    expect(inferDate('05.01', new Date(2026, 10, 18))).toBe('2027-01-05');
    expect(inferDate('32.13')).toBeNull();
  });

  const row = (over = {}) => ({ name: "Corrida D'Água", event_date: '2026-12-06', city: 'Vila Velha', state: 'ES', venue: null, lat: -20.3, lng: -40.2, distances: [5, 10], url: 'https://x.com/i', source_id: '1', source_url: 'https://x.com/a', ...over });

  it('só entra aprovada a prova completa; o resto vai para rascunho', () => {
    expect(isComplete(row())).toBe(true);
    expect(isComplete(row({ url: null }))).toBe(false);
    expect(isComplete(row({ lat: null }))).toBe(false);
    expect(isComplete(row({ distances: [] }))).toBe(false);
    const sql = insertSql([row(), row({ source_id: '2', url: null })]);
    expect(sql).toContain("'Corrida D''Água'");
    expect(sql).toContain("'{5,10}'::numeric[]");
    expect(sql).toContain("'approved'");
    expect(sql).toContain("'draft'");
    expect(sql).toContain('on conflict (source, source_id) do nothing');
  });

  it('sumida: conta a falta e só esconde a aprovada na 2ª seguida', () => {
    const sql = missedSql(['9']);
    expect(sql).toContain('missed_runs = missed_runs + 1');
    expect(sql).toContain("missed_runs + 1 >= 2 and status = 'approved' then 'draft'");
    expect(missedSql([])).toBe('');
  });

  it('compara o calendário com o banco: nova, alterada, igual e sumida', () => {
    const today = new Date(2026, 10, 18);
    const list = [
      { id: '1', dayMonth: '20.11', city: 'A', name: 'Igual', distances: [10, 5] },
      { id: '2', dayMonth: '21.11', city: 'A', name: 'Mudou de dia', distances: [5] },
      { id: '3', dayMonth: '22.11', city: 'A', name: 'Nova', distances: [5] },
      { id: '4', dayMonth: '23.11', city: 'A', name: 'Nome novo', distances: [5] },
    ];
    const existing = [
      { source_id: '1', name: 'Igual', event_date: '2026-11-20', distances: ['5', '10'] },
      { source_id: '2', name: 'Mudou de dia', event_date: '2026-11-28', distances: ['5'] },
      { source_id: '4', name: 'Nome antigo', event_date: '2026-11-23', distances: ['5'] },
      { source_id: '5', name: 'Sumiu', event_date: '2026-12-01', distances: ['5'] },
      { source_id: '6', name: 'Sumiu mas já passou', event_date: '2026-10-01', distances: ['5'] },
    ];
    const d = diffCalendar(list, existing, today);
    expect(d.same.map(i => i.id)).toEqual(['1']);
    expect(d.changed.map(i => i.id)).toEqual(['2', '4']);
    expect(d.fresh.map(i => i.id)).toEqual(['3']);
    expect(d.missing.map(e => e.source_id)).toEqual(['5']);
  });

  it('argumentos: --all pega todas as UFs, limite de páginas e simulação', () => {
    expect(parseArgs(['--all']).ufs).toHaveLength(27);
    expect(parseArgs(['es', 'MG', 'xx', '--dry', '--max-details', '10'])).toEqual({ ufs: ['ES', 'MG'], dry: true, maxDetails: 10 });
    expect(parseArgs(['ES']).maxDetails).toBe(300);
  });
});
