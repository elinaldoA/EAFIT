import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '../context/useAdminAuth';
import { useMediaLibrary } from '../components/marketingMedia/useMediaLibrary';
import MediaLibrary from '../components/marketingMedia/MediaLibrary';
import PrintStudio from '../components/marketingMedia/PrintStudio';
import ExerciseVideos from '../components/marketingMedia/ExerciseVideos';

// Marketing → Biblioteca de mídia: o que pode ir para as redes. Arquivos
// próprios e artes feitas dos prints do app ficam no bucket público
// marketing-media; os vídeos de exercício vêm do próprio site, com o crédito
// que a licença pede (entra sozinho na legenda). Cada item também pode ir para
// embaixadores e influenciadores (material de divulgação no app, com texto pronto).
export default function MarketingMedia() {
  const { adminUser } = useAdminAuth();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(null); // { media, title, description, audience, caption }
  const msgRef = useRef(null);
  const onLoadError = useCallback(text => setMsg(text), []);
  const { items, shared, load } = useMediaLibrary(onLoadError);

  // O resultado (ok ou erro) aparece no topo: garante que ele fique à vista.
  useEffect(() => {
    if (msg && !share) msgRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [msg, share]);

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Biblioteca de mídia</h1>
          <p className="page-subtitle">
            Imagens e vídeos prontos para postar. Os prints do app viram artes no tamanho certo de cada formato; os
            vídeos de exercício entram com o crédito do autor na legenda.
          </p>
        </div>
      </div>

      {msg && !share && <p ref={msgRef} className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`} role={msg.startsWith('Erro') ? 'alert' : 'status'}>{msg}</p>}

      <MediaLibrary
        items={items} shared={shared} load={load} msg={msg} setMsg={setMsg} busy={busy} setBusy={setBusy}
        adminId={adminUser?.id} share={share} setShare={setShare}
      />
      <PrintStudio load={load} setMsg={setMsg} busy={busy} setBusy={setBusy} adminId={adminUser?.id} />
      <ExerciseVideos />
    </div>
  );
}
