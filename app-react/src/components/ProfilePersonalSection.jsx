export default function ProfilePersonalSection({ nome, setNome, sobrenome, setSobrenome, apelido, setApelido, onSave }) {
  return (
    <>
      <div className="profile-section__fields">
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="profileNome">Nome</label>
          <input
            type="text" id="profileNome" className="input input--sm" placeholder="Ex: João"
            value={nome} onChange={e => setNome(e.target.value)}
          />
        </div>
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="profileSobrenome">Sobrenome</label>
          <input
            type="text" id="profileSobrenome" className="input input--sm" placeholder="Ex: Silva"
            value={sobrenome} onChange={e => setSobrenome(e.target.value)}
          />
        </div>
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="profileApelido">Apelido</label>
        <input
          type="text" id="profileApelido" className="input input--sm" placeholder="Como prefere ser chamado"
          value={apelido} onChange={e => setApelido(e.target.value)}
        />
      </div>
      <button className="btn btn--primary btn--full" onClick={onSave}>Salvar dados pessoais</button>
    </>
  );
}
