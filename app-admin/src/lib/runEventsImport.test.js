import { describe, it, expect } from 'vitest';
import { decodeEntities, parseDistances, inferDate, parseCalendar, parseDetail, toSql } from '../../scripts/run-events-import.mjs';

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

  it('gera o upsert sem tocar no status e escapa aspas', () => {
    const sql = toSql([{ name: "Corrida D'Água", event_date: '2026-12-06', city: 'Vila Velha', state: 'ES', venue: null, lat: -20.3, lng: -40.2, distances: [5, 10], url: null, source: 'corridasbr', source_id: '1', source_url: 'https://x.com/a' }]);
    expect(sql).toContain("'Corrida D''Água'");
    expect(sql).toContain("'{5,10}'::numeric[]");
    expect(sql).toContain('on conflict (source, source_id)');
    expect(sql).not.toMatch(/status\s*=/);
  });
});
