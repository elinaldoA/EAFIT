import { useEffect, useState } from 'react';
import { useToast } from '../../context/useToast';
import { todayDate } from '../../data/treinoData';
import { RUN_SAVED_EVENT, canEditMeasures, editFormFrom, editRun, updateRun, fetchShoes, cachedShoes } from './runs';
import { ShoePicker } from './Shoes';

import { t } from '../../lib/i18n';
// Editar uma corrida já salva. Título, notas, esforço, quem vê e tênis valem
// para qualquer corrida; data, distância e tempo só para a lançada à mão
// (a do GPS tem parciais e percurso que deixariam de bater).
export default function EditRunForm({ userId, run, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState(() => editFormFrom(run));
  const [busy, setBusy] = useState(false);
  const [shoes, setShoes] = useState(() => cachedShoes(userId));
  useEffect(() => {
    let alive = true;
    fetchShoes(userId).then(list => { if (alive) setShoes(list); });
    return () => { alive = false; };
  }, [userId]);
  const measures = canEditMeasures(run);
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const field = (key, label, props = {}) => (
    <div className="profile-field">
      <label className="profile-field__label" htmlFor={`runEdit-${key}`}>{label}</label>
      <input id={`runEdit-${key}`} className="input" value={form[key]} onChange={e => set(key, e.target.value)} {...props} />
    </div>
  );

  async function handleSave(e) {
    e.preventDefault();
    const { patch, error } = editRun(run, form);
    if (error) return toast(error);
    setBusy(true);
    try {
      await updateRun(userId, run, patch);
      window.dispatchEvent(new CustomEvent(RUN_SAVED_EVENT));
      toast(t('✅ Corrida atualizada'));
      onClose();
    } catch (err) {
      console.error('updateRun:', err);
      toast(t('⚠️ Não foi possível salvar — tente novamente'));
      setBusy(false);
    }
  }

  return (
    <form className="run-item__edit" onSubmit={handleSave} aria-label={t('Editar corrida')}>
      {field('title', t('Título'), { maxLength: 80 })}
      {measures ? (
        <>
          <div className="run-manual__row">
            {field('date', t('Data'), { type: 'date', max: todayDate() })}
            {field('time', t('Início'), { type: 'time' })}
          </div>
          {field('km', t('Distância (km)'), { inputMode: 'decimal' })}
          <div className="profile-field">
            <span className="profile-field__label" id="runEditTime">{t('Tempo')}</span>
            <div className="run-manual__clock" role="group" aria-labelledby="runEditTime">
              {[['hours', t('h')], ['minutes', t('min')], ['seconds', t('s')]].map(([key, unit]) => (
                <input
                  key={key} className="input" inputMode="numeric" placeholder={unit} aria-label={unit}
                  value={form[key]} onChange={e => set(key, e.target.value.replace(/\D/g, '').slice(0, 2))}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="profile-field__hint">{t('Distância e tempo vieram do GPS e não mudam, para os parciais, o mapa e os recordes continuarem batendo.')}</p>
      )}
      <ShoePicker id="runEditShoe" shoes={shoes} value={form.shoeId} onChange={v => set('shoeId', v)} />
      <div className="profile-field">
        <span className="profile-field__label" id="runEditEffort">{t('Esforço (1 a 10)')}</span>
        <div className="run-chips" role="group" aria-labelledby="runEditEffort">
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
            <button
              key={n} type="button" aria-pressed={form.effort === n} className={`run-chip${form.effort === n ? ' run-chip--on' : ''}`}
              onClick={() => set('effort', form.effort === n ? null : n)}
            >{n}</button>
          ))}
        </div>
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="runEdit-notes">{t('Notas')}</label>
        <textarea id="runEdit-notes" className="input" rows={3} maxLength={500} value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      <div className="profile-field">
        <span className="profile-field__label" id="runEditVis">{t('Quem vê')}</span>
        <div className="run-chips" role="group" aria-labelledby="runEditVis">
          {[['amigos', t('👥 Amigos')], ['privado', t('🔒 Só eu')]].map(([v, label]) => (
            <button key={v} type="button" aria-pressed={form.visibility === v} className={`run-chip${form.visibility === v ? ' run-chip--on' : ''}`} onClick={() => set('visibility', v)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="run-setup__actions">
        <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>{t('Cancelar')}</button>
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? t('Salvando…') : t('Salvar')}</button>
      </div>
    </form>
  );
}
