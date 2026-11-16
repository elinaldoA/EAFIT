import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { generatePlan } from '../data/workoutTemplates';
import { seedGeneratedPlan } from '../lib/workoutPlans';
import logoMark from '../assets/app-icon.png';
import { trackEvent } from '../lib/tracking';
import { heightToCm, bodyErrors } from '../lib/profileValidation';
import { invalidProps, focusFirstError } from '../lib/fieldErrors';
import FieldError from './FieldError';
import SportPicker from './SportPicker';
import { useSportModule } from '../hooks/useSportModule';
import { preferredSport, clearSportPref } from '../lib/sportPreference';

import { t } from '../lib/i18n';
import Wordmark from './Wordmark';
// Na ordem da tela: o foco vai para o primeiro com erro.
const FIELD_IDS = { sexo: 'onbSexo', idade: 'onbIdade', peso: 'onbPeso', altura: 'onbAltura' };

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
  // Esporte = versão do app (modules/registry.js); só pergunta com mais de um liberado.
  // A pergunta de esporte só existe com o módulo liberado para todos (`released`);
  // antes disso o cadastro é só de musculação, como sempre foi.
  const { module: sport, available, released: sports } = useSportModule();
  // Com mais de um esporte a pessoa escolhe de verdade: nada vem marcado, a não
  // ser o esporte do link de divulgação (?esporte=corrida, lib/sportPreference.js).
  const [picked, setPicked] = useState(() => preferredSport() || '');
  const choosing = sports.length > 1;
  const esporte = choosing ? (sports.some(m => m.id === picked) ? picked : '') : sport.id;
  function pickSport(id) {
    setPicked(id);
    trackEvent('onboarding', `esporte_${id}`);
  }
  // Módulo sem plano de musculação (ex.: EAFIT Run): sem objetivo, local nem treino gerado.
  const usesPlan = available.find(m => m.id === esporte)?.workoutPlan !== false;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // Erros por campo, mostrados junto de cada um. Mexer no campo apaga o erro dele.
  const [errors, setErrors] = useState({});
  const clearError = field => setErrors(e => (e[field] ? { ...e, [field]: undefined } : e));
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
    // Quem digita em metros (1,78) não deve travar: vira centímetros.
    const alturaCm = heightToCm(altura);
    if (alturaCm !== altura) setAltura(alturaCm);
    const alturaNum = parseFloat(alturaCm);

    if (!esporte) {
      trackEvent('onboarding', 'erro_esporte');
      setMsg(t('Escolha o seu esporte para continuar.'));
      return;
    }

    const found = bodyErrors({ sexo, idade, peso, altura: alturaCm }, { onboarding: true });
    const fields = Object.keys(found);
    setErrors(found);
    if (fields.length) {
      fields.forEach(field => trackEvent('onboarding', `erro_${field}`));
      setMsg('');
      focusFirstError(found, FIELD_IDS);
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
      if (!seeded.current && usesPlan) {
        const generatedDays = await generatePlan({ sexo, idade: idadeNum, peso: pesoNum, altura: alturaNum, meta, nivel, local });
        await seedGeneratedPlan(user.id, generatedDays);
        seeded.current = true;
      }

      const { error } = await updateProfile({ sexo, idade: idadeNum, peso: pesoNum, altura: alturaNum, meta, nivel, local, esporte });
      if (error) throw error;
      trackEvent('onboarding', 'done');
      clearSportPref();
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
          <div className="auth-logo__name"><Wordmark /></div>
          <p className="auth-logo__tagline">{usesPlan ? t('Vamos montar seu treino personalizado') : t('Conte um pouco sobre você')}</p>
        </div>
        <div className="auth-form">
          <SportPicker id="onbSport" value={esporte} onChange={pickSport} modules={sports} />
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbSexo">{t('Sexo biológico')}</label>
            <select id="onbSexo" className="input" value={sexo} {...invalidProps(FIELD_IDS.sexo, errors.sexo)} onChange={e => { setSexo(e.target.value); clearError('sexo'); }}>
              <option value="" disabled>{t('Selecione')}</option>
              <option value="M">{t('Masculino')}</option>
              <option value="F">{t('Feminino')}</option>
            </select>
            <FieldError id={FIELD_IDS.sexo} message={errors.sexo} />
          </div>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbIdade">{t('Idade')}</label>
            <input
              type="number" id="onbIdade" className="input" placeholder={t('Ex: 28')}
              min="14" max="100" value={idade} {...invalidProps(FIELD_IDS.idade, errors.idade)}
              onChange={e => { setIdade(e.target.value); clearError('idade'); }}
            />
            <FieldError id={FIELD_IDS.idade} message={errors.idade} />
          </div>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbPeso">{t('Peso (kg)')}</label>
            <input
              type="number" id="onbPeso" className="input" placeholder={t('Ex: 85')}
              min="30" max="300" step="0.1" value={peso} {...invalidProps(FIELD_IDS.peso, errors.peso)}
              onChange={e => { setPeso(e.target.value); clearError('peso'); }}
            />
            <FieldError id={FIELD_IDS.peso} message={errors.peso} />
          </div>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbAltura">{t('Altura (cm)')}</label>
            <input
              type="number" id="onbAltura" className="input" placeholder={t('Ex: 178')}
              min="100" max="250" value={altura} {...invalidProps(FIELD_IDS.altura, errors.altura)}
              onChange={e => { setAltura(e.target.value); clearError('altura'); }}
              onBlur={e => setAltura(heightToCm(e.target.value))}
            />
            <FieldError id={FIELD_IDS.altura} message={errors.altura} />
          </div>
          {usesPlan && (
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
          )}
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="onbNivel">{t('Nível de experiência')}</label>
            <select id="onbNivel" className="input" value={nivel} onChange={e => setNivel(e.target.value)}>
              <option value="iniciante">{t('Iniciante')}</option>
              <option value="intermediario">{t('Intermediário')}</option>
              <option value="avancado">{t('Avançado')}</option>
            </select>
          </div>
          {usesPlan && (
            <div className="profile-field">
              <label className="profile-field__label" htmlFor="onbLocal">{t('Onde você treina')}</label>
              <select id="onbLocal" className="input" value={local} onChange={e => setLocal(e.target.value)}>
                <option value="academia">{t('Academia')}</option>
                <option value="condominio">{t('Academia do condomínio')}</option>
                <option value="casa">{t('Em casa')}</option>
              </select>
            </div>
          )}
          <button className="btn btn--primary btn--full" disabled={busy} onClick={handleSubmit}>
            {busy ? (usesPlan ? t('Gerando seu plano…') : t('Salvando…')) : usesPlan ? t('Gerar meu treino') : t('Começar')}
          </button>
          <p className="auth-form__msg auth-form__msg--error" role="alert">
            {Object.values(errors).some(Boolean) ? t('Corrija os campos marcados acima.') : msg}
          </p>
        </div>
      </div>
    </div>
  );
}
