// Versões PÓS-lançamento dos conteúdos educativos do Run que, sem isso, ficariam sem sair: os itens "Em breve"
// somem quando o módulo liga (hide_when_module = 'corrida') e a faixa de feed só tem 4 posts até 1/12.
// Aqui os mesmos carrosséis e Reels ganham uma versão que só sai com o módulo ligado
// (requires_module = 'corrida'): reaproveita os slides de conteúdo e troca o fecho e a legenda, sem "Em breve".
//
//   node app-admin/scripts/marketing-corrida-pos-lancamento.mjs        (precisa do ffmpeg no PATH)
//
// Saída: <chave>-pos-<n>.jpg e reel-<chave>-pos.mp4 em app-react/public/landing/img/marketing/ e a migration
// supabase/migrations/20270304080000_marketing_corrida_pos_lancamento.sql.
import { loadImage } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeWav } from './marketing-reels-audio.mjs';
import { printArt } from './marketing-autopost-content.mjs';
import { audioPlan, renderVideo } from './marketing-corrida-launch.mjs';
import { CAROUSELS, REELS } from './marketing-corrida-educativo.mjs';
import { DURATION, drawReelFrame } from '../src/lib/reelRender.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRINTS = join(root, 'app-react', 'public', 'landing', 'img', 'app');
const OUT = join(root, 'app-react', 'public', 'landing', 'img', 'marketing');
const SITE = 'https://eafit.com.br';
const TAGS = '#corrida #corridaderua #running #EAFIT';
const CTA = 'Abra o app e escolha Corrida em Perfil › Meu esporte. Link na bio. 🏃';

// chave do carrossel → [fecho do último slide, legenda sem "em breve"]
const POS = {
  'corrida-edu-mitos': ['Corra com plano no EAFIT Run.', 'Quantos desses mitos você já ouviu? 🤔\nSalve este post e mande para quem diz que não nasceu para correr. No EAFIT Run, corra com plano e registre cada corrida.'],
  'corrida-edu-aquecimento': ['Registre cada corrida no EAFIT Run.', 'Cinco minutos de aquecimento mudam a sua corrida. 🔥\nSalve este roteiro e use antes de calçar o tênis. No EAFIT Run, registre cada corrida.'],
  'corrida-edu-forca': ['Corrida e força no mesmo app.', 'Quem corre e treina força corre melhor. 💪\nNo EAFIT: programa de corrida com treino de força para corredor.'],
  'corrida-edu-lesao': ['Evolua com plano no EAFIT Run.', 'Correr por mais tempo começa por se cuidar. 🩹\nSalve estas dicas para consultar sempre. No EAFIT Run: programa com plano e descanso.'],
  'corrida-edu-tenis': ['Acompanhe os km do tênis no EAFIT Run.', 'Tênis certo, corrida mais confortável. 👟\nSalve este guia antes da próxima compra. No EAFIT Run: km de cada tênis.'],
  'corrida-edu-pre-corrida': ['Grave a corrida no EAFIT Run.', 'Preparação simples, corrida melhor. ⏱️\nSalve este checklist para o dia da prova. No EAFIT Run: grave a corrida.'],
  'corrida-edu-primeira-prova': ['Veja as próximas corridas no app.', 'A primeira prova não precisa dar medo. 🏁\nO EAFIT Run mostra as próximas corridas do seu estado para você escolher a sua.'],
};

