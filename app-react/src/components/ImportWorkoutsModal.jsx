import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/useAuth';
import { getModalRoot } from '../lib/modalRoot';
import { useBackToClose } from '../hooks/useBackToClose';
import { fmtDate } from '../lib/utils';
import { MAX_IMPORT_BYTES, parseWorkoutCSV, saveImportedSessions, summarizeImport } from '../lib/workoutImport';

import { t } from '../lib/i18n';

const PARSE_ERRORS = {
  empty: 'O arquivo está vazio.',
  columns: 'Não achei as colunas de data e exercício. Use o CSV exportado pelo Strong ou pelo Hevy.',
  none: 'Nenhuma série válida encontrada no arquivo.',
};

// Importa treinos feitos fora do app (CSV do Strong/Hevy) para o histórico.
// onImported é chamado depois de gravar, pra tela recarregar o mês.
export default function ImportWorkoutsModal({ onImported, onClose }) {
  useBackToClose(onClose);
  const { user } = useAuth();
  const inputRef = useRef(null);
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(''); setParsed(null); setResult(null);
    if (file.size > MAX_IMPORT_BYTES) { setError(t('Arquivo grande demais (máximo 5 MB).')); return; }
    try {
      const out = parseWorkoutCSV(await file.text());
      setFileName(file.name);
      if (out.error) setError(t(PARSE_ERRORS[out.error]));
      else setParsed(out);
    } catch (err) {
      console.error('ImportWorkoutsModal:', err);
      setError(t('Não consegui ler o arquivo.'));
    }
  }

  async function handleImport() {
    if (!user || !parsed || saving) return;
    setSaving(true); setError('');
    try {
      const res = await saveImportedSessions(user.id, parsed.sessions);
      setResult(res);
      setParsed(null);
      if (res.imported > 0) onImported?.();
    } catch (err) {
      console.error('saveImportedSessions:', err);
      setError(t('⚠️ Erro ao importar. Tente de novo.'));
    } finally {
      setSaving(false);
    }
  }

  const totals = parsed ? summarizeImport(parsed.sessions) : null;
  const first = parsed?.sessions[parsed.sessions.length - 1]?.date;
  const last = parsed?.sessions[0]?.date;

  return createPortal(
    <div className="rating-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div className="rating-modal__backdrop" onClick={onClose} />
      <div className="rating-modal__panel">
        <div className="rating-modal__header">
          <h3 className="rating-modal__title" id="import-title">{t('📥 Importar treinos')}</h3>
          <button type="button" className="rating-modal__close" aria-label={t('Fechar')} onClick={onClose}>✕</button>
        </div>

        <p className="app-rating__text">
          {t('Treinou em outro app? Exporte o histórico em CSV (Strong ou Hevy) e escolha o arquivo aqui. Os treinos entram no seu histórico, recordes e evolução. Dias que já têm treino registrado no app não são alterados.')}
        </p>

        <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={handleFile} />
        <div className="quick__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => inputRef.current?.click()} disabled={saving}>
            {fileName && !result ? t('Trocar arquivo') : t('Escolher arquivo CSV')}
          </button>
        </div>

        {error && <p className="app-rating__text import__error" role="alert">{error}</p>}

        {totals && (
          <div className="quick__preview">
            <div className="quick__preview-title">{fileName}</div>
            <ul className="quick__changes">
              <li>{t('{n} treinos, de {de} a {ate}', { n: totals.treinos, de: fmtDate(first), ate: fmtDate(last) })}</li>
              <li>{t('{ex} exercícios · {sets} séries', { ex: totals.exercicios, sets: totals.series })}</li>
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
          ) : parsed && (
            <button type="button" className="btn btn--primary btn--sm" onClick={handleImport} disabled={saving}>
              {saving ? t('Importando…') : t('Importar {n} treinos', { n: totals.treinos })}
            </button>
          )}
        </div>
      </div>
    </div>,
    getModalRoot()
  );
}
