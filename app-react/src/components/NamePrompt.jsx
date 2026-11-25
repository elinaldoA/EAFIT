import { useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { cleanName, NAME_MAX } from '../lib/profileValidation';
import {
  shouldOfferName, firstNameFromAccount, readLocalName, readNamePromptDismissed, markNamePromptDismissed,
} from '../lib/namePrompt';
import { invalidProps } from '../lib/fieldErrors';
import FieldError from './FieldError';

import { t } from '../lib/i18n';

const FIELD_ID = 'namePromptInput';

// Cartão no topo do Treino para contas sem nome (ver shouldOfferName): o nome
// aparece no topo das telas no lugar do e-mail. Salva na conta, como o Perfil.
export default function NamePrompt() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [nome, setNome] = useState(() => firstNameFromAccount(user?.user_metadata));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  const offer = !hidden && !!user && shouldOfferName({
    metadata: user.user_metadata || {},
    localName: readLocalName(),
    dismissed: readNamePromptDismissed(user.id),
  });
  if (!offer) return null;

  async function handleSave(e) {
    e.preventDefault();
    const clean = cleanName(nome);
    if (!clean) {
      setError(t('Diga como podemos te chamar.'));
      document.getElementById(FIELD_ID)?.focus();
      return;
    }
    setBusy(true);
    const { error: saveError } = await updateProfile({ nome: clean });
    setBusy(false);
    if (saveError) {
      toast(t('⚠️ Não foi possível salvar — tente novamente'));
      return;
    }
    try { localStorage.setItem('profile_nome', clean); } catch { /* sem storage: a conta já tem o nome */ }
    setHidden(true);
    toast(t('Prazer, {nome}! 👋', { nome: clean }));
  }

  function handleDismiss() {
    markNamePromptDismissed(user.id);
    setHidden(true);
  }

  return (
    <form className="name-prompt" onSubmit={handleSave} aria-labelledby="namePromptTitle">
      <div className="name-prompt__head">
        <strong id="namePromptTitle" className="name-prompt__title">{t('👋 Como podemos te chamar?')}</strong>
        <button type="button" className="link-btn name-prompt__dismiss" onClick={handleDismiss}>{t('Agora não')}</button>
      </div>
      <div className="name-prompt__row">
        <input
          type="text" id={FIELD_ID} className="input" placeholder={t('Seu primeiro nome')}
          aria-label={t('Seu primeiro nome')} autoComplete="given-name" autoCapitalize="words" maxLength={NAME_MAX}
          value={nome} {...invalidProps(FIELD_ID, error)}
          onChange={e => { setNome(e.target.value); setError(''); }}
        />
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>{busy ? t('Salvando…') : t('Salvar')}</button>
      </div>
      <FieldError id={FIELD_ID} message={error} />
    </form>
  );
}
