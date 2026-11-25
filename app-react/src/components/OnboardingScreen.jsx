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
const FIELD_IDS = { meta: 'onbMeta', nivel: 'onbNivel', local: 'onbLocal', sexo: 'onbSexo', idade: 'onbIdade', peso: 'onbPeso', altura: 'onbAltura', nome: 'onbNome' };

// Uma pergunta por tela; cada tela diz quais campos valida. A tela do esporte só
// existe com mais de um esporte liberado. Esporte sem plano de musculação (ex.:
// EAFIT Run) não pergunta objetivo nem local.
const SCREEN_FIELDS = {
  esporte: [],
  meta: ['meta'],
  nivel: ['nivel'],
  local: ['local'],
  sexo: ['sexo'],
  idade: ['idade'],
  corpo: ['peso', 'altura'],
  nome: ['nome'],
};

// Opções em cartões: valor, título e uma linha que explica.
const META_OPTIONS = [
  { value: 'massa', icon: '💪', label: t('Ganho de massa'), hint: t('Mais músculo e mais volume') },
  { value: 'forca', icon: '🏋️', label: t('Aumento de força'), hint: t('Levantar cargas maiores') },
  { value: 'emagrecer', icon: '🔥', label: t('Emagrecimento'), hint: t('Perder gordura sem perder o músculo') },
  { value: 'definicao', icon: '✂️', label: t('Definição muscular'), hint: t('Secar e marcar o corpo') },
  { value: 'saude', icon: '❤️', label: t('Saúde e bem-estar'), hint: t('Treinar para se sentir bem') },
  { value: 'resistencia', icon: '🫁', label: t('Resistência / Condicionamento'), hint: t('Mais fôlego e disposição') },
];
const NIVEL_OPTIONS = [
  { value: 'iniciante', label: t('Iniciante'), hint: t('Menos de 1 ano de treino, ou voltando agora') },
  { value: 'intermediario', label: t('Intermediário'), hint: t('De 1 a 3 anos de treino regular') },
  { value: 'avancado', label: t('Avançado'), hint: t('Mais de 3 anos, com boa técnica') },
];
const LOCAL_OPTIONS = [
  { value: 'academia', icon: '🏢', label: t('Academia'), hint: t('Com máquinas, barras e halteres') },
  { value: 'condominio', icon: '🏘️', label: t('Academia do condomínio'), hint: t('Equipamentos mais simples') },
  { value: 'casa', icon: '🏠', label: t('Em casa'), hint: t('Com pouco ou nenhum equipamento') },
];
const SEXO_OPTIONS = [
  { value: 'M', label: t('Masculino') },
  { value: 'F', label: t('Feminino') },
];

