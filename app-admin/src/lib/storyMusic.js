import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

// Música nos stories. A API da Meta não aceita o adesivo de música do
// Instagram, então a música vai dentro do vídeo: a imagem (ou o vídeo) do
// story + um trecho da música viram um MP4 9:16 (H.264 + AAC), montado aqui no
// navegador com WebCodecs. O resultado entra na biblioteca e vai como um story
// de vídeo comum.

export const STORY_W = 1080;
export const STORY_H = 1920;
export const FPS = 30;
export const MIN_SEC = 3; // Instagram e Facebook recusam story de vídeo mais curto
export const MAX_SEC = 60;
export const IMAGE_SEC = 15;
const SAMPLE_RATE = 48000;
const FADE_IN = 0.3;
const FADE_OUT = 1.5;

// Duração do story: a do vídeo (cortada em 60 s) ou a escolhida para a imagem.
export function storyDuration({ mediaType, videoSec, imageSec }) {
  if (mediaType === 'video') return videoSec ? Math.min(videoSec, MAX_SEC) : null;
  return imageSec;
}

export function validateStoryMusic({ mediaType, videoSec, imageSec, start, musicSec }) {
  const errors = [];
  const duration = storyDuration({ mediaType, videoSec, imageSec });
  if (mediaType === 'video' && !videoSec) return ['Aguarde: lendo a duração do vídeo.'];
  if (!musicSec) return ['Aguarde: lendo a duração da música.'];
  if (!(duration >= MIN_SEC && duration <= MAX_SEC)) errors.push(`O story com música precisa ter de ${MIN_SEC} a ${MAX_SEC} segundos.`);
  if (!(start >= 0)) errors.push('O início da música não pode ser negativo.');
  else if (start + duration > musicSec + 0.05) {
    errors.push(`A música acaba antes do story: comece em até ${formatSec(Math.max(0, musicSec - duration))}.`);
  }
  return errors;
}

// Música automática: só stories de imagem ganham música (vídeo fica com o som
// dele). As músicas da biblioteca se revezam na ordem dos horários; cada par
// arte + música vira um vídeo só, reaproveitado pelos stories iguais.
export function planAutoMusic(stories, tracks) {
  if (!tracks.length) return [];
  const groups = new Map();
  stories.filter(s => s.media?.length === 1 && s.media[0].type === 'image').forEach((s, i) => {
    const track = tracks[i % tracks.length];
    const key = `${s.media[0].url}|${track.id}`;
    if (!groups.has(key)) groups.set(key, { imageUrl: s.media[0].url, track, postIds: [] });
    groups.get(key).postIds.push(s.id);
  });
  return [...groups.values()];
}

// Pula o começo (introdução costuma ser calma): entra a 20% da música, sem
// passar do fim.
export function autoMusicStart(musicSec, duration) {
  return Math.max(0, Math.min(Math.round(musicSec * 0.2), Math.floor(musicSec - duration)));
}

export function formatSec(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Escala para caber inteiro (sem cortar texto da arte); sobra vira fundo escuro.
export function containRect(srcW, srcH, w = STORY_W, h = STORY_H) {
  const scale = Math.min(w / srcW, h / srcH);
  const dw = Math.round(srcW * scale);
  const dh = Math.round(srcH * scale);
  return { x: Math.round((w - dw) / 2), y: Math.round((h - dh) / 2), w: dw, h: dh };
}

export function mediaDuration(url, type = 'video') {
  return new Promise((resolve, reject) => {
    const el = document.createElement(type);
    el.preload = 'metadata';
    el.onloadedmetadata = () => resolve(el.duration);
    el.onerror = () => reject(new Error(type === 'audio' ? 'Não deu para ler a música.' : 'Não deu para ler o vídeo.'));
    el.src = url;
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não deu para carregar a imagem.'));
    img.src = src;
  });
}

function loadVideo(src) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error('Não deu para carregar o vídeo.'));
    v.src = src;
  });
}

function seek(video, t) {
  return new Promise(resolve => {
    video.onseeked = () => resolve();
    video.currentTime = t;
  });
}

