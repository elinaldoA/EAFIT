import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { DURATION, FPS, H, W, drawReelFrame } from './reelRender';
import { SAMPLE_RATE, synthTrack } from './reelAudio';

// Gerador de Reel do painel: desenha os quadros (reelRender), sintetiza a trilha
// (reelAudio) e codifica tudo no próprio navegador com WebCodecs (H.264 + AAC),
// juntando num MP4 comum com `moov` no começo (mp4-muxer). É o formato que o
// Instagram aceita; não usa servidor nem ffmpeg.

const VIDEO = { codec: 'avc1.640028', width: W, height: H, bitrate: 3_500_000, framerate: FPS };
const AUDIO = { codec: 'mp4a.40.2', sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 128_000 };
const AUDIO_CHUNK = 4096;

export function canRenderReels() {
  return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // o site responde com Access-Control-Allow-Origin: *
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não deu para carregar o print do app.'));
    img.src = src;
  });
}

// Espera a fila do codificador baixar, para não encher a memória de quadros.
async function drain(encoder, limit) {
  while (encoder.encodeQueueSize > limit) await new Promise(r => setTimeout(r, 4));
}

// { imageUrl, hook, title, sub, onProgress(0..1) } → { blob, width, height, seconds }
export async function renderReel({ imageUrl, hook, title, sub, onProgress = () => {} }) {
  if (!canRenderReels()) throw new Error('Este navegador não gera vídeo. Use o Chrome ou o Edge atualizado.');
  const [video, audio] = await Promise.all([VideoEncoder.isConfigSupported(VIDEO), AudioEncoder.isConfigSupported(AUDIO)]);
  if (!video.supported) throw new Error('Este navegador não codifica vídeo H.264 em 1080×1920. Use o Chrome ou o Edge no computador.');
  if (!audio.supported) throw new Error('Este navegador não codifica áudio AAC, que o Instagram exige. Use o Chrome ou o Edge no computador.');

  const img = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: W, height: H },
    audio: { codec: 'aac', sampleRate: SAMPLE_RATE, numberOfChannels: 2 },
    fastStart: 'in-memory',
  });
  let failure = null;
  const onError = e => { failure = e; };
  const videoEncoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: onError });
  const audioEncoder = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: onError });
  videoEncoder.configure(VIDEO);
  audioEncoder.configure(AUDIO);

  const reel = { hook, title, sub };
  const frames = DURATION * FPS;
  for (let i = 0; i < frames; i += 1) {
    if (failure) throw failure;
    drawReelFrame(ctx, reel, img, i / FPS);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    videoEncoder.encode(frame, { keyFrame: i % FPS === 0 });
    frame.close();
    await drain(videoEncoder, 6);
    if (i % 6 === 0) onProgress((i / frames) * 0.9);
  }

  const { left, right } = synthTrack(DURATION);
  for (let at = 0; at < left.length; at += AUDIO_CHUNK) {
    const n = Math.min(AUDIO_CHUNK, left.length - at);
    const planar = new Float32Array(n * 2);
    planar.set(left.subarray(at, at + n), 0);
    planar.set(right.subarray(at, at + n), n);
    const data = new AudioData({
      format: 'f32-planar', sampleRate: SAMPLE_RATE, numberOfFrames: n, numberOfChannels: 2,
      timestamp: Math.round((at * 1e6) / SAMPLE_RATE), data: planar,
    });
    audioEncoder.encode(data);
    data.close();
    await drain(audioEncoder, 16);
  }

  await videoEncoder.flush();
  await audioEncoder.flush();
  if (failure) throw failure;
  muxer.finalize();
  onProgress(1);
  return { blob: new Blob([target.buffer], { type: 'video/mp4' }), width: W, height: H, seconds: DURATION };
}
