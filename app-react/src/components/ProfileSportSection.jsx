import { useState } from 'react';
import SportPicker from './SportPicker';
import { brandName } from '../lib/sportModule';
import { trackEvent } from '../lib/tracking';

import { t } from '../lib/i18n';
// Troca a versão do app (módulo de esporte) da conta. Vale na hora e em todos
// os aparelhos: a escolha fica em user_metadata.esporte.
export default function ProfileSportSection({ current, modules, updateProfile, toast }) {
  const [value, setValue] = useState(current.id);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (value === current.id) return;
    setBusy(true);
    const { error } = await updateProfile({ esporte: value });
    setBusy(false);
    if (error) return toast(t('⚠️ Não foi possível salvar — tente novamente'));
    trackEvent('module', value);
    const next = modules.find(m => m.id === value);
    toast(t('✅ Agora você está no {v1}', { v1: brandName(next) }));
  }

  return (
    <>
      <SportPicker id="profileSport" value={value} onChange={setValue} modules={modules} small />
      <span className="profile-field__hint">{t('Cada esporte tem sua versão do EAFIT, com treinos, telas e cores próprios. Seus dados continuam os mesmos.')}</span>
      <button type="button" className="btn btn--primary btn--full" disabled={busy || value === current.id} onClick={handleSave}>
        {busy ? t('Salvando…') : t('Trocar de esporte')}
      </button>
    </>
  );
}
