import { useState } from 'react';
import ProfileAccountSection from './ProfileAccountSection';
import { useAuth } from '../context/useAuth';
import { isGoogleOnly } from '../lib/googleAuth';
import { t } from '../lib/i18n';

// Grupo "Conta" do Perfil: trocar e-mail e senha, sair e apagar a conta. O
// estado dos campos novos fica aqui; o que fala com a conta vem do useAuth.
export default function ProfileAccountGroup({ user, toast }) {
  const { updateEmail, updatePassword, deleteAccount } = useAuth();
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  async function handleUpdateEmail() {
    if (!newEmail.trim()) return;
    const { error } = await updateEmail(newEmail.trim());
    if (error) return toast(`⚠️ ${error}`);
    toast(t('✅ Confirme o e-mail enviado para a nova conta'));
    setNewEmail('');
  }

  async function handleUpdatePassword() {
    if (!newPassword) return;
    const firstPassword = isGoogleOnly(user);
    const { error } = await updatePassword(newPassword);
    if (error) return toast(`⚠️ ${error}`);
    toast(firstPassword ? t('✅ Senha criada. Agora você também entra com e-mail e senha.') : t('✅ Senha atualizada'));
    setNewPassword('');
  }

  async function handleDeleteAccount() {
    const { error } = await deleteAccount();
    if (error) toast(`⚠️ ${error}`);
  }

  return (
    <div className="section-group">
      <div className="section-group__label">{t('Conta')}</div>
      <ProfileAccountSection
        user={user}
        newEmail={newEmail} setNewEmail={setNewEmail} onUpdateEmail={handleUpdateEmail}
        newPassword={newPassword} setNewPassword={setNewPassword} onUpdatePassword={handleUpdatePassword}
        onDeleteAccount={handleDeleteAccount}
      />
    </div>
  );
}
