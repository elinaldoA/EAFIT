import { useEffect, useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { useToast } from '../context/useToast';
import { fmtDate } from '../lib/utils';
import {
  MEASURE_FIELDS, parseMeasure, measurementDeltas, fetchMeasurements, upsertMeasurement,
} from '../lib/bodyMeasurements';
import LineChart from './LineChart';

// Medidas corporais (cm) no Dashboard → Corpo: registro do dia, evolução de
// cada medida e a diferença desde o primeiro registro.
export default function BodyMeasurements({ userId }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState({});
  const [field, setField] = useState('cintura');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMeasurements(userId)
      .then(r => { if (active) setRows(r); })
      .catch(err => { console.error('fetchMeasurements:', err); if (active) setRows([]); });
    return () => { active = false; };
  }, [userId]);

  const deltas = useMemo(() => measurementDeltas(rows || []), [rows]);
  const points = useMemo(
    () => (rows || []).filter(r => Number.isFinite(r[field])).map(r => ({ label: fmtDate(r.measured_on), value: r[field] })),
    [rows, field],
  );

  async function handleSave() {
    const values = Object.fromEntries(MEASURE_FIELDS.map(({ key }) => [key, parseMeasure(form[key])]));
    if (MEASURE_FIELDS.every(({ key }) => values[key] === null)) { toast('Preencha ao menos uma medida'); return; }
    const today = todayDate();
    // Mantém o que já foi salvo hoje nos campos deixados em branco.
    const prev = (rows || []).find(r => r.measured_on === today) || {};
    const merged = Object.fromEntries(MEASURE_FIELDS.map(({ key }) => [key, values[key] ?? prev[key] ?? null]));
    setSaving(true);
    try {
      await upsertMeasurement(userId, today, merged);
      setRows(await fetchMeasurements(userId));
      setForm({});
      toast('📏 Medidas salvas');
    } catch (err) {
      console.error('upsertMeasurement:', err);
      toast('❌ Não foi possível salvar. Confira os valores (em cm).');
    } finally {
      setSaving(false);
    }
  }

  if (!rows) return null;
  const hasDeltas = Object.keys(deltas).length > 0;

  return (
    <div className="dash-card">
      <div className="dash-card__title">📏 Medidas corporais (cm)</div>

      <div className="measure-form">
        {MEASURE_FIELDS.map(({ key, label }) => (
          <label className="measure-form__field" key={key}>
            <span>{label}</span>
            <input
              type="text" inputMode="decimal" className="input input--sm" placeholder="cm"
              value={form[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSave}>
        {saving ? 'Salvando…' : 'Salvar medidas de hoje'}
      </button>

      {hasDeltas && (
        <ul className="measure-deltas">
          {MEASURE_FIELDS.filter(({ key }) => deltas[key]).map(({ key, label }) => {
            const d = deltas[key];
            return (
              <li key={key}>
                <span>{label}</span>
                <span>{d.first} → {d.last} cm <strong className={d.diff < 0 ? 'measure-deltas__down' : d.diff > 0 ? 'measure-deltas__up' : ''}>
                  ({d.diff > 0 ? '+' : ''}{String(d.diff).replace('.', ',')})</strong></span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="measure-chips" role="group" aria-label="Medida do gráfico">
        {MEASURE_FIELDS.map(({ key, label }) => (
          <button
            key={key} type="button" aria-pressed={field === key}
            className={field === key ? 'recap__btn recap__btn--active' : 'recap__btn'}
            onClick={() => setField(key)}
          >{label}</button>
        ))}
      </div>
      <div className="line-chart-wrap">
        <LineChart
          points={points}
          valueSuffix="cm"
          singleMsg={v => `1 registro: ${v}cm — registre de novo em outro dia para ver a evolução`}
          emptyMsg="Nenhuma medida registrada ainda."
        />
      </div>
    </div>
  );
}
