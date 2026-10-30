import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/useAuth';
import { getModalRoot } from '../lib/modalRoot';
import { useBackToClose } from '../hooks/useBackToClose';
import { fmtDate } from '../lib/utils';
import { todayDate } from '../data/treinoData';
import { parseImportSource, saveImportedSessions, summarizeImport } from '../lib/workoutImport';
import { readWorkoutFile } from '../lib/workoutImportFiles';

import { t } from '../lib/i18n';

const PARSE_ERRORS = {
  empty: 'O arquivo está vazio.',
  none: 'Não encontrei treinos no arquivo. Ele precisa ter o nome do exercício e as séries (ex.: “Supino 4x10 40kg”) ou as colunas de data e exercício, como no CSV do Strong e do Hevy.',
};

const FILE_ERRORS = {
  size: 'Arquivo grande demais (máximo 5 MB).',
  'size-scan': 'Arquivo grande demais (máximo 20 MB).',
  xls: 'Esse formato de planilha não é lido. Salve como .xlsx ou CSV e tente de novo.',
  xlsx: 'Não consegui abrir a planilha. Salve de novo como .xlsx ou CSV.',
  json: 'O JSON não está num formato válido.',
  image: 'Não consegui abrir a imagem. Tente uma foto em JPG ou PNG.',
  ocr: 'Não consegui carregar a leitura de fotos. Verifique a internet e tente de novo.',
};

const ACCEPT = '.csv,.tsv,.txt,.xlsx,.json,.pdf,image/*,text/csv,text/plain,application/pdf,application/json';

