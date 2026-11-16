import { useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { fmtDate } from '../lib/utils';
import { HISTORY_DAYS, recentDays } from '../lib/nutritionDay';
import { t } from '../lib/i18n';

const EMPTY_FIX = { g: '', kcal: '', carbs: '', fat: '' };

// "Corrigir os totais de um dia" da aba Nutrição: escolhe um dos últimos dias
// (hoje inclusive), mostra o que está registrado e salva os novos totais. Quem
// guarda é a página: hoje vai por onSaveToday(totals) e os outros dias por
// onSavePast(date, totals). `todayTotals` e `logs` só preenchem o formulário.
export default function DayFixForm({ todayTotals, logs, onSaveToday, onSavePast }) {
  const [fixDate, setFixDate] = useState('');
  const [fix, setFix] = useState(EMPTY_FIX);
  const days = useMemo(() => recentDays(todayDate(), HISTORY_DAYS), []);

  function pickDate(date) {
    setFixDate(date);
    const row = date === todayDate()
      ? { amount_g: todayTotals.protein, kcal: todayTotals.kcal, carbs_g: todayTotals.carbs, fat_g: todayTotals.fat }
      : logs.find(l => l.log_date === date);
    setFix(row
      ? { g: String(row.amount_g ?? ''), kcal: String(row.kcal ?? ''), carbs: String(row.carbs_g ?? ''), fat: String(row.fat_g ?? '') }
      : EMPTY_FIX);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!fixDate) return;
    const totals = {
      protein: parseInt(fix.g, 10) || 0,
      kcal: parseInt(fix.kcal, 10) || 0,
      carbs: parseInt(fix.carbs, 10) || 0,
      fat: parseInt(fix.fat, 10) || 0,
    };
    if (fixDate === todayDate()) onSaveToday(totals);
    else onSavePast(fixDate, totals);
  }

  return (
    <form className="custom-food" onSubmit={handleSubmit}>
      <label className="custom-food__name">
        {t('Dia')}
        <select value={fixDate} onChange={e => pickDate(e.target.value)}>
          <option value="">{t('Escolha o dia')}</option>
          {days.map(d => <option key={d} value={d}>{d === todayDate() ? t('Hoje') : fmtDate(d)}</option>)}
        </select>
      </label>
      {[['kcal', t('Calorias')], ['g', t('Proteína (g)')], ['carbs', t('Carbo (g)')], ['fat', t('Gordura (g)')]].map(([k, label]) => (
        <label key={k}>
          {label}
          <input type="number" inputMode="numeric" min="0" max="5000" value={fix[k]} onChange={e => setFix(c => ({ ...c, [k]: e.target.value }))} />
        </label>
      ))}
      <button type="submit" className="btn btn--sm custom-food__submit" disabled={!fixDate}>{t('Salvar o dia')}</button>
    </form>
  );
}
