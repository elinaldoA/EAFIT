import { useState } from 'react';
import { todayDate } from '../../data/treinoData';
import { goTo } from '../../lib/appNav';
import { parseWeeklyKm, weeklyKmGoal, programSummary } from './runProfileStats';
import { VOICE_KEY, AUTOPAUSE_KEY, GPS_KEY, readPref, writePref } from './runPrefs';
import { t } from '../../lib/i18n';

// Perfil de quem está no módulo de corrida: o que o app mostra no lugar dos
// cartões de treino, nutrição e peso (PerfilPage.jsx).

// Meta de km por semana (aparece no topo do Perfil como "12,3/20").
export function RunGoalSection({ meta, updateProfile, toast }) {
  const [value, setValue] = useState(() => (weeklyKmGoal(meta) ?? ''));

  async function handleSave() {
    const parsed = parseWeeklyKm(value);
    if (parsed.error) return toast(t('⚠️ Escolha uma meta de 1 a 300 km por semana, ou deixe em branco.'));
    const { error } = await updateProfile({ runWeeklyKm: parsed.km });
    if (error) return toast(t('⚠️ Não foi possível salvar — tente novamente'));
    toast(parsed.km ? t('📅 Meta semanal salva!') : t('Meta semanal removida'));
  }

  return (
    <>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="runWeeklyKm">{t('Quilômetros por semana')}</label>
        <input
          type="number" id="runWeeklyKm" className="input input--sm" placeholder="20"
          min="1" max="300" step="0.5" value={value} onChange={e => setValue(e.target.value)}
          aria-describedby="runWeeklyKmHint"
        />
        <p className="profile-field__hint" id="runWeeklyKmHint">{t('Deixe em branco para correr sem meta. O progresso aparece no topo do Perfil.')}</p>
      </div>
      <button type="button" className="btn btn--primary btn--full" onClick={handleSave}>{t('Salvar meta semanal')}</button>
    </>
  );
}

// Preferências que valem neste aparelho (runPrefs.js), usadas ao gravar.
export function RunPrefsSection() {
  const [prefs, setPrefs] = useState(() => ({
    voice: readPref(VOICE_KEY), autoPause: readPref(AUTOPAUSE_KEY), gps: readPref(GPS_KEY),
  }));
  const rows = [
    ['voice', VOICE_KEY, t('Voz a cada quilômetro e nas trocas do treino guiado')],
    ['autoPause', AUTOPAUSE_KEY, t('Pausa automática quando você para (precisa do GPS)')],
    ['gps', GPS_KEY, t('Medir distância e percurso pelo GPS ao começar')],
  ];
  return (
    <>
      {rows.map(([name, key, label]) => (
        <div className="profile-field profile-field--row" key={key}>
          <label className="profile-field__label" htmlFor={`runPref-${name}`}>{label}</label>
          <input
            type="checkbox" id={`runPref-${name}`} checked={prefs[name]}
            onChange={e => { writePref(key, e.target.checked); setPrefs(p => ({ ...p, [name]: e.target.checked })); }}
          />
        </div>
      ))}
      <span className="profile-field__hint">{t('Valem só neste aparelho. Na corrida dá para mudar a voz e a pausa automática a qualquer momento.')}</span>
    </>
  );
}

// Atalhos para o que mora nas abas do EAFIT Run: o programa, os tênis e as zonas de privacidade.
export function RunShortcuts({ meta }) {
  const cards = [
    ['📅', t('Meu programa'), programSummary(meta, todayDate()), { tab: 'gravar' }],
    ['👟', t('Tênis e zonas de privacidade'), t('Km de cada par e lugares escondidos do mapa'), { tab: 'voce' }],
  ];
  return (
    <>
      {cards.map(([icon, title, summary, target]) => (
        <button key={title} type="button" className="shortcut-card" onClick={() => goTo(target)}>
          <span className="collapse__icon" aria-hidden="true">{icon}</span>
          <span className="collapse__text">
            <span className="collapse__title">{title}</span>
            <span className="collapse__summary">{summary}</span>
          </span>
          <span className="collapse__chevron" aria-hidden="true">›</span>
        </button>
      ))}
    </>
  );
}
