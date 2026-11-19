// Vídeo do YouTube (canal @eafitapp): gravação de tela + narração + música de fundo
// que nunca cobre a voz. O vídeo não é recodificado; só o áudio:
//   - a narração é normalizada em -16 LUFS (volume padrão de fala no YouTube);
//   - a música fica em -32 LUFS (16 dB abaixo da voz) e ainda abaixa mais enquanto há fala
//     (sidechaincompress), voltando suave nas pausas;
//   - a música entra com fade-in de 1,5 s, repete se o vídeo for maior que a faixa e sai
//     com fade-out de 2 s.
//
//   VIDEO="tutorial1-tela.mp4" VOICE="tutorial1-voz.wav" node app-admin/scripts/youtube-mixar-narracao.mjs
//   SONG=app-admin/music/song-2.mp3 OUT="saida.mp4" ...     (opcionais)
//
// VOICE é o arquivo da narração gravada à parte (wav, mp3 ou m4a). Sem VOICE, usa o áudio
// do próprio VIDEO. Precisa do ffmpeg no PATH. Só voz humana: nada de voz sintética no canal.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VIDEO = process.env.VIDEO ? resolve(process.env.VIDEO) : '';
const VOICE = process.env.VOICE ? resolve(process.env.VOICE) : '';
const SONG = process.env.SONG ? resolve(process.env.SONG) : join(root, 'app-admin', 'music', 'song.mp3');
const OUT = process.env.OUT
  ? resolve(process.env.OUT)
  : VIDEO.replace(new RegExp(`${extname(VIDEO)}$`), '') + '-final.mp4';

const MUSIC_LUFS = -32;
const VOICE_LUFS = -16;

function ffmpeg(args, { captureErr = false } = {}) {
  return new Promise((resolveRun, reject) => {
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', captureErr ? 'pipe' : 'inherit'] });
    let err = '';
    if (captureErr) ff.stderr.on('data', c => { err += c; });
    ff.on('error', e => reject(new Error(e.code === 'ENOENT' ? 'ffmpeg não encontrado no PATH.' : e.message)));
    ff.on('close', code => (captureErr || code === 0 ? resolveRun(err) : reject(new Error(`ffmpeg saiu com ${code}`))));
  });
}

// Duração (s), lida da saída do ffmpeg.
async function duration(file) {
  const err = await ffmpeg(['-hide_banner', '-i', file], { captureErr: true });
  const m = err.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!m) throw new Error(`Sem duração: ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

// Filtro de áudio. voice/music são os rótulos das entradas (ex.: '1:a').
export function mixFilter(voice, music, total) {
  const fadeOutAt = Math.max(0, total - 2).toFixed(2);
  return [
    `[${voice}]aresample=48000,loudnorm=I=${VOICE_LUFS}:TP=-1.5:LRA=7,apad,asplit=2[n][sc]`,
    `[${music}]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=${MUSIC_LUFS}:TP=-3:LRA=7,afade=t=in:st=0:d=1.5[m]`,
    '[m][sc]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=700[md]',
    '[n]aformat=channel_layouts=stereo[ns]',
    `[ns][md]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95,afade=t=out:st=${fadeOutAt}:d=2[out]`,
  ].join(';');
}

async function main() {
  if (!VIDEO || !existsSync(VIDEO)) throw new Error('Defina VIDEO=... com a gravação de tela (arquivo existente).');
  if (VOICE && !existsSync(VOICE)) throw new Error(`Narração não encontrada: ${VOICE}`);
  if (!existsSync(SONG)) throw new Error(`Sem música em ${SONG} (defina SONG=...)`);

  const total = await duration(VIDEO);
  // Entradas: 0 = vídeo; 1 = narração (se houver); última = música em loop.
  const inputs = ['-i', VIDEO];
  let voiceLabel = '0:a';
  if (VOICE) {
    inputs.push('-i', VOICE);
    voiceLabel = '1:a';
  }
  const musicLabel = `${VOICE ? 2 : 1}:a`;
  inputs.push('-stream_loop', '-1', '-i', SONG);

  await ffmpeg([
    '-y', '-loglevel', 'error', ...inputs,
    '-filter_complex', mixFilter(voiceLabel, musicLabel, total),
    '-map', '0:v', '-map', '[out]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', total.toFixed(3), '-movflags', '+faststart', OUT,
  ]);
  console.log('ok', basename(OUT));
}

// Roda só quando chamado direto (o filtro é exportado para teste).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
