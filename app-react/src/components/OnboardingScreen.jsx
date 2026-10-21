import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { generatePlan } from '../data/workoutTemplates';
import { seedGeneratedPlan } from '../lib/workoutPlans';
import logoMark from '../assets/app-icon.png';
import { trackEvent } from '../lib/tracking';
import { validateBody } from '../lib/profileValidation';

import { t } from '../lib/i18n';
export default function OnboardingScreen() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [sexo, setSexo] = useState('');
  const [idade, setIdade] = useState('');
  const [peso, setPeso] = useState('');
  const [altura, setAltura] = useState('');
  const [meta, setMeta] = useState('massa');
  const [nivel, setNivel] = useState('intermediario');
  const [local, setLocal] = useState('academia');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // Plano já semeado nesta tela: se só o salvamento do perfil falhar, tentar
  // de novo não cria um segundo plano.
  const seeded = useRef(false);

  // Métrica do painel: até onde cada pessoa chega no preenchimento.
  useEffect(() => { trackEvent('onboarding', 'view'); }, []);
  useEffect(() => {
    Object.entries({ sexo, idade, peso, altura }).forEach(([field, value]) => {
      if (value) trackEvent('onboarding', field);
    });
  }, [sexo, idade, peso, altura]);

  async function handleSubmit() {
    trackEvent('onboarding', 'submit');
    const idadeNum = parseInt(idade, 10);
    const pesoNum = parseFloat(peso);
    const alturaNum = parseFloat(altura);

    const invalid = validateBody({ sexo, idade, peso, altura }, { onboarding: true });
    if (invalid) {
      trackEvent('onboarding', `erro_${invalid.field}`);
      setMsg(invalid.message);
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
      if (!seeded.current) {
        const generatedDays = await generatePlan({ sexo, idade: idadeNum, peso: pesoNum, altura: alturaNum, meta, nivel, local });
        await seedGeneratedPlan(user.id, generatedDays);
        seeded.current = true;
      }

      const { error } = await updateProfile({ sexo, idade: idadeNum, peso: pesoNum, altura: alturaNum, meta, nivel, local });
      if (error) throw error;
      trackEvent('onboarding', 'done');
    } catch (err) {
      trackEvent('onboarding', 'erro_plano');
      console.error('onboarding:', err);
      setMsg(t('⚠️ Não foi possível gerar seu plano — tente novamente.'));
      toast(t('⚠️ Erro ao criar seu plano personalizado'));
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
          <p className="auth-logo__tagline">{t('Vamos montar seu treino personalizado')}</p>
        </div>
        <div className="auth-form">
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbSexo">{t('Sexo biológico')}</label>
            <select id="onbSexo" className="input" value={sexo} onChange={e => setSexo(e.target.value)}>
              <option value="" disabled>{t('Selecione')}</option>
              <option value="M">{t('Masculino')}</option>
              <option value="F">{t('Feminino')}</option>
            </select>
          </div>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbIdade">{t('Idade')}</label>
            <input
              type="number" id="onbIdade" className="input" placeholder={t('Ex: 28')}
              min="14" max="100" value={idade} onChange={e => setIdade(e.target.value)}
            />
          </div>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbPeso">{t('Peso (kg)')}</label>
            <input
              type="number" id="onbPeso" className="input" placeholder={t('Ex: 85')}
              min="30" max="300" step="0.1" value={peso} onChange={e => setPeso(e.target.value)}
            />
          </div>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbAltura">{t('Altura (cm)')}</label>
            <input
              type="number" id="onbAltura" className="input" placeholder={t('Ex: 178')}
              min="100" max="250" value={altura} onChange={e => setAltura(e.target.value)}
            />
          </div>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbMeta">{t('Objetivo principal')}</label>
            <select id="onbMeta" className="input" value={meta} onChange={e => setMeta(e.target.value)}>
              <option value="massa">{t('Ganho de massa')}</option>
              <option value="forca">{t('Aumento de força')}</option>
              <option value="emagrecer">{t('Emagrecimento')}</option>
              <option value="definicao">{t('Definição muscular')}</option>
              <option value="saude">{t('Saúde e bem-estar')}</option>
              <option value="resistencia">{t('Resistência / Condicionamento')}</option>
            </select>
          </div>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbNivel">{t('Nível de experiência')}</label>
            <select id="onbNivel" className="input" value={nivel} onChange={e => setNivel(e.target.value)}>
              <option value="iniciante">{t('Iniciante')}</option>
              <option value="intermediario">{t('Intermediário')}</option>
              <option value="avancado">{t('Avançado')}</option>
            </select>
          </div>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbLocal">{t('Onde você treina')}</label>
            <select id="onbLocal" className="input" value={local} onChange={e => setLocal(e.target.value)}>
              <option value="academia">{t('Academia')}</option>
              <option value="condominio">{t('Academia do condomínio')}</option>
              <option value="casa">{t('Em casa')}</option>
            </select>
          </div>
          <button className="btn btn--primary btn--full" disabled={busy} onClick={handleSubmit}>
            {busy ? t('Gerando seu plano…') : t('Gerar meu treino')}
          </button>
          <p className="auth-form__msg auth-form__msg--error">{msg}</p>
        </div>
      </div>
    </div>
  );
}
