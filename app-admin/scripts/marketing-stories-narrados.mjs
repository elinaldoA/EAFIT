// Stories a partir dos tutoriais narrados (pasta "EAFIT Instagram/Videos"), com música
// baixa por baixo da voz. O vídeo não é recodificado; só o áudio:
//   - a narração é normalizada em -16 LUFS;
//   - a música em -30 LUFS (14 dB abaixo da voz) e ainda abaixa mais enquanto há fala
//     (sidechaincompress), para dar para entender tudo o que é dito;
//   - a música sai com um fade no fim.
//
//   node app-admin/scripts/marketing-stories-narrados.mjs
//   SRC="C:\...\EAFIT Instagram\Videos" SONG=app-admin/public/song.mp3 node ...
//
// Precisa do ffmpeg no PATH. Gera app-react/public/landing/img/marketing/story-v3-*.mp4
// (migrations 20270122010000 e 20270123010000).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(root, 'app-react', 'public', 'landing', 'img', 'marketing');
const SRC = process.env.SRC || 'C:\\Users\\Elina\\OneDrive\\EAFIT Instagram\\Videos';
const SONG = process.env.SONG || join(root, 'app-admin', 'music', 'song.mp3');

export const NARRADOS = {
  '1 - Para atrair gente nova/0-criar-conta.mp4': 'v3-criar-conta',
  '1 - Para atrair gente nova/1-plano-personalizado.mp4': 'v3-plano-personalizado',
  '1 - Para atrair gente nova/2-treino-no-tempo.mp4': 'v3-treino-no-tempo',
  '1 - Para atrair gente nova/3-academia-condominio-casa.mp4': 'v3-academia-condominio-casa',
  '1 - Para atrair gente nova/4-ver-execucao.mp4': 'v3-ver-execucao',
  '1 - Para atrair gente nova/5-trocar-exercicio.mp4': 'v3-trocar-exercicio',
  '2 - Para quem ja usa/1-modo-treino-ao-vivo.mp4': 'v3-modo-treino-ao-vivo',
  '2 - Para quem ja usa/2-metas-de-carga.mp4': 'v3-metas-de-carga',
  '2 - Para quem ja usa/3-volume-por-musculo.mp4': 'v3-volume-por-musculo',
  '2 - Para quem ja usa/4-retrospectiva-do-mes.mp4': 'v3-retrospectiva-do-mes',
  '2 - Para quem ja usa/5-peso-fotos-medidas.mp4': 'v3-peso-fotos-medidas',
  '2 - Para quem ja usa/7-modo-pausa.mp4': 'v3-modo-pausa',
  '2 - Para quem ja usa/8-mobilidade-guiada.mp4': 'v3-mobilidade-guiada',
  '3 - Para engajar e viralizar/1-liga-do-mes.mp4': 'v3-liga-do-mes',
  '3 - Para engajar e viralizar/2-desafios-com-amigos.mp4': 'v3-desafios-com-amigos',
  '3 - Para engajar e viralizar/3-amigos-e-ranking.mp4': 'v3-amigos-e-ranking',
  '4 - Para parceiros/1-personal-como-ter-acesso.mp4': 'v3-personal-como-ter-acesso',
  '4 - Para parceiros/2-personal-painel-e-ficha.mp4': 'v3-personal-painel-e-ficha',
  '4 - Para parceiros/3-personal-montar-treino-e-modelos.mp4': 'v3-personal-montar-treino-e-modelos',
  '4 - Para parceiros/4-personal-agenda-e-turma.mp4': 'v3-personal-agenda-e-turma',
  '4 - Para parceiros/5-influenciador-embaixador.mp4': 'v3-influenciador-embaixador',
};

function run(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    ff.on('error', reject);
    ff.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg saiu com ${code}`))));
  });
}

// Duração do vídeo (s), lida da saída do ffmpeg.
function duration(file) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    ff.stderr.on('data', c => { err += c; });
    ff.on('error', reject);
    ff.on('close', () => {
      const m = err.match(/Duration: (\d+):(\d+):([\d.]+)/);
      if (!m) return reject(new Error(`Sem duração: ${file}`));
      resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    });
  });
}

async function main() {
  if (!existsSync(SONG)) throw new Error(`Sem música em ${SONG} (defina SONG=...)`);
  mkdirSync(OUT, { recursive: true });
  let n = 0;
  for (const [rel, name] of Object.entries(NARRADOS)) {
    // Cada vídeo usa um trecho diferente da música (a faixa tem ~3 min; o maior vídeo ~37 s).
    const start = (n * 17) % 120;
    n += 1;
    const file = join(OUT, `story-${name}.mp4`);
    const total = await duration(join(SRC, rel));
    const fc = [
      '[0:a]aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=7,apad,asplit=2[n][sc]',
      '[1:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-30:TP=-3:LRA=7[m]',
      '[m][sc]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=500[md]',
      '[n]aformat=channel_layouts=stereo[ns]',
      `[ns][md]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2[out]`,
    ].join(';');
    await run([
      '-y', '-loglevel', 'error', '-i', join(SRC, rel), '-ss', String(start), '-i', SONG,
      '-filter_complex', fc, '-map', '0:v', '-map', '[out]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-t', total.toFixed(3), '-movflags', '+faststart', file,
    ]);
    console.log('ok', name);
  }
}

main();
