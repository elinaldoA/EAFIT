import { useAuth } from '../context/useAuth';
import { getDisplayName } from '../lib/utils';

// Conta do personal: identificação, troca para o modo aluno e saída.
export default function TrainerAccount({ onSwitchToStudent }) {
  const { user, logout } = useAuth();

  return (
    <section className="page active trainer-page">
      <div className="dash-card">
        <div className="dash-card__title">🧑‍🏫 Modo Personal</div>
        <p className="profile-field__hint" style={{ marginTop: 0 }}>{getDisplayName(user)}<br />{user?.email}</p>
        <p className="profile-field__hint">
          Quer treinar também? Troque para o modo aluno para usar o app de treino normal. Você volta ao modo Personal quando quiser.
        </p>
        <button type="button" className="btn btn--primary btn--full" onClick={onSwitchToStudent}>Usar como aluno</button>
      </div>
      <button type="button" className="btn btn--outline btn--full" onClick={logout}>Sair da conta</button>
    </section>
  );
}
