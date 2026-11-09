import { useState } from 'react';
import { useToast } from '../context/useToast';
import { updateClientProfile, friendlyTrainerError } from '../lib/trainer';

import { t } from '../lib/i18n';
const GOALS = {
  massa: t('Ganho de massa'), forca: t('Aumento de força'), emagrecer: t('Emagrecimento'),
  definicao: t('Definição muscular'), saude: t('Saúde e bem-estar'), resistencia: t('Resistência / Condicionamento'),
};
const LEVELS = { iniciante: t('Iniciante'), intermediario: t('Intermediário'), avancado: t('Avançado') };
const WEEKLY = [1, 2, 3, 4, 5, 6, 7];
const num = v => (v === undefined || v === null ? '' : String(v).replace('.', ','));

// O personal corrige o cadastro do aluno vinculado, e-mail de login incluído.
export default function ClientProfileEdit({ clientId, profile, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({
    nome: profile.name || '', email: profile.email || '', peso: num(profile.peso), pesoAlvo: num(profile.pesoAlvo),
    altura: num(profile.altura), idade: num(profile.idade), meta: profile.meta || '', nivel: profile.nivel || '',
    weeklyGoal: profile.weeklyGoal ? String(profile.weeklyGoal) : '',
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));

  async function handleSave() {
    if (!f.nome.trim()) { setError(t('Informe o nome do aluno.')); return; }
    setBusy(true); setError('');
    try {
      await updateClientProfile(clientId, { ...f, nome: f.nome.trim(), email: f.email.trim() });
      toast(t('✅ Dados do aluno atualizados'));
      onSaved?.();
    } catch (err) {
      setError(friendlyTrainerError(err));
    } finally {
      setBusy(false);
    }
  }

  const text = (k, label, props = {}) => (
    <div className="profile-field">
      <label className="profile-field__label" htmlFor={`cp-${k}`}>{label}</label>
      <input id={`cp-${k}`} className="input input--sm" value={f[k]} onChange={set(k)} {...props} />
    </div>
  );
  const select = (k, label, options) => (
    <div className="profile-field">
      <label className="profile-field__label" htmlFor={`cp-${k}`}>{label}</label>
      <select id={`cp-${k}`} className="input input--sm" value={f[k]} onChange={set(k)}>
        <option value="">{t('Não informado')}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );

  return (
    <div className="dash-card">
      <div className="dash-card__title">{t('✏️ Dados do aluno')}</div>
      <p className="profile-field__hint m-0">{t('Você pode corrigir o cadastro do aluno. Trocar o e-mail muda o login dele (a senha continua a mesma).')}</p>
      {text('nome', t('Nome'), { maxLength: 80 })}
      {text('email', t('E-mail'), { type: 'email', inputMode: 'email', autoComplete: 'off' })}
      {text('peso', t('Peso (kg)'), { inputMode: 'decimal' })}
      {text('pesoAlvo', t('Peso alvo (kg)'), { inputMode: 'decimal' })}
      {text('altura', t('Altura (cm)'), { inputMode: 'decimal' })}
      {text('idade', t('Idade'), { inputMode: 'numeric' })}
      {select('meta', t('Objetivo'), Object.entries(GOALS))}
      {select('nivel', t('Nível'), Object.entries(LEVELS))}
      {select('weeklyGoal', t('Treinos por semana (meta)'), WEEKLY.map(n => [String(n), String(n)]))}
      {error && <p className="profile-field__hint text-error" role="alert">{error}</p>}
      <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleSave}>{busy ? t('Salvando…') : t('Salvar dados')}</button>
    </div>
  );
}
