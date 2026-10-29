import { useEffect, useMemo, useRef, useState } from 'react';
import { searchFoods, portionOf } from '../data/foodDatabase';
import { lookupBarcode, isBarcode } from '../lib/openFoodFacts';
import { t } from '../lib/i18n';
import { trackFeature, trackEvent } from '../lib/tracking';

const canScan = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

// Lê códigos de barras pela câmera (BarcodeDetector: Chrome/Edge no Android e
// Mac). Sem suporte, o botão não aparece e fica o campo para digitar o código.
function Scanner({ onCode, onClose }) {
  const video = useRef(null);
  useEffect(() => {
    let stream; let stop = false; let timer;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stop) { stream.getTracks().forEach(tr => tr.stop()); return; }
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a'] });
        const tick = async () => {
          if (stop) return;
          try {
            const found = await detector.detect(video.current);
            if (found[0]?.rawValue) { onCode(found[0].rawValue); return; }
          } catch { /* quadro sem código: tenta de novo */ }
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch {
        onClose(true);
      }
    })();
    return () => {
      stop = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(tr => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="food-search__scan">
      <video ref={video} muted playsInline />
      <button type="button" className="link-btn" onClick={() => onClose(false)}>{t('Fechar câmera')}</button>
    </div>
  );
}

export default function FoodSearch({ onAdd }) {
  const [query, setQuery] = useState('');
  const [code, setCode] = useState('');
  const [picked, setPicked] = useState(null);
  const [grams, setGrams] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [scanning, setScanning] = useState(false);

  const results = useMemo(() => searchFoods(query), [query]);
  const macros = picked ? portionOf(picked, grams) : null;

  function pick(food) {
    setPicked(food);
    setGrams(String(food.portion));
    setMsg('');
  }

  async function findCode(value) {
    const c = value.trim();
    setScanning(false);
    if (!isBarcode(c)) { setMsg(t('Código inválido. Use os 8 a 14 números do código de barras.')); return; }
    setBusy(true);
    setMsg('');
    try {
      const food = await lookupBarcode(c);
      if (food) pick(food);
      else {
        trackEvent('barcode_miss', c);
        setMsg(t('Produto não encontrado. Procure pelo nome ou use "+ Outro alimento".'));
      }
    } catch (err) {
      console.error('lookupBarcode:', err);
      setMsg(t('Não foi possível consultar o código agora. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    if (!picked || !(Number(grams) > 0)) return;
    trackFeature(String(picked.id).startsWith('off') ? 'barcode' : 'food_search');
    onAdd({ icon: picked.icon, label: `${picked.name} ${Number(grams)}g`, ...macros });
    setPicked(null);
    setQuery('');
    setCode('');
    setGrams('');
  }

  return (
    <div className="food-search">
      <input
        type="search" className="food-search__input" value={query} maxLength={40}
        placeholder={t('Buscar alimento (ex.: arroz, frango)')} aria-label={t('Buscar alimento')}
        onChange={e => { setQuery(e.target.value); setPicked(null); }}
      />
      {!picked && results.length > 0 && (
        <ul className="food-search__list">
          {results.map(f => (
            <li key={f.id}>
              <button type="button" onClick={() => pick(f)}>
                <span aria-hidden="true">{f.icon}</span> {f.name}
                <small>{t('{kcal} kcal por 100 g', { kcal: f.kcal })}{f.source === 'taco' && ' · TACO'}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!picked && query.trim() && results.length === 0 && (
        <p className="dash-card__subtitle">{t('Nada encontrado. Use "+ Outro alimento" para digitar os valores.')}</p>
      )}

      <div className="food-search__code">
        <input
          type="text" inputMode="numeric" value={code} maxLength={14}
          placeholder={t('Código de barras')} aria-label={t('Código de barras')}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
        />
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy || !code} onClick={() => findCode(code)}>
          {busy ? t('Buscando…') : t('Buscar código')}
        </button>
        {canScan() && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setScanning(s => !s)}>📷 {t('Ler')}</button>
        )}
      </div>
      {scanning && <Scanner onCode={findCode} onClose={failed => { setScanning(false); if (failed) setMsg(t('Não foi possível abrir a câmera.')); }} />}
      {msg && <p className="dash-card__subtitle" role="status">{msg}</p>}

      {picked && (
        <form className="custom-food food-search__pick" onSubmit={submit}>
          <p className="custom-food__name"><strong>{picked.icon} {picked.name}</strong></p>
          <label>
            {t('Quantidade (g)')}
            <input type="number" inputMode="numeric" min="1" max="2000" value={grams} onChange={e => setGrams(e.target.value)} />
          </label>
          <p className="food-search__macros">
            {t('{kcal} kcal · {g} g prot · {carbs} g carbo · {fat} g gord', { kcal: macros.kcal, g: macros.g, carbs: macros.carbs, fat: macros.fat })}
          </p>
          <button type="submit" className="btn btn--sm custom-food__submit" disabled={!(Number(grams) > 0)}>{t('Adicionar')}</button>
          <button type="button" className="link-btn" onClick={() => setPicked(null)}>{t('Cancelar')}</button>
        </form>
      )}
    </div>
  );
}