// Reels: mesma cena, chamada final "Já no app" (e sem o "Em breve" do subtítulo).
const REEL_KEYS = ['corrida-edu-mitos', 'corrida-edu-forca', 'corrida-edu-primeira-prova'];
const REEL_CAPTION = {
  'corrida-edu-mitos': POS['corrida-edu-mitos'][1],
  'corrida-edu-forca': POS['corrida-edu-forca'][1],
  'corrida-edu-primeira-prova': POS['corrida-edu-primeira-prova'][1],
};

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;
const mediaImg = (files) => JSON.stringify(files.map((f) => ({ type: 'image', url: `${SITE}/img/marketing/${f}` })));
const mediaVid = (file) => JSON.stringify([{ type: 'video', url: `${SITE}/img/marketing/${file}` }]);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const feeds = [];
  for (const c of CAROUSELS) {
    const pos = POS[c.key];
    if (!pos) throw new Error(`sem versão pós-lançamento para ${c.key}`);
    const kept = [`${c.key}-1.jpg`, ...c.slides.map((_, i) => `${c.key}-${i + 2}.jpg`)];
    const last = `${c.key}-pos-${c.slides.length + 2}.jpg`;
    writeFileSync(join(OUT, last), await printArt({ headline: pos[0], sub: 'Já no app · Perfil › Meu esporte', print: 'run-inicio' }, 'feed', 'eafit.com.br'));
    feeds.push({ key: `${c.key}-pos-feed`, format: 'feed', caption: `${pos[1]}\n\n${CTA}\n\n${TAGS}`, media: mediaImg([...kept, last]) });
    console.log('ok', last);
  }

  const plan = await audioPlan(3);
  const wav = join(tmpdir(), 'eafit-reel-corrida-edu-pos.wav');
  writeFileSync(wav, makeWav(DURATION, { style: 'run', bpm: 140, sweeps: [3.4, 9.6] }));
  const reels = [];
  for (const [i, reel] of REELS.entries()) {
    if (!REEL_KEYS.includes(reel.key)) continue;
    const audio = plan.reel(i) || wav;
    const img = await loadImage(readFileSync(join(PRINTS, `${reel.print}.webp`)));
    const pos = { ...reel, sub: reel.sub.replace(/\s*Em breve\.?/i, '').trim(), ctaTitle: 'Já no app', ctaSub: 'Perfil › Meu esporte › Corrida', url: 'eafit.com.br' };
    const file = `reel-${reel.key}-pos.mp4`;
    await renderVideo(file, DURATION, audio, (ctx, im, t) => drawReelFrame(ctx, pos, im, t), img);
    reels.push({ key: `${reel.key}-pos-reel`, format: 'reel', caption: `${REEL_CAPTION[reel.key]}\n\n${CTA}\n\n${TAGS}`, media: mediaVid(file) });
    console.log('ok', file);
  }

  // Intercala feed e Reel; entram depois das peças de lançamento (posição maior).
  const items = [];
  const f = [...feeds];
  const r = [...reels];
  while (f.length || r.length) {
    if (f.length) items.push(f.shift());
    if (f.length) items.push(f.shift());
    if (r.length) items.push(r.shift());
  }
  const values = items.map((it, i) => `  (${i + 1}, ${sqlText(it.key)}, ${sqlText(it.format)}, ${sqlText(it.caption)}, ${sqlText(it.media)})`);
  const sql = `-- Marketing do Run: versões PÓS-lançamento dos educativos (carrosséis e Reels), sem "Em breve".
-- Gerado por app-admin/scripts/marketing-corrida-pos-lancamento.mjs. Só saem com o módulo ligado
-- (requires_module = 'corrida'), depois das peças de lançamento, para a faixa de feed e de Reels não ficar
-- vazia nas primeiras semanas. Os itens "Em breve" originais seguem como estão e somem quando o módulo liga.
insert into public.marketing_autopost_queue (position, key, format, caption, media, requires_module)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, v.caption, v.media::jsonb, 'corrida'
from (values
${values.join(',\n')}
) as v(n, key, format, caption, media)
where not exists (select 1 from public.marketing_autopost_queue q where q.key = v.key);
`;
  writeFileSync(join(root, 'supabase', 'migrations', '20270304080000_marketing_corrida_pos_lancamento.sql'), sql);
  console.log(`${items.length} itens (${feeds.length} feeds, ${reels.length} Reels) na migration`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
