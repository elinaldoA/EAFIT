import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { generatePlan } from '../data/workoutTemplates';
import { seedGeneratedPlan } from '../lib/workoutPlans';
import { upsertWeightLog } from '../lib/weightLog';
import { enqueue } from '../lib/syncQueue';
import { todayDate } from '../data/treinoData';
import logoMark from '../assets/app-icon.webp';
import { trackEvent } from '../lib/tracking';
import { heightToCm, bodyErrors, cleanName, NAME_MAX } from '../lib/profileValidation';
import { firstNameFromAccount } from '../lib/namePrompt';
import { invalidProps, focusFirstError } from '../lib/fieldErrors';
import FieldError from './FieldError';
import SportPicker from './SportPicker';
import { useSportModule } from '../hooks/useSportModule';
import { preferredSport, clearSportPref } from '../lib/sportPreference';

import { t } from '../lib/i18n';
import Wordmark from './Wordmark';
// Na ordem da tela: o foco vai para o primeiro com erro.
const FIELD_IDS = { nome: 'onbNome', sexo: 'onbSexo', idade: 'onbIdade', peso: 'onbPeso', altura: 'onbAltura', nivel: 'onbNivel' };

// Campos validados em cada passo. Esporte sem plano de musculação (ex.: EAFIT
// Run) não tem o passo "Seu treino": o nível vai para o passo do corpo.
const STEP_FIELDS = {
  plan: [['nome', 'sexo', 'idade'], ['peso', 'altura'], ['nivel']],
  noPlan: [['nome', 'sexo', 'idade'], ['peso', 'altura', 'nivel']],
};

