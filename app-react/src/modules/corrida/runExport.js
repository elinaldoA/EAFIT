import { t, lang } from '../../lib/i18n';
import { SESSION_TITLE } from './program';
import { runTitle, paceSeconds, formatPace, formatClock, formatKm } from './runs';
import { cleanWeather } from './weather';
import { downloadText } from './gpx';

// Exporta todas as corridas em CSV (planilha): uma linha por corrida, com as
// colunas mais úteis. Separador ";" e vírgula decimal em português (abre direto no
// Excel brasileiro); em inglês, "," e ponto. BOM no começo para o Excel acertar os acentos.

const sep = () => (lang === 'en' ? ',' : ';');

// Células que começam com = + - @ viram fórmula na planilha: prefixa com apóstrofo (CSV injection).
function safe(value) {
  const text = String(value ?? '');
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function cell(value) {
  const text = safe(value);
  // Só cita o que quebraria a coluna ou a linha (a vírgula decimal do português não precisa).
  return (text.includes(sep()) || /["\n\r]/.test(text)) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvHeader() {
  return [
    t('Data'), t('Início'), t('Título'), t('Tipo'), t('Distância (km)'), t('Tempo'), t('Ritmo (min/km)'),
    t('Subida (m)'), t('Cadência (passos/min)'), t('Esforço (1-10)'), t('Temperatura (°C)'), t('Vento (km/h)'), t('Umidade (%)'),
    t('Quem vê'), t('Anotações'),
  ];
}

export function csvRow(run) {
  const pace = paceSeconds(run.duration_s, run.distance_m);
  const w = cleanWeather(run.weather);
  const start = run.started_at ? new Date(run.started_at) : null;
  const time = start && !Number.isNaN(start.getTime())
    ? `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}` : '';
  return [
    run.run_date,
    time,
    runTitle(run),
    SESSION_TITLE[run.kind] || SESSION_TITLE.livre,
    formatKm(run.distance_m, 2),
    formatClock(run.duration_s),
    pace === null ? '' : formatPace(pace),
    run.elev_gain_m ?? '',
    run.cadence ?? '',
    run.effort ?? '',
    w ? w.t : '',
    w?.w ?? '',
    w?.h ?? '',
    run.visibility === 'privado' ? t('Só eu') : t('Amigos'),
    run.notes || '',
  ];
}

// Corridas da mais antiga para a mais nova (como num diário).
export function runsToCsv(runs) {
  const sorted = [...runs].sort((a, b) => String(a.started_at || a.run_date).localeCompare(String(b.started_at || b.run_date)));
  const lines = [csvHeader(), ...sorted.map(csvRow)].map(row => row.map(cell).join(sep()));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export const runsCsvFilename = (today = new Date().toISOString().slice(0, 10)) => `eafit-run-corridas-${today}.csv`;

export const downloadRunsCsv = runs => downloadText(runsCsvFilename(), runsToCsv(runs), 'text/csv;charset=utf-8');