// Importa treinos feitos fora do app para o histórico: CSV/TSV/TXT, planilha
// .xlsx, JSON, PDF ou foto da ficha (lida por OCR no próprio aparelho).
// onImported é chamado depois de gravar, pra tela recarregar o mês.
export default function ImportWorkoutsModal({ onImported, onClose }) {
  useBackToClose(onClose);
  const { user } = useAuth();
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const [source, setSource] = useState(null);
  const [fallbackDate, setFallbackDate] = useState(todayDate);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(null); // { step, progress } enquanto lê
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const parsed = useMemo(() => (source ? parseImportSource(source, fallbackDate) : null), [source, fallbackDate]);
  const parseError = parsed?.error ? t(PARSE_ERRORS[parsed.error] || PARSE_ERRORS.none) : '';
  const ready = parsed && !parsed.error ? parsed : null;
  const busy = saving || !!reading;

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(''); setSource(null); setResult(null);
    setFileName(file.name || t('Foto'));
    setReading({ step: 'file', progress: 0 });
    try {
      setSource(await readWorkoutFile(file, setReading));
    } catch (err) {
      console.error('ImportWorkoutsModal:', err);
      setError(t(FILE_ERRORS[err?.code] || 'Não consegui ler o arquivo.'));
    } finally {
      setReading(null);
    }
  }

  async function handleImport() {
    if (!user || !ready || saving) return;
    setSaving(true); setError('');
    try {
      const res = await saveImportedSessions(user.id, ready.sessions);
      setResult(res);
      setSource(null);
      if (res.imported > 0) onImported?.();
    } catch (err) {
      console.error('saveImportedSessions:', err);
      setError(t('⚠️ Erro ao importar. Tente de novo.'));
    } finally {
      setSaving(false);
    }
  }

  const totals = ready ? summarizeImport(ready.sessions) : null;
  const first = ready?.sessions[ready.sessions.length - 1]?.date;
  const last = ready?.sessions[0]?.date;
  const pct = reading ? Math.round((reading.progress || 0) * 100) : 0;
  const readingLabel = !reading ? ''
    : reading.step === 'ocr-load' ? t('Preparando a leitura da foto… (só na primeira vez demora mais)')
    : reading.step === 'ocr' ? t('Lendo o texto… {pct}%', { pct })
    : reading.step === 'pdf' ? t('Lendo o PDF…')
    : t('Lendo o arquivo…');

  return createPortal(
    <div className="rating-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div className="rating-modal__backdrop" onClick={onClose} />
      <div className="rating-modal__panel">
        <div className="rating-modal__header">
          <h3 className="rating-modal__title" id="import-title">{t('📥 Importar treinos')}</h3>
          <button type="button" className="rating-modal__close" aria-label={t('Fechar')} onClick={onClose}>✕</button>
        </div>

        <p className="app-rating__text">
          {t('Treinou em outro app ou tem a ficha no papel? Escolha o CSV do Strong ou do Hevy, uma planilha (.xlsx), um PDF, um JSON, um texto ou tire uma foto da ficha. Os treinos entram no seu histórico, recordes e evolução. Dias que já têm treino registrado no app não são alterados.')}
        </p>

        <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={handleFile} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
        <div className="quick__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => cameraRef.current?.click()} disabled={busy}>
            {t('📷 Tirar foto')}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            {fileName && !result ? t('Trocar arquivo') : t('Escolher arquivo')}
          </button>
        </div>

        {reading && <p className="app-rating__text" role="status">{readingLabel}</p>}
        {(error || parseError) && <p className="app-rating__text import__error" role="alert">{error || parseError}</p>}

        {parsed?.undated && (
          <label className="app-rating__text import__date">
            {t('Não achei a data no arquivo. Em que dia foi esse treino?')}
            <input className="input input--sm" type="date" value={fallbackDate} max={todayDate()}
              onChange={e => e.target.value && setFallbackDate(e.target.value)} />
          </label>
        )}

        {totals && (
          <div className="quick__preview">
            <div className="quick__preview-title">{fileName}</div>
            <ul className="quick__changes">
              <li>{totals.treinos === 1
                ? t('1 treino, em {de}', { de: fmtDate(last) })
                : t('{n} treinos, de {de} a {ate}', { n: totals.treinos, de: fmtDate(first), ate: fmtDate(last) })}</li>
              <li>{t('{ex} exercícios · {sets} séries', { ex: totals.exercicios, sets: totals.series })}</li>
              {ready.sessions.length <= 3 && ready.sessions.flatMap(s => s.exercises).slice(0, 12).map((ex, i) => (
                <li key={i}>{ex.nome} — {describeSets(ex.sets)}</li>
              ))}
            </ul>
          </div>
        )}

        {result && (
          <div className="quick__preview" role="status">
            <div className="quick__preview-title">
              {result.imported > 0 ? t('✅ {n} treinos importados', { n: result.imported }) : t('Nenhum treino novo importado')}
            </div>
            <ul className="quick__changes">
              {result.skippedExisting > 0 && <li>{t('{n} dias já tinham treino no app e foram mantidos', { n: result.skippedExisting })}</li>}
              {result.skippedFuture > 0 && <li>{t('{n} treinos com data futura foram ignorados', { n: result.skippedFuture })}</li>}
            </ul>
          </div>
        )}

        <div className="quick__actions">
          {result ? (
            <button type="button" className="btn btn--primary btn--sm" onClick={onClose}>{t('Fechar')}</button>
          ) : ready && (
            <button type="button" className="btn btn--primary btn--sm" onClick={handleImport} disabled={busy}>
              {saving ? t('Importando…') : t('Importar {n} treinos', { n: totals.treinos })}
            </button>
          )}
        </div>
      </div>
    </div>,
    getModalRoot()
  );
}

// "3 séries · 40 kg × 10" pra conferir o que a foto/PDF virou antes de gravar.
function describeSets(sets) {
  const s = sets[0];
  const what = s.reps ? `${s.carga ? `${s.carga} kg × ` : ''}${s.reps}`
    : s.distanciaKm ? `${s.distanciaKm} km` : s.duracaoS ? `${s.duracaoS} s` : '';
  return `${t('{n} séries', { n: sets.length })}${what ? ` · ${what}` : ''}`;
}