export default function OnboardingScreen() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  // Como o app chama a pessoa (topo das telas, treinador por voz, e-mails); sem
  // ele, o topo mostrava o e-mail.
  const [nome, setNome] = useState(() => firstNameFromAccount(user?.user_metadata));
  const [sexo, setSexo] = useState('');
  const [idade, setIdade] = useState('');
  const [peso, setPeso] = useState('');
  const [altura, setAltura] = useState('');
  const [meta, setMeta] = useState('massa');
  // Sem nível pré-marcado: quem é iniciante e não olha recebia um plano pesado demais.
  const [nivel, setNivel] = useState('');
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
  const stepFields = usesPlan ? STEP_FIELDS.plan : STEP_FIELDS.noPlan;
  const total = stepFields.length;
  const [step, setStep] = useState(0);
  const last = step >= total - 1;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // Erros por campo, mostrados junto de cada um. Mexer no campo apaga o erro dele.
  const [errors, setErrors] = useState({});
  const clearError = field => setErrors(e => (e[field] ? { ...e, [field]: undefined } : e));
  // Plano já semeado nesta tela: se só o salvamento do perfil falhar, tentar
  // de novo não cria um segundo plano.
  const seeded = useRef(false);
  const titleRef = useRef(null);
  const mounted = useRef(false);
  // Erro achado em outro passo: o foco vai para o campo depois de a tela trocar.
  const focusErrors = useRef(null);

  // Métrica do painel: até onde cada pessoa chega no preenchimento.
  useEffect(() => { trackEvent('onboarding', 'view'); }, []);
  useEffect(() => {
    Object.entries({ nome, sexo, idade, peso, altura, nivel }).forEach(([field, value]) => {
      if (value) trackEvent('onboarding', field);
    });
  }, [nome, sexo, idade, peso, altura, nivel]);

  // Trocou de passo: foca o primeiro erro (se veio de um envio) ou o título do passo.
  useEffect(() => {
    if (focusErrors.current) {
      focusFirstError(focusErrors.current, FIELD_IDS);
      focusErrors.current = null;
    } else if (mounted.current) {
      titleRef.current?.focus();
    }
    mounted.current = true;
  }, [step]);

  // Erros de todos os campos (alturaCm já em centímetros).
  function allErrors(alturaCm) {
    return {
      ...(!cleanName(nome) && { nome: t('Diga como podemos te chamar.') }),
      ...bodyErrors({ sexo, idade, peso, altura: alturaCm }, { onboarding: true }),
      ...(!nivel && { nivel: t('Escolha o seu nível de experiência.') }),
    };
  }

  function goNext() {
    const alturaCm = heightToCm(altura);
    if (alturaCm !== altura) setAltura(alturaCm);
    const found = allErrors(alturaCm);
    const own = Object.fromEntries(Object.entries(found).filter(([field]) => stepFields[step].includes(field)));
    const fields = Object.keys(own);
    const noSport = step === 0 && !esporte;
    setErrors(own);
    if (noSport) {
      trackEvent('onboarding', 'erro_esporte');
      setMsg(t('Escolha o seu esporte para continuar.'));
    } else {
      setMsg('');
    }
    fields.forEach(field => trackEvent('onboarding', `erro_${field}`));
    if (fields.length) focusFirstError(own, FIELD_IDS);
    if (fields.length || noSport) return;
    trackEvent('onboarding', `passo_${step + 2}`);
    setStep(step + 1);
  }

  function goBack() {
    setMsg('');
    setErrors({});
    setStep(Math.max(0, step - 1));
  }

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
      setStep(0);
      return;
    }

    // Confere tudo de novo: se algo ficou inválido num passo anterior, volta a ele.
    const found = allErrors(alturaCm);
    const fields = Object.keys(found);
    if (fields.length) {
      const target = stepFields.findIndex(group => group.some(f => found[f]));
      const own = Object.fromEntries(Object.entries(found).filter(([field]) => stepFields[target].includes(field)));
      fields.forEach(field => trackEvent('onboarding', `erro_${field}`));
      setErrors(own);
      setMsg('');
      if (target === step) {
        focusFirstError(own, FIELD_IDS);
      } else {
        focusErrors.current = own;
        setStep(target);
      }
      return;
    }
    setErrors({});

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

      const { error } = await updateProfile({ nome: cleanName(nome), sexo, idade: idadeNum, peso: pesoNum, altura: alturaNum, meta, nivel, local, esporte });
      if (error) throw error;
      // O peso do cadastro é o primeiro ponto do gráfico da Evolução (antes ia só
      // para o perfil, e a aba Corpo dizia "Nenhum peso registrado" para quem tinha
      // acabado de informar). Sem esperar: a tela já está saindo; sem rede, vai pela fila.
      const today = todayDate();
      upsertWeightLog(user.id, today, pesoNum).catch(() => enqueue('weight_log', { userId: user.id, date: today, peso: pesoNum }));
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

  const titles = usesPlan ? [t('Sobre você'), t('Seu corpo'), t('Seu treino')] : [t('Sobre você'), t('Seu corpo')];
  const nivelField = (
    <div className="profile-field">
      <label className="profile-field__label" htmlFor={FIELD_IDS.nivel}>{t('Nível de experiência')}</label>
      <select id={FIELD_IDS.nivel} className="input" value={nivel} {...invalidProps(FIELD_IDS.nivel, errors.nivel)} onChange={e => { setNivel(e.target.value); clearError('nivel'); }}>
        <option value="" disabled>{t('Selecione')}</option>
        <option value="iniciante">{t('Iniciante')}</option>
        <option value="intermediario">{t('Intermediário')}</option>
        <option value="avancado">{t('Avançado')}</option>
      </select>
      <FieldError id={FIELD_IDS.nivel} message={errors.nivel} />
    </div>
  );

  return (
    <div className="auth-screen">
      <div className="auth-inner">
        <div className="auth-logo">
          <img className="auth-logo__icon" src={logoMark} alt="EAFIT" />
          <div className="auth-logo__name"><Wordmark /></div>
          <p className="auth-logo__tagline">{usesPlan ? t('Vamos montar seu treino personalizado') : t('Conte um pouco sobre você')}</p>
        </div>
        <form className="auth-form" onSubmit={e => { e.preventDefault(); if (last) handleSubmit(); else goNext(); }} noValidate>
          <div className="onb-progress">
            <div className="onb-progress__bar" aria-hidden="true"><i style={{ width: `${((step + 1) / total) * 100}%` }} /></div>
            <p className="onb-progress__label" aria-live="polite">{t('Passo {n} de {total}', { n: step + 1, total })}</p>
          </div>
          <h2 className="onb-step__title" ref={titleRef} tabIndex={-1}>{titles[step]}</h2>
          {step === 0 && (
            <>
              <SportPicker id="onbSport" value={esporte} onChange={pickSport} modules={sports} />
              <div className="profile-field">
                <label className="profile-field__label" htmlFor={FIELD_IDS.nome}>{t('Como podemos te chamar?')}</label>
                <input
                  type="text" id={FIELD_IDS.nome} className="input" placeholder={t('Seu primeiro nome')}
                  autoComplete="given-name" autoCapitalize="words" enterKeyHint="next" maxLength={NAME_MAX}
                  value={nome} {...invalidProps(FIELD_IDS.nome, errors.nome)}
                  onChange={e => { setNome(e.target.value); clearError('nome'); }}
                />
                <FieldError id={FIELD_IDS.nome} message={errors.nome} />
              </div>
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
                  type="number" id="onbIdade" inputMode="numeric" enterKeyHint="next" className="input" placeholder={t('Ex: 28')}
                  min="14" max="100" value={idade} {...invalidProps(FIELD_IDS.idade, errors.idade)}
                  onChange={e => { setIdade(e.target.value); clearError('idade'); }}
                />
                <FieldError id={FIELD_IDS.idade} message={errors.idade} />
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <div className="profile-field">
                <label className="profile-field__label" htmlFor="onbPeso">{t('Peso (kg)')}</label>
                <input
                  type="number" id="onbPeso" inputMode="decimal" enterKeyHint="next" className="input" placeholder={t('Ex: 85')}
                  min="30" max="300" step="0.1" value={peso} {...invalidProps(FIELD_IDS.peso, errors.peso)}
                  onChange={e => { setPeso(e.target.value); clearError('peso'); }}
                />
                <FieldError id={FIELD_IDS.peso} message={errors.peso} />
              </div>
              <div className="profile-field">
                <label className="profile-field__label" htmlFor="onbAltura">{t('Altura (cm)')}</label>
                <input
                  type="number" id="onbAltura" inputMode="numeric" enterKeyHint={last ? 'go' : 'next'} className="input" placeholder={t('Ex: 178')}
                  min="100" max="250" value={altura} {...invalidProps(FIELD_IDS.altura, errors.altura)}
                  onChange={e => { setAltura(e.target.value); clearError('altura'); }}
                  onBlur={e => setAltura(heightToCm(e.target.value))}
                />
                <FieldError id={FIELD_IDS.altura} message={errors.altura} />
              </div>
              {!usesPlan && nivelField}
            </>
          )}
          {step === 2 && usesPlan && (
            <>
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
              {nivelField}
              <div className="profile-field">
                <label className="profile-field__label" htmlFor="onbLocal">{t('Onde você treina')}</label>
                <select id="onbLocal" className="input" value={local} onChange={e => setLocal(e.target.value)}>
                  <option value="academia">{t('Academia')}</option>
                  <option value="condominio">{t('Academia do condomínio')}</option>
                  <option value="casa">{t('Em casa')}</option>
                </select>
              </div>
            </>
          )}
          <div className="onb-actions">
            {step > 0 && (
              <button type="button" className="btn btn--outline" disabled={busy} onClick={goBack}>{t('Voltar')}</button>
            )}
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {last
                ? (busy ? (usesPlan ? t('Gerando seu plano…') : t('Salvando…')) : usesPlan ? t('Gerar meu treino') : t('Começar'))
                : t('Próximo passo')}
            </button>
          </div>
          <p className="auth-form__msg auth-form__msg--error" role="alert">
            {Object.values(errors).some(Boolean) ? t('Corrija os campos marcados acima.') : msg}
          </p>
        </form>
      </div>
    </div>
  );
}
