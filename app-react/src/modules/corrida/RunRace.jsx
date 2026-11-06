import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { trackEvent } from '../../lib/tracking';
import { parseLocalDate } from '../../lib/utils';
import { formatKm, decimal } from './runs';
import { programFromMetadata, normalizeLevel, GOAL_LABEL } from './program';
import {
  RACE_DISTANCES, RACE_NAME_MAX, raceFromMetadata, buildRace, daysUntil, programGoalFor,
  suggestedStart, raceReadiness, raceStage,
} from './race';
import { t, locale } from '../../lib/i18n';

const dateText = date => parseLocalDate(date).toLocaleDateString(locale, { day: 'numeric', month: 'long' });

function RaceForm({ initial, today, busy, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [date, setDate] = useState(initial?.date || '');
  const preset = initial && RACE_DISTANCES.some(d => d.km === initial.km) ? String(initial.km) : (initial ? 'outra' : '10');
  const [choice, setChoice] = useState(preset);
  const [custom, setCustom] = useState(initial && preset === 'outra' ? String(initial.km) : '');
  const [error, setError] = useState('');

  function submit() {
    const res = buildRace({ name, date, km: choice === 'outra' ? custom : choice }, today);
    if (res.error) { setError(res.error); return; }
    setError('');
    onSave(res.race);
  }

  return (
    <div className="dash-card run-setup">
      <h2 className="run-setup__title">{t('Sua prova')}</h2>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="raceName">{t('Nome da prova (opcional)')}</label>
        <input id="raceName" className="input" maxLength={RACE_NAME_MAX} value={name} onChange={e => setName(e.target.value)} placeholder={t('Ex.: Corrida da cidade')} />
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="raceDate">{t('Data')}</label>
        <input id="raceDate" type="date" className="input" min={today} value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className="profile-field">
        <span className="profile-field__label" id="raceKmLabel">{t('Distância')}</span>
        <div className="run-chips" role="group" aria-labelledby="raceKmLabel">
          {[...RACE_DISTANCES.map(d => [String(d.km), d.label]), ['outra', t('Outra')]].map(([key, label]) => (
            <button key={key} type="button" aria-pressed={choice === key} className={`run-chip${choice === key ? ' run-chip--on' : ''}`} onClick={() => setChoice(key)}>{label}</button>
          ))}
        </div>
        {choice === 'outra' && (
          <input className="input" inputMode="decimal" placeholder={t('Distância em km')} aria-label={t('Distância em km')} value={custom} onChange={e => setCustom(e.target.value)} />
        )}
      </div>
      {error && <p className="profile-field__hint text-error" role="alert">{error}</p>}
      <div className="run-setup__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>{t('Cancelar')}</button>
        <button type="button" className="btn btn--primary" onClick={submit} disabled={busy}>{busy ? t('Salvando…') : t('Salvar prova')}</button>
      </div>
    </div>
  );
}

// Aba Gravar: a prova marcada, com contagem regressiva, preparo e o programa certo.
export default function RunRace({ runs, today, onProgram }) {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const md = user?.user_metadata || {};
  const race = raceFromMetadata(md);
  const program = programFromMetadata(md);

  async function save(value) {
    setBusy(true);
    const { error } = await updateProfile({ runRace: value });
    setBusy(false);
    if (error) return toast(t('⚠️ Não foi possível salvar — tente novamente'));
    if (value) trackEvent('run_race', String(value.km));
    setEditing(false);
    toast(value ? t('🏁 Prova marcada!') : t('Prova removida'));
  }

  if (editing || !race) {
    if (!editing) {
      return (
        <button type="button" className="dash-card run-plan-cta" onClick={() => setEditing(true)}>
          <strong>{t('🏁 Vai correr uma prova? Marque a data')}</strong>
          <span>{t('O app conta os dias, mostra se você está pronto e diz quando começar o programa.')}</span>
        </button>
      );
    }
    return <RaceForm initial={race} today={today} busy={busy} onSave={save} onCancel={() => setEditing(false)} />;
  }

  const stage = raceStage(race, today);
  const days = daysUntil(race.date, today);
  const title = race.name || t('Sua prova');
  const dist = RACE_DISTANCES.find(d => d.km === race.km)?.label || t('{v1} km', { v1: decimal(race.km) });

  if (stage === 'done') {
    return (
      <div className="dash-card run-race">
        <strong>{t('🏁 {name} · {dist} · {date}', { name: title, dist, date: dateText(race.date) })}</strong>
        <p className="profile-field__hint">{t('A prova já passou. Registre a corrida e marque a próxima quando quiser.')}</p>
        <div className="run-setup__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => save(null)} disabled={busy}>{t('Remover prova')}</button>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing(true)}>{t('Marcar outra prova')}</button>
        </div>
      </div>
    );
  }

  const ready = raceReadiness(runs, race, today);
  const nivel = normalizeLevel(md.runNivel || md.nivel);
  // Iniciante não faz meia maratona do zero (o programa cai no 10K): sem sugestão.
  const goal = programGoalFor(race.km) === 'meia' && nivel === 'iniciante' ? null : programGoalFor(race.km);
  const advice = goal ? suggestedStart(race, goal, nivel, today) : null;
  const onTrack = !!program && !!goal && program.goal === goal && advice && program.start && program.start <= advice.start;
  const countdown = stage === 'today' ? t('É hoje! Boa prova 🍀')
    : stage === 'week' ? t('É nesta semana: descanse, hidrate e confie no treino.')
      : days === 1 ? t('Falta 1 dia') : t('Faltam {v1} dias', { v1: days });

  return (
    <div className="dash-card run-race">
      <strong>{t('🏁 {name} · {dist} · {date}', { name: title, dist, date: dateText(race.date) })}</strong>
      <p className="run-race__count">{countdown}</p>

      <div className="run-live__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ready.pct * 100)} aria-label={t('Preparo para a prova')}>
        <span style={{ width: `${Math.round(ready.pct * 100)}%` }} />
      </div>
      <span className="run-challenge__meta">
        {t('Maior corrida nas últimas 4 semanas: {v1} de {v2} km · média de {v3} km por semana', {
          v1: formatKm(ready.longestKm * 1000, 1), v2: decimal(ready.target), v3: formatKm(ready.weeklyKm * 1000, 1),
        })}
      </span>

      {advice && !onTrack && stage !== 'week' && (
        <div className="run-race__advice">
          {advice.late
            ? <p className="profile-field__hint">{t('Já não dá tempo de fazer as {v1} semanas inteiras do programa {goal}. Dá para começar agora e chegar com o que der: o foco são as corridas longas.', { v1: advice.weeks, goal: GOAL_LABEL[goal] })}</p>
            : <p className="profile-field__hint">{t('O programa {goal} dura {v1} semanas: para a semana da prova ser a última, comece em {date}.', { goal: GOAL_LABEL[goal], v1: advice.weeks, date: dateText(advice.start) })}</p>}
          <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => onProgram({ goal, nivel, start: advice.start })}>
            {advice.late ? t('Começar o programa agora') : t('Agendar o programa')}
          </button>
        </div>
      )}
      {onTrack && <p className="profile-field__hint">{t('✅ Seu programa já termina na semana da prova.')}</p>}
      {!goal && <p className="profile-field__hint">{t('Para essa distância o app não tem programa pronto: use os desafios e as corridas longas da semana.')}</p>}

      <div className="run-setup__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => save(null)} disabled={busy}>{t('Remover prova')}</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>{t('Editar prova')}</button>
      </div>
    </div>
  );
}
