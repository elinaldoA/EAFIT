export default function ProfileBodySection({
  sexo, setSexo, idade, setIdade, peso, setPeso, altura, setAltura,
  meta, setMeta, nivel, setNivel, pesoAlvo, setPesoAlvo,
  progress, imc, onSave, regenerating, onRegeneratePlan,
}) {
  return (
    <div className="profile-section">
      <div className="profile-section__title">Meu Corpo</div>
      <div className="profile-section__fields">
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="profileSexo">Sexo biológico</label>
          <select id="profileSexo" className="input input--sm" value={sexo} onChange={e => setSexo(e.target.value)}>
            <option value="" disabled>Selecione</option>
            <option value="M">Masculino</option>
            <option value="F">Feminino</option>
          </select>
        </div>
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="profileIdade">Idade</label>
          <input
            type="number" id="profileIdade" className="input input--sm" placeholder="Ex: 28"
            min="14" max="100" value={idade} onChange={e => setIdade(e.target.value)}
          />
        </div>
      </div>
      <div className="profile-section__fields">
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="profilePeso">Peso (kg)</label>
          <input
            type="number" id="profilePeso" className="input input--sm" placeholder="Ex: 85"
            min="30" max="300" step="0.1" value={peso} onChange={e => setPeso(e.target.value)}
          />
        </div>
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="profileAltura">Altura (cm)</label>
          <input
            type="number" id="profileAltura" className="input input--sm" placeholder="Ex: 178"
            min="100" max="250" value={altura} onChange={e => setAltura(e.target.value)}
          />
        </div>
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="profileMeta">Meta principal</label>
        <select id="profileMeta" className="input input--sm" value={meta} onChange={e => setMeta(e.target.value)}>
          <option value="massa">Ganho de massa</option>
          <option value="forca">Aumento de força</option>
          <option value="emagrecer">Emagrecimento</option>
          <option value="definicao">Definição muscular</option>
          <option value="saude">Saúde e bem-estar</option>
          <option value="resistencia">Resistência / Condicionamento</option>
        </select>
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="profileNivel">Nível de experiência</label>
        <select id="profileNivel" className="input input--sm" value={nivel} onChange={e => setNivel(e.target.value)}>
          <option value="iniciante">Iniciante</option>
          <option value="intermediario">Intermediário</option>
          <option value="avancado">Avançado</option>
        </select>
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="profilePesoAlvo">Peso alvo (kg)</label>
        <input
          type="number" id="profilePesoAlvo" className="input input--sm" placeholder="Ex: 80"
          min="30" max="300" step="0.1" value={pesoAlvo} onChange={e => setPesoAlvo(e.target.value)}
        />
      </div>
      {progress && (
        <div className="progress-card">
          <div className="progress-card__row">
            <span className="progress-card__label">{progress.msg}</span>
          </div>
          {!progress.done && (
            <div className="progress-card__bar">
              <div className="progress-card__fill" style={{ width: `${progress.pct}%` }} />
            </div>
          )}
        </div>
      )}
      {imc && (
        <div className="imc-card">
          <span className="imc-card__label">IMC</span>
          <span className="imc-card__value">{imc.value}</span>
          <span className="imc-card__class">{imc.cls}</span>
        </div>
      )}
      <button className="btn btn--primary btn--full" onClick={onSave}>Salvar dados corporais</button>
      <button className="btn btn--outline btn--full" disabled={regenerating} onClick={onRegeneratePlan}>
        {regenerating ? 'Gerando novo treino…' : '🔄 Gerar novo treino com esses dados'}
      </button>
    </div>
  );
}
