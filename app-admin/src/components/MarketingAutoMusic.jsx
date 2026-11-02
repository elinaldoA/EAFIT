import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchScheduledStories, setStoryMedia, uploadMedia } from '../lib/marketing';
import { IMAGE_SEC, STORY_H, STORY_W, autoMusicStart, mediaDuration, planAutoMusic, renderStoryWithMusic } from '../lib/storyMusic';

// Publicar → música automática: põe música da biblioteca em todos os stories
// de imagem que estão na fila (agendados em lote). Monta cada vídeo aqui no
// navegador, salva na biblioteca e troca a mídia do story
// (marketing_set_story_media). Stories de vídeo ficam com o som deles.
export default function MarketingAutoMusic({ tracks, library, adminId, onDone }) {
  const [stories, setStories] = useState(null);
  const [run, setRun] = useState(null); // { done, total, updated, failed: [] }
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      setStories(await fetchScheduledStories());
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
      setStories([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const imageStories = (stories || []).filter(s => s.media?.length === 1 && s.media[0].type === 'image');
  const busy = run && run.done < run.total;

  async function start() {
    if (!window.confirm(
      `Pôr música em ${imageStories.length} story(s) de imagem agendado(s)? As ${tracks.length} música(s) da biblioteca se revezam. `
      + 'O vídeo é montado aqui: não feche a página até terminar.',
    )) return;
    setMsg('');
    // Só músicas que cobrem o story inteiro.
    const lengths = new Map();
    for (const t of tracks) lengths.set(t.id, await mediaDuration(t.url, 'audio').catch(() => 0));
    const usable = tracks.filter(t => lengths.get(t.id) >= IMAGE_SEC);
    if (!usable.length) { setMsg(`Erro: nenhuma música da biblioteca tem ${IMAGE_SEC} segundos ou mais.`); return; }

    const groups = planAutoMusic(imageStories, usable);
    const titleOf = new Map(library.map(m => [m.url, m.title]));
    const state = { done: 0, total: groups.length, updated: 0, failed: [] };
    setRun({ ...state });
    for (const g of groups) {
      try {
        const { blob } = await renderStoryWithMusic({
          mediaUrl: g.imageUrl, mediaType: 'image', musicUrl: g.track.url,
          start: autoMusicStart(lengths.get(g.track.id), IMAGE_SEC), duration: IMAGE_SEC,
        });
        const title = `Story com música · ${titleOf.get(g.imageUrl) || 'arte'} · ${g.track.title || 'música'}`.slice(0, 120);
        const { url } = await uploadMedia({
          file: new File([blob], 'story-musica.mp4', { type: 'video/mp4' }), title, width: STORY_W, height: STORY_H, adminId,
        });
        for (const id of g.postIds) {
          try {
            await setStoryMedia(id, [{ type: 'video', url, music: g.track.title || '', source: g.imageUrl }]);
            state.updated += 1;
          } catch (err) {
            state.failed.push(err.message); // já saiu ou o worker pegou: fica como estava
          }
        }
      } catch (err) {
        state.failed.push(err.message);
      }
      state.done += 1;
      setRun({ ...state, failed: [...state.failed] });
    }
    setMsg(state.failed.length
      ? `Erro: ${state.updated} story(s) com música; ${state.failed.length} falha(s) (${state.failed[0]}).`
      : `${state.updated} story(s) agendado(s) agora saem com música.`);
    await load();
    onDone();
  }

  return (
    <section className="card stack">
      <h2 className="section-title">Música automática nos stories</h2>
      <p className="user-detail__meta">
        Põe as músicas da biblioteca, se revezando, em todos os stories de imagem que estão na fila. Stories de vídeo ficam
        com o som que já têm. Rode de novo depois de agendar um lote novo.
      </p>
      {stories === null ? <p className="user-detail__meta">Carregando a fila…</p> : (
        <p className="user-detail__meta">
          Na fila: {imageStories.length} story(s) de imagem sem música · {tracks.length} música(s) na biblioteca.
        </p>
      )}
      {tracks.length === 0 && (
        <p className="user-detail__meta">Suba as músicas (MP3 ou M4A) em <Link to="/marketing-midia">Biblioteca de mídia</Link>.</p>
      )}
      <div className="actions-row">
        <button type="button" className="btn btn--primary" disabled={busy || !tracks.length || !imageStories.length} onClick={start}>
          {busy ? `Montando ${run.done + 1} de ${run.total}…` : `Pôr música em ${imageStories.length} story(s)`}
        </button>
      </div>
      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
    </section>
  );
}