// Trecho da música já com fade de entrada e saída, em 48 kHz estéreo.
async function musicSegment(url, start, duration) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Não deu para baixar a música.');
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(1, FADE_IN);
  gain.gain.setValueAtTime(1, Math.max(FADE_IN, duration - FADE_OUT));
  gain.gain.linearRampToValueAtTime(0, duration);
  src.connect(gain).connect(ctx.destination);
  src.start(0, start, duration);
  return ctx.startRendering();
}

async function pickVideoCodec() {
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
    throw new Error('Este navegador não monta vídeo. Use o Chrome ou o Edge atualizados.');
  }
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028']) {
    const config = { codec, width: STORY_W, height: STORY_H, bitrate: 8_000_000, framerate: FPS, avc: { format: 'avc' } };
    if ((await VideoEncoder.isConfigSupported(config)).supported) return config;
  }
  throw new Error('Este navegador não grava vídeo H.264. Use o Chrome ou o Edge atualizados.');
}

const AUDIO_CONFIG = { codec: 'mp4a.40.2', sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 128_000 };

// Monta o MP4 do story. onProgress recebe de 0 a 1.
export async function renderStoryWithMusic({ mediaUrl, mediaType, musicUrl, start, duration, onProgress = () => {} }) {
  const videoConfig = await pickVideoCodec();
  if (!(await AudioEncoder.isConfigSupported(AUDIO_CONFIG)).supported) {
    throw new Error('Este navegador não grava áudio AAC. Use o Chrome ou o Edge atualizados.');
  }

  const [audio, source] = await Promise.all([
    musicSegment(musicUrl, start, duration),
    mediaType === 'video' ? loadVideo(mediaUrl) : loadImage(mediaUrl),
  ]);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: STORY_W, height: STORY_H, frameRate: FPS },
    audio: { codec: 'aac', numberOfChannels: 2, sampleRate: SAMPLE_RATE },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let failure = null;
  const videoEncoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { failure = e; } });
  const audioEncoder = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: e => { failure = e; } });
  videoEncoder.configure(videoConfig);
  audioEncoder.configure(AUDIO_CONFIG);

  // Áudio: blocos de 1024 amostras, planar.
  const frames = audio.length;
  const left = audio.getChannelData(0);
  const right = audio.getChannelData(1);
  for (let i = 0; i < frames; i += 1024) {
    const n = Math.min(1024, frames - i);
    const data = new Float32Array(n * 2);
    data.set(left.subarray(i, i + n), 0);
    data.set(right.subarray(i, i + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: SAMPLE_RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / SAMPLE_RATE) * 1e6), data });
    audioEncoder.encode(ad);
    ad.close();
  }

  const canvas = new OffscreenCanvas(STORY_W, STORY_H);
  const ctx = canvas.getContext('2d');
  const srcW = mediaType === 'video' ? source.videoWidth : source.naturalWidth;
  const srcH = mediaType === 'video' ? source.videoHeight : source.naturalHeight;
  const rect = containRect(srcW, srcH);
  const draw = () => {
    ctx.fillStyle = '#0e0e12';
    ctx.fillRect(0, 0, STORY_W, STORY_H);
    ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h);
  };

  const total = Math.round(duration * FPS);
  const frameUs = 1e6 / FPS;
  if (mediaType !== 'video') draw();
  for (let i = 0; i < total; i++) {
    if (failure) throw failure;
    if (mediaType === 'video') {
      await seek(source, Math.min(i / FPS, source.duration - 0.001));
      draw();
    }
    const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
    videoEncoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();
    // Não deixa a fila do encoder crescer sem limite (memória).
    while (videoEncoder.encodeQueueSize > 10) await new Promise(r => setTimeout(r, 5));
    if (i % FPS === 0) onProgress(i / total);
  }

  await Promise.all([videoEncoder.flush(), audioEncoder.flush()]);
  videoEncoder.close();
  audioEncoder.close();
  if (failure) throw failure;
  muxer.finalize();
  onProgress(1);
  return { blob: new Blob([target.buffer], { type: 'video/mp4' }), width: STORY_W, height: STORY_H, duration };
}
