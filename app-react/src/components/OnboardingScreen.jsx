import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { generatePlan } from '../data/workoutTemplates';
import { seedGeneratedPlan } from '../lib/workoutPlans';
import logoMark from '../assets/logo-mark.png';

export default function OnboardingScreen() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [sexo, setSexo] = useState('');
  const [idade, setIdade] = useState('');
  const [peso, setPeso] = useState('');
  const [altura, setAltura] = useState('');
  const [meta, setMeta] = useState('massa');
  const [nivel, setNivel] = useState('intermediario');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleSubmit() {
    const idadeNum = parseInt(idade, 10);
    const pesoNum = parseFloat(peso);
    const alturaNum = parseFloat(altura);

    if (!sexo || !idadeNum || idadeNum < 14 || idadeNum > 100) {
      setMsg('Preencha sexo e uma idade válida (14–100).');
      return;
    }
    if (!pesoNum || pesoNum < 30 || pesoNum > 300) {
      setMsg('Informe um peso válido (kg).');
      return;
    }
    if (!alturaNum || alturaNum < 100 || alturaNum > 250) {
      setMsg('Informe uma altura válida (cm).');
      return;
    }

    setBusy(true);
    setMsg('');
    try {
      // Semeia o plano ANTES de salvar o perfil: assim que o perfil grava
      // `peso`, o App.jsx desmonta esta tela e monta o WorkoutProvider, que
      // busca o plano ativo imediatamente. Se o perfil fosse salvo primeiro,
      // essa busca corre em paralelo com a criação do plano personalizado e
      // pode disparar o fallback de plano padrão antes dele existir,
      // gerando dois planos ativos.
      const generatedDays = await generatePlan({ sexo, idade: idadeNum, peso: pesoNum, altura: alturaNum, meta, nivel });
      await seedGeneratedPlan(user.id, generatedDays);

      const { error } = await updateProfile({ sexo, idade: idadeNum, peso: pesoNum, altura: alturaNum, meta, nivel });
      if (error) throw error;
    } catch (err) {
      console.error('onboarding:', err);
      setMsg('⚠️ Não foi possível gerar seu plano — tente novamente.');
      toast('⚠️ Erro ao criar seu plano personalizado');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-inner">
        <div className="auth-logo">
          <img className="auth-logo__icon" src={logoMark} alt="EAFIT" />
          <div className="auth-logo__name">EAFIT</div>
          <p className="auth-logo__tagline">Vamos montar seu treino personalizado</p>
        </div>
        <div className="auth-form">
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbSexo">Sexo biológico</label>
            <select id="onbSexo" className="input" value={sexo} onChange={e => setSexo(e.target.value)}>
              <option value="" disabled>Selecione</option>
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
            </select>
          </div>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbIdade">Idade</label>
            <input
              type="number" id="onbIdade" className="input" placeholder="Ex: 28"
              min="14" max="100" value={idade} onChange={e => setIdade(e.target.value)}
            />
          </div>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbPeso">Peso (kg)</label>
            <input
              type="number" id="onbPeso" className="input" placeholder="Ex: 85"
              min="30" max="300" step="0.1" value={peso} onChange={e => setPeso(e.target.value)}
            />
          </div>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbAltura">Altura (cm)</label>
            <input
              type="number" id="onbAltura" className="input" placeholder="Ex: 178"
              min="100" max="250" value={altura} onChange={e => setAltura(e.target.value)}
            />
          </div>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbMeta">Objetivo principal</label>
            <select id="onbMeta" className="input" value={meta} onChange={e => setMeta(e.target.value)}>
              <option value="massa">Ganho de massa</option>
              <option value="forca">Aumento de força</option>
              <option value="emagrecer">Emagrecimento</option>
              <option value="definicao">Definição muscular</option>
              <option value="saude">Saúde e bem-estar</option>
              <option value="resistencia">Resistência / Condicionamento</option>
            </select>
          </div>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbNivel">Nível de experiência</label>
            <select id="onbNivel" className="input" value={nivel} onChange={e => setNivel(e.target.value)}>
              <option value="iniciante">Iniciante</option>
              <option value="intermediario">Intermediário</option>
              <option value="avancado">Avançado</option>
            </select>
          </div>
          <button className="btn btn--primary btn--full" disabled={busy} onClick={handleSubmit}>
            {busy ? 'Gerando seu plano…' : 'Gerar meu treino'}
          </button>
          <p className="auth-form__msg auth-form__msg--error">{msg}</p>
        </div>
      </div>
    </div>
  );
}
