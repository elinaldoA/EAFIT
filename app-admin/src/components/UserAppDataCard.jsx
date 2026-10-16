import { describeAppData } from '../lib/userDetailHelpers';

// Aba Perfil → Dados do app: foto e o que o app grava na conta além do
// formulário (metas, idioma, notificações, treinador por voz, pausas).
export default function UserAppDataCard({ detail }) {
  if (!detail) return null;
  const md = detail.user_metadata || {};

  return (
    <section>
      <h2 className="section-title">Dados do app</h2>
      <div className="card user-app-data">
        {detail.avatar_data
          ? <img className="user-app-data__avatar" src={detail.avatar_data} alt="Foto do perfil" />
          : <div className="user-app-data__avatar user-app-data__avatar--empty" aria-label="Sem foto">sem foto</div>}
        <div className="form-grid user-app-data__grid">
          {describeAppData(md, detail).map(([label, value]) => (
            <div key={label} className="field">
              <span className="field__label">{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
