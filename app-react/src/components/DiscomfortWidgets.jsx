import { useEffect, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { fmtDate } from '../lib/utils';
import { fetchRecentDiscomfort, logDiscomfort, summarizeDiscomfortByExercise } from '../lib/discomfort';

import { t, tEx } from '../lib/i18n';
const DISCOMFORT_LABELS = { leve: t('Leve'), moderada: t('Moderada'), forte: t('Forte'), lesao: t('Lesão') };

export function DiscomfortPanel({ userId, exerciseName, toast }) {
  const [discomfort, setDiscomfort] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [severity, setSeverity] = useState('leve');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId || !exerciseName) return;
    let cancelled = false;
    setReportOpen(false);
    fetchRecentDiscomfort(userId, exerciseName)
      .then(d => { if (!cancelled) setDiscomfort(d); })
      .catch(err => console.error('fetchRecentDiscomfort:', err));
    return () => { cancelled = true; };
  }, [userId, exerciseName]);

  async function handleSave() {
    setSaving(true);
    try {
      await logDiscomfort(userId, exerciseName, todayDate(), severity, note);
      setDiscomfort({ severity, note: note.trim() || null, log_date: todayDate() });
      setReportOpen(false);
      setNote('');
      toast(t('✅ Desconforto registrado'));
    } catch (err) {
      console.error('logDiscomfort:', err);
      toast(t('❌ Erro ao registrar desconforto'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="discomfort-panel">
      {discomfort && (
        <p className="discomfort-panel__alert">
          {t('🩹 Desconforto')} {DISCOMFORT_LABELS[discomfort.severity]} {t('relatado em')} {fmtDate(discomfort.log_date)}
          {' '}<span className="discomfort-panel__hint">{t('— considere reduzir a carga ou trocar o exercício')}</span>
        </p>
      )}
      <button type="button" className="discomfort-panel__toggle" onClick={() => setReportOpen(o => !o)}>
        {reportOpen ? t('Cancelar') : t('⚠️ Reportar desconforto neste exercício')}
      </button>
      {reportOpen && (
        <div className="discomfort-panel__form">
          <select className="input input--sm" value={severity} onChange={e => setSeverity(e.target.value)}>
            <option value="leve">{t('Leve')}</option>
            <option value="moderada">{t('Moderada')}</option>
            <option value="forte">{t('Forte')}</option>
            <option value="lesao">{t('Lesão')}</option>
          </select>
          <input
            type="text" className="input input--sm" placeholder={t('Nota (opcional)')}
            value={note} onChange={e => setNote(e.target.value)}
          />
          <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSave}>
            {t('Salvar')}
          </button>
        </div>
      )}
    </div>
  );
}

// Histórico agregado de todos os relatos de desconforto — diferente do
// DiscomfortPanel (que só mostra o relato mais recente do exercício
// selecionado no picker), fica sempre visível pra evidenciar reincidência.
export function DiscomfortHistory({ reports }) {
  if (!reports.length) {
    return <p className="dash-empty">{t('Nenhum desconforto relatado ainda.')}</p>;
  }

  const countByExercise = new Map(
    summarizeDiscomfortByExercise(reports).map(s => [s.exerciseName, s.count])
  );

  return (
    <div className="discomfort-history">
      {reports.map(r => {
        const count = countByExercise.get(r.exercise_name) || 1;
        return (
          <div className="discomfort-history__row" key={r.id}>
            <div className="discomfort-history__top">
              <span className="discomfort-history__name">
                {tEx(r.exercise_name)}
                {count > 1 && <span className="discomfort-history__badge">×{count}</span>}
              </span>
              <span className={`discomfort-history__severity discomfort-history__severity--${r.severity}`}>
                {DISCOMFORT_LABELS[r.severity]}
              </span>
              <span className="discomfort-history__date">{fmtDate(r.log_date)}</span>
            </div>
            {r.note && <p className="discomfort-history__note">{r.note}</p>}
          </div>
        );
      })}
    </div>
  );
}