// Grupo de cartões (radiogroup). Tocar numa opção escolhe e já passa para a próxima tela.
function ChoiceCards({ id, name, options, value, onPick, error, columns = 1 }) {
  return (
    <div className="onb-field">
      <div
        id={id} role="radiogroup" aria-label={name} tabIndex={-1}
        className={`onb-choices${columns === 2 ? ' onb-choices--2' : ''}`} {...invalidProps(id, error)}
      >
        {options.map(o => (
          <button
            key={o.value} type="button" role="radio" aria-checked={o.value === value}
            className={`onb-choice${o.value === value ? ' onb-choice--on' : ''}`} onClick={() => onPick(o.value)}
          >
            {o.icon && <span className="onb-choice__icon" aria-hidden="true">{o.icon}</span>}
            <span className="onb-choice__text">
              <strong>{o.label}</strong>
              {o.hint && <span>{o.hint}</span>}
            </span>
          </button>
        ))}
      </div>
      <FieldError id={id} message={error} />
    </div>
  );
}

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
  // Objetivo e local sem nada marcado: a pessoa escolhe de verdade, o plano depende deles.
  const [meta, setMeta] = useState('');
  // Sem nível pré-marcado: quem é iniciante e não olha recebia um plano pesado demais.
  const [nivel, setNivel] = useState('');
  const [local, setLocal] = useState('');
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
  const screens = [
    ...(choosing ? ['esporte'] : []),
    ...(usesPlan ? ['meta'] : []),
    'nivel',
    ...(usesPlan ? ['local'] : []),
    'sexo', 'idade', 'corpo', 'nome',
  ];
  const total = screens.length;
  const [step, setStep] = useState(0);
  const screen = screens[Math.min(step, total - 1)];
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
  // Erro achado em outra tela: o foco vai para o campo depois de a tela trocar.
  const focusErrors = useRef(null);

  // Métrica do painel: até onde cada pessoa chega no preenchimento.
  useEffect(() => { trackEvent('onboarding', 'view'); }, []);
  useEffect(() => {
    Object.entries({ nome, sexo, idade, peso, altura, nivel, meta, local }).forEach(([field, value]) => {
      if (value) trackEvent('onboarding', field);
    });
  }, [nome, sexo, idade, peso, altura, nivel, meta, local]);

  // Trocou de tela: foca o primeiro erro (se veio de um envio) ou o título.
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
      ...(usesPlan && !meta && { meta: t('Escolha o seu objetivo.') }),
      ...(!nivel && { nivel: t('Escolha o seu nível de experiência.') }),
      ...(usesPlan && !local && { local: t('Diga onde você treina.') }),
      ...bodyErrors({ sexo, idade, peso, altura: alturaCm }, { onboarding: true }),
      ...(!cleanName(nome) && { nome: t('Diga como podemos te chamar.') }),
    };
  }

  function advance() {
    trackEvent('onboarding', `passo_${step + 2}`);
    setErrors({});
    setMsg('');
    setStep(s => s + 1);
  }

  function goNext() {
    const alturaCm = heightToCm(altura);
    if (alturaCm !== altura) setAltura(alturaCm);
    const found = allErrors(alturaCm);
    const own = Object.fromEntries(Object.entries(found).filter(([field]) => SCREEN_FIELDS[screen].includes(field)));
    const fields = Object.keys(own);
    const noSport = screen === 'esporte' && !esporte;
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
    advance();
  }

  function goBack() {
    setMsg('');
    setErrors({});
    setStep(Math.max(0, step - 1));
  }

  // Cartão tocado: guarda a escolha e vai para a próxima tela.
  function pick(setter, field) {
    return value => { setter(value); clearError(field); advance(); };
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

    // Confere tudo de novo: se algo ficou inválido numa tela anterior, volta a ela.
    const found = allErrors(alturaCm);
    const fields = Object.keys(found);
    if (fields.length) {
      const target = screens.findIndex(sc => SCREEN_FIELDS[sc].some(f => found[f]));
      const own = Object.fromEntries(Object.entries(found).filter(([field]) => SCREEN_FIELDS[screens[target]].includes(field)));
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

      // Sem plano (ex.: Run) o objetivo e o local seguem com os valores de sempre.
      const { error } = await updateProfile({
        nome: cleanName(nome), sexo, idade: idadeNum, peso: pesoNum, altura: alturaNum,
        meta: meta || 'massa', nivel, local: local || 'academia', esporte,
      });
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

  // Pergunta e explicação de cada tela (o porquê de pedir o dado).
  const TEXTS = {
    esporte: { title: t('Seu esporte'), why: t('Cada esporte tem a sua versão do EAFIT.') },
    meta: { title: t('Qual é o seu objetivo?'), why: t('É a partir dele que montamos o seu treino.') },
    nivel: { title: t('Há quanto tempo você treina?'), why: t('Define o peso e o volume do começo, para não pesar demais.') },
    local: { title: t('Onde você costuma treinar?'), why: t('Escolhemos exercícios que cabem nos equipamentos que você tem.') },
    sexo: { title: t('Qual é o seu sexo biológico?'), why: t('Ajuda a calcular o gasto de energia e o volume ideal de treino.') },
    idade: { title: t('Quantos anos você tem?'), why: t('A recuperação muda com a idade, e o plano acompanha.') },
    corpo: { title: t('Seu peso e altura'), why: t('Com eles calculamos as suas metas de água e de nutrição.') },
    nome: { title: t('Como podemos te chamar?'), why: t('É assim que o app vai falar com você.') },
  };
  const text = TEXTS[screen];
  const lastLabel = busy ? (usesPlan ? t('Gerando seu plano…') : t('Salvando…')) : usesPlan ? t('Gerar meu treino') : t('Começar');
  // Telas de cartão avançam ao tocar; as demais têm o botão.
  const hasButton = ['esporte', 'idade', 'corpo', 'nome'].includes(screen);

  return (
    <div className="auth-screen">
      <div className="auth-inner onb">
        <div className="onb-brand">
          <img className="onb-brand__icon" src={logoMark} alt="" />
          <span className="onb-brand__name"><Wordmark /></span>
        </div>
        <form className="auth-form onb-form" onSubmit={e => { e.preventDefault(); if (last) handleSubmit(); else goNext(); }} noValidate>
          <div className="onb-progress">
            <div className="onb-progress__row">
              {step > 0
                ? <button type="button" className="onb-back" disabled={busy} onClick={goBack} aria-label={t('Voltar')}>‹</button>
                : <span className="onb-back onb-back--ghost" aria-hidden="true" />}
              <div className="onb-progress__bar" aria-hidden="true"><i style={{ width: `${((step + 1) / total) * 100}%` }} /></div>
            </div>
            <p className="onb-progress__label" aria-live="polite">{t('Passo {n} de {total}', { n: step + 1, total })}</p>
          </div>
          <h2 className="onb-question" ref={titleRef} tabIndex={-1}>{text.title}</h2>
          <p className="onb-why">{text.why}</p>

          {screen === 'esporte' && <SportPicker id="onbSport" value={esporte} onChange={pickSport} modules={sports} />}
          {screen === 'meta' && (
            <ChoiceCards id={FIELD_IDS.meta} name={t('Objetivo principal')} options={META_OPTIONS} value={meta} error={errors.meta} onPick={pick(setMeta, 'meta')} />
          )}
          {screen === 'nivel' && (
            <ChoiceCards id={FIELD_IDS.nivel} name={t('Nível de experiência')} options={NIVEL_OPTIONS} value={nivel} error={errors.nivel} onPick={pick(setNivel, 'nivel')} />
          )}
          {screen === 'local' && (
            <ChoiceCards id={FIELD_IDS.local} name={t('Onde você treina')} options={LOCAL_OPTIONS} value={local} error={errors.local} onPick={pick(setLocal, 'local')} />
          )}
          {screen === 'sexo' && (
            <ChoiceCards id={FIELD_IDS.sexo} name={t('Sexo biológico')} options={SEXO_OPTIONS} value={sexo} error={errors.sexo} columns={2} onPick={pick(setSexo, 'sexo')} />
          )}
          {screen === 'idade' && (
            <div className="profile-field">
              <label className="onb-sr" htmlFor={FIELD_IDS.idade}>{t('Idade')}</label>
              <input
                type="number" id={FIELD_IDS.idade} inputMode="numeric" enterKeyHint="next" className="input input--lg" placeholder={t('Ex: 28')}
                min="14" max="100" value={idade} {...invalidProps(FIELD_IDS.idade, errors.idade)}
                onChange={e => { setIdade(e.target.value); clearError('idade'); }}
              />
              <FieldError id={FIELD_IDS.idade} message={errors.idade} />
            </div>
          )}
          {screen === 'corpo' && (
            <>
              <div className="profile-field">
                <label className="profile-field__label" htmlFor={FIELD_IDS.peso}>{t('Peso (kg)')}</label>
                <input
                  type="number" id={FIELD_IDS.peso} inputMode="decimal" enterKeyHint="next" className="input input--lg" placeholder={t('Ex: 85')}
                  min="30" max="300" step="0.1" value={peso} {...invalidProps(FIELD_IDS.peso, errors.peso)}
                  onChange={e => { setPeso(e.target.value); clearError('peso'); }}
                />
                <FieldError id={FIELD_IDS.peso} message={errors.peso} />
              </div>
              <div className="profile-field">
                <label className="profile-field__label" htmlFor={FIELD_IDS.altura}>{t('Altura (cm)')}</label>
                <input
                  type="number" id={FIELD_IDS.altura} inputMode="numeric" enterKeyHint="next" className="input input--lg" placeholder={t('Ex: 178')}
                  min="100" max="250" value={altura} {...invalidProps(FIELD_IDS.altura, errors.altura)}
                  onChange={e => { setAltura(e.target.value); clearError('altura'); }}
                  onBlur={e => setAltura(heightToCm(e.target.value))}
                />
                <FieldError id={FIELD_IDS.altura} message={errors.altura} />
              </div>
            </>
          )}
          {screen === 'nome' && (
            <div className="profile-field">
              <label className="onb-sr" htmlFor={FIELD_IDS.nome}>{t('Como podemos te chamar?')}</label>
              <input
                type="text" id={FIELD_IDS.nome} className="input input--lg" placeholder={t('Seu primeiro nome')}
                autoComplete="given-name" autoCapitalize="words" enterKeyHint="go" maxLength={NAME_MAX}
                value={nome} {...invalidProps(FIELD_IDS.nome, errors.nome)}
                onChange={e => { setNome(e.target.value); clearError('nome'); }}
              />
              <FieldError id={FIELD_IDS.nome} message={errors.nome} />
            </div>
          )}

          {hasButton && (
            <div className="onb-actions">
              <button type="submit" className="btn btn--primary btn--lg" disabled={busy}>
                {last ? lastLabel : t('Próximo passo')}
              </button>
            </div>
          )}
          <p className="auth-form__msg auth-form__msg--error" role="alert">
            {Object.values(errors).some(Boolean) ? t('Corrija os campos marcados acima.') : msg}
          </p>
        </form>
      </div>
    </div>
  );
}
