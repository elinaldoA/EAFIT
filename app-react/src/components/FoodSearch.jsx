import { useEffect, useMemo, useRef, useState } from 'react';
import { searchFoods, portionOf } from '../data/foodDatabase';
import { measuresFor } from '../data/householdMeasures';
import { lookupBarcode, isBarcode } from '../lib/openFoodFacts';
import { canUseCamera, createBarcodeDetector } from '../lib/barcodeScan';
import { t, locale } from '../lib/i18n';
import { trackFeature, trackEvent } from '../lib/tracking';

// Lê códigos de barras pela câmera (lib/barcodeScan: leitor do navegador ou
// zxing no Safari/iPhone). Sem câmera, o botão não aparece e fica o campo para
// digitar o código.
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
        const detector = await createBarcodeDetector();
        const tick = async () => {
          if (stop) return;
          try {
            const code = await detector.detect(video.current);
            if (code) { onCode(code); return; }
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
  // Quantidade na medida escolhida: gramas (measure = -1) ou uma medida caseira.
  const [amount, setAmount] = useState('');
  const [measure, setMeasure] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [scanning, setScanning] = useState(false);

  const results = useMemo(() => searchFoods(query), [query]);
  const measures = useMemo(() => (picked ? measuresFor(picked.ptName || picked.name) : []), [picked]);
  const unit = measures[measure];
  const grams = Math.round((Number(amount) || 0) * (unit ? unit.grams : 1));
  const macros = picked ? portionOf(picked, grams) : null;

  function pick(food) {
    setPicked(food);
    setMeasure(-1);
    setAmount(String(food.portion));
    setMsg('');
  }

  // Trocar a medida mantém o peso perto do que já estava (arredonda em meia medida).
  function changeMeasure(i) {
    const next = measures[i];
    setMeasure(i);
    setAmount(String(next ? Math.max(0.5, Math.round((grams / next.grams) * 2) / 2) : grams || picked.portion));
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
    if (!picked || !(grams > 0)) return;
    trackFeature(String(picked.id).startsWith('off') ? 'barcode' : 'food_search');
    onAdd({ icon: picked.icon, label: `${picked.name} ${grams}g`, ...macros });
    setPicked(null);
    setQuery('');
    setCode('');
    setAmount('');
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
        {canUseCamera() && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setScanning(s => !s)}>📷 {t('Ler')}</button>
        )}
      </div>
      {scanning && <Scanner onCode={findCode} onClose={failed => { setScanning(false); if (failed) setMsg(t('Não foi possível abrir a câmera.')); }} />}
      {msg && <p className="dash-card__subtitle" role="status">{msg}</p>}

      {picked && (
        <form className="custom-food food-search__pick" onSubmit={submit}>
          <p className="custom-food__name"><strong>{picked.icon} {picked.name}</strong></p>
          {measures.length > 0 && (
            <label className="food-search__measure">
              {t('Medida')}
              <select value={measure} onChange={e => changeMeasure(Number(e.target.value))}>
                <option value={-1}>{t('gramas')}</option>
                {measures.map((m, i) => <option key={m.label} value={i}>{t('{label} ({g} g)', { label: m.label, g: m.grams })}</option>)}
              </select>
            </label>
          )}
          <label>
            {unit ? t('Quantidade') : t('Quantidade (g)')}
            <input
              type="number" inputMode="decimal" min={unit ? 0.5 : 1} step={unit ? 0.5 : 1} max={unit ? 50 : 2000}
              value={amount} onChange={e => setAmount(e.target.value)}
            />
          </label>
          <p className="food-search__macros">
            {unit && <>{t('{g} g', { g: grams })} · </>}
            {t('{kcal} kcal · {g} g prot · {carbs} g carbo · {fat} g gord', { kcal: macros.kcal, g: macros.g, carbs: macros.carbs, fat: macros.fat })}
            {macros.fiber !== undefined && (
              <small className="food-search__micros">
                {t('{fiber} g de fibra · {sodium} mg de sódio', { fiber: macros.fiber.toLocaleString(locale), sodium: macros.sodium.toLocaleString(locale) })}
              </small>
            )}
          </p>
          <button type="submit" className="btn btn--sm custom-food__submit" disabled={!(grams > 0)}>{t('Adicionar')}</button>
          <button type="button" className="link-btn" onClick={() => setPicked(null)}>{t('Cancelar')}</button>
        </form>
      )}
    </div>
  );
}
