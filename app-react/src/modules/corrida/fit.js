// Arquivo .FIT (Garmin, Coros, Polar, Suunto, Wahoo, Apple Watch via apps): lê os
// pontos de GPS, a frequência cardíaca e a cadência das mensagens "record". O
// resultado tem o mesmo formato do parseGpx (gpx.js), para o mesmo importador
// montar a corrida, e leva a frequência e a cadência a mais.
//
// Formato (resumo): cabeçalho de 12 ou 14 bytes, depois mensagens de definição
// (dizem quais campos vêm e de que tamanho) e de dados, uma depois da outra.

const FIT_EPOCH_MS = Date.UTC(1989, 11, 31); // os horários contam em segundos desde 31/12/1989
const RECORD_MSG = 20;
const SEMICIRCLE = 180 / 2 ** 31;

// Campos da mensagem record que importam (número do campo → nome).
const F_TIME = 253;
const F_LAT = 0;
const F_LON = 1;
const F_ALT = 2;
const F_HR = 3;
const F_CAD = 4;
const F_ALT_ENH = 78;

export const MAX_FIT_BYTES = 8 * 1024 * 1024;

// Tipos base: tamanho em bytes, leitura e o valor que significa "sem dado".
function readValue(view, offset, size, baseType, little) {
  const type = baseType & 0x1f;
  switch (type) {
    case 1: { const v = view.getInt8(offset); return v === 0x7f ? null : v; } // sint8
    case 0: case 2: case 10: { const v = view.getUint8(offset); return v === 0xff ? null : v; } // enum, uint8, uint8z (z: 0 também é inválido, tratado abaixo)
    case 3: { const v = view.getInt16(offset, little); return v === 0x7fff ? null : v; } // sint16
    case 4: case 11: { const v = view.getUint16(offset, little); return v === 0xffff ? null : v; } // uint16, uint16z
    case 5: { const v = view.getInt32(offset, little); return v === 0x7fffffff ? null : v; } // sint32
    case 6: case 12: { const v = view.getUint32(offset, little); return v === 0xffffffff ? null : v; } // uint32, uint32z
    default: return size === 1 ? view.getUint8(offset) : null; // string, float, etc: não usados aqui
  }
}

// { name, segments: [[{ lat, lon, ele, time }]], hr: { avg, max } | null, cadence } ou
// null se não for um FIT com percurso. `buffer`: ArrayBuffer do arquivo.
export function parseFit(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 14 || buffer.byteLength > MAX_FIT_BYTES) return null;
  const view = new DataView(buffer);
  const headerSize = view.getUint8(0);
  if (headerSize < 12 || String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)) !== '.FIT') return null;
  const end = Math.min(buffer.byteLength, headerSize + view.getUint32(4, true));

  const defs = new Map(); // tipo local → { global, little, fields: [{ num, size, type }], devSize }
  const points = [];
  let hrSum = 0;
  let hrN = 0;
  let hrMax = 0;
  let cadSum = 0;
  let cadN = 0;
  let pos = headerSize;
  let lastTime = null;

  try {
    while (pos < end) {
      const header = view.getUint8(pos++);
      if (header & 0x80) {
        // Cabeçalho com horário comprimido: tipo local nos bits 5-6; o horário é o anterior + deslocamento (5 bits).
        const def = defs.get((header >> 5) & 0x3);
        if (!def) return null;
        if (lastTime != null) {
          const offset = header & 0x1f;
          lastTime += ((offset - (lastTime & 0x1f)) & 0x1f);
        }
        pos += def.fields.reduce((n, f) => n + f.size, 0) + def.devSize;
        continue;
      }
      const local = header & 0x0f;
      if (header & 0x40) {
        // Definição: reservado, arquitetura, número global, campos (e campos do desenvolvedor).
        pos += 1;
        const little = view.getUint8(pos++) === 0;
        const global = view.getUint16(pos, little);
        pos += 2;
        const count = view.getUint8(pos++);
        const fields = [];
        for (let i = 0; i < count; i++) {
          fields.push({ num: view.getUint8(pos), size: view.getUint8(pos + 1), type: view.getUint8(pos + 2) });
          pos += 3;
        }
        let devSize = 0;
        if (header & 0x20) {
          const devCount = view.getUint8(pos++);
          for (let i = 0; i < devCount; i++) { devSize += view.getUint8(pos + 1); pos += 3; }
        }
        defs.set(local, { global, little, fields, devSize });
        continue;
      }
      const def = defs.get(local);
      if (!def) return null;
      if (def.global === RECORD_MSG) {
        const rec = {};
        let at = pos;
        for (const f of def.fields) {
          if ([F_TIME, F_LAT, F_LON, F_ALT, F_HR, F_CAD, F_ALT_ENH].includes(f.num) && f.size > 0) {
            rec[f.num] = readValue(view, at, f.size, f.type, def.little);
          }
          at += f.size;
        }
        if (rec[F_TIME] != null) lastTime = rec[F_TIME];
        const time = lastTime != null ? FIT_EPOCH_MS + lastTime * 1000 : null;
        if (rec[F_HR] > 0) { hrSum += rec[F_HR]; hrN++; hrMax = Math.max(hrMax, rec[F_HR]); }
        if (rec[F_CAD] > 0) { cadSum += rec[F_CAD]; cadN++; }
        if (rec[F_LAT] != null && rec[F_LON] != null) {
          const lat = rec[F_LAT] * SEMICIRCLE;
          const lon = rec[F_LON] * SEMICIRCLE;
          if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            const alt = rec[F_ALT_ENH] != null ? rec[F_ALT_ENH] / 5 - 500 : rec[F_ALT] != null ? rec[F_ALT] / 5 - 500 : null;
            points.push({ lat, lon, ele: alt, time });
          }
        }
      }
      pos += def.fields.reduce((n, f) => n + f.size, 0) + def.devSize;
    }
  } catch {
    // Arquivo cortado no meio: vale o que foi lido até aqui.
  }
  if (points.length < 2) return null;
  return {
    name: '',
    segments: [points],
    hr: hrN >= 10 ? { avg: Math.round(hrSum / hrN), max: hrMax } : null,
    // A cadência do FIT de corrida é de passadas (um pé): vezes 2 dá passos por minuto.
    cadence: cadN >= 10 ? Math.round((cadSum / cadN) * 2) : null,
  };
}
