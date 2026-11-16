import { useMemo, useState } from 'react';
import { useAuth } from '../context/useAuth';
import ProfileAmbassadorSection from '../components/ProfileAmbassadorSection';
import ProfilePreferencesGroup from '../components/ProfilePreferencesGroup';
import ProfileAccountGroup from '../components/ProfileAccountGroup';
import { InviteAndFeedback, HelpSection, ShortcutCard } from '../components/ProfileCommunity';
import { useToast } from '../context/useToast';
import { useAvatar } from '../context/useAvatar';
import { useWorkout } from '../context/useWorkout';
import { enqueue } from '../lib/syncQueue';
import { todayDate, DEFAULT_WEEKLY_GOAL, computedWaterGoalLiters, DEFAULT_WATER_GOAL } from '../data/treinoData';
import { fetchWeightLogs, upsertWeightLog } from '../lib/weightLog';
import { saveAvatar } from '../lib/avatar';
import { generatePlan } from '../data/workoutTemplates';
import { computeImcBracket } from '../data/workoutAdjustments';
import { createGeneratedPlan } from '../lib/workoutPlans';
import { useProfileData } from '../hooks/useProfileData';
import CollapsibleCard from '../components/CollapsibleCard';
import ProfileHeader from '../components/ProfileHeader';
import ProfilePersonalSection from '../components/ProfilePersonalSection';
import ProfileBodySection from '../components/ProfileBodySection';
import { imcInfo, metaProgress } from '../lib/profileCalc';
import { WeeklyGoalSection, MacrosSection } from '../components/ProfileGoalsSection';
import ProfileNutritionSection from '../components/ProfileNutritionSection';
import { computeNutritionGoals, DEFAULT_META } from '../lib/nutritionGoals';
import ProfileSportSection from '../components/ProfileSportSection';
import { useSportModule } from '../hooks/useSportModule';
import { brandName } from '../lib/sportModule';
import { takeProfileCardToOpen } from '../lib/appNav';
import { useRunProfileStats } from '../modules/corrida/useRunProfileStats';
import { RunGoalSection, RunPrefsSection, RunShortcuts } from '../modules/corrida/RunProfile';
import { weeklyKmGoal } from '../modules/corrida/runProfileStats';
import { decimal } from '../modules/corrida/runs';

import { validateBody, cleanName, validWeeklyGoal, validWaterGoal } from '../lib/profileValidation';
import { t, locale } from '../lib/i18n';
export default function PerfilPage({ active }) {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  // Atalho vindo de uma notificação ou de um aviso do sino (ex.: resposta a um feedback).
  const [cardToOpen] = useState(takeProfileCardToOpen);
  const { markPending, refreshPlan, planByTrainer } = useWorkout();

  const md = user?.user_metadata || {};
  const [nome, setNome] = useState(md.nome || localStorage.getItem('profile_nome') || '');
  const [sobrenome, setSobrenome] = useState(md.sobrenome || localStorage.getItem('profile_sobrenome') || '');
  const [apelido, setApelido] = useState(md.apelido || localStorage.getItem('profile_apelido') || '');
  const [sexo, setSexo] = useState(md.sexo || localStorage.getItem('profile_sexo') || '');
  const [idade, setIdade] = useState(md.idade || localStorage.getItem('profile_idade') || '');
  const [peso, setPeso] = useState(md.peso || localStorage.getItem('profile_peso') || '');
  const [altura, setAltura] = useState(md.altura || localStorage.getItem('profile_altura') || '');
  const [meta, setMeta] = useState(md.meta || localStorage.getItem('profile_meta') || DEFAULT_META);
  const [nivel, setNivel] = useState(md.nivel || localStorage.getItem('profile_nivel') || 'intermediario');
  const [local, setLocal] = useState(md.local || localStorage.getItem('profile_local') || 'academia');
  const [pesoAlvo, setPesoAlvo] = useState(md.pesoAlvo || localStorage.getItem('profile_pesoAlvo') || '');
  const [macroAgua, setMacroAgua] = useState(md.macroAgua || localStorage.getItem('profile_macroAgua') || '');
  const [weeklyGoal, setWeeklyGoal] = useState(md.weeklyGoal || localStorage.getItem('profile_weeklyGoal') || DEFAULT_WEEKLY_GOAL);
  const { stats, weightLogs, setWeightLogs } = useProfileData(active, user, toast);
  const { avatarData, setAvatarData } = useAvatar();

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const { module: sport, available: sports } = useSportModule();
  // Módulo sem plano de musculação (corrida): o Perfil troca os cartões de
  // treino, nutrição e peso pelos do esporte.
  const usesWorkouts = sport.workoutPlan !== false;
  const runStats = useRunProfileStats(active && !usesWorkouts, user);

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    setUploadingAvatar(true);
    try {
      const dataUrl = await saveAvatar(user.id, file);
      setAvatarData(dataUrl);
      toast(t('✅ Foto de perfil atualizada'));
    } catch (err) {
      toast(`⚠️ ${err.message}`);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSavePersonal() {
    const fields = { nome: cleanName(nome), sobrenome: cleanName(sobrenome), apelido: cleanName(apelido) };
    const { error } = await updateProfile(fields);
    if (error) return toast(t('⚠️ Não foi possível salvar — tente novamente'));
    setNome(fields.nome);
    setSobrenome(fields.sobrenome);
    setApelido(fields.apelido);
    localStorage.setItem('profile_nome', fields.nome);
    localStorage.setItem('profile_sobrenome', fields.sobrenome);
    localStorage.setItem('profile_apelido', fields.apelido);
    toast(t('✅ Dados pessoais salvos!'));
  }

  async function generateAndActivatePlan() {
    const generatedDays = await generatePlan({ peso: parseFloat(peso), altura: parseFloat(altura), meta, nivel, local });
    await createGeneratedPlan(user.id, t('Plano gerado {v1}', { v1: new Date().toLocaleDateString(locale) }), generatedDays);
    await refreshPlan();
  }

  async function handleSave() {
    const invalid = validateBody({ sexo, idade, peso, altura, pesoAlvo });
    if (invalid) return toast(`⚠️ ${invalid.message}`);

    // O peso só muda o treino pela faixa de IMC (applyImcAdjustment). Como
    // generatePlan sorteia os exercícios da biblioteca, regenerar a cada
    // pesagem trocaria o treino inteiro toda semana e zeraria a progressão —
    // por isso o treino só é refeito quando o peso novo muda de faixa.
    // Plano do personal nunca é trocado sozinho (mesma regra do ciclo
    // automático em lib/workoutPlans.js).
    const prevBracket = parseFloat(md.peso) && parseFloat(md.altura) ? computeImcBracket(md.peso, md.altura) : null;
    const bracketChanged = !!prevBracket && !!parseFloat(peso) && !!parseFloat(altura)
      && computeImcBracket(peso, altura) !== prevBracket;

    const { error } = await updateProfile({ sexo, idade, peso, altura, meta, nivel, local, pesoAlvo });
    if (error) return toast(t('⚠️ Não foi possível salvar — tente novamente'));
    localStorage.setItem('profile_sexo', sexo);
    localStorage.setItem('profile_idade', idade);
    localStorage.setItem('profile_peso', peso);
    localStorage.setItem('profile_altura', altura);
    localStorage.setItem('profile_meta', meta);
    localStorage.setItem('profile_nivel', nivel);
    localStorage.setItem('profile_local', local);
    localStorage.setItem('profile_pesoAlvo', pesoAlvo);

    if (user && peso) {
      try {
        await upsertWeightLog(user.id, todayDate(), parseFloat(peso));
        setWeightLogs(await fetchWeightLogs(user.id));
      } catch (err) {
        console.error('upsertWeightLog:', err);
        enqueue('weight_log', { userId: user.id, date: todayDate(), peso: parseFloat(peso) });
        markPending();
      }
    }

    if (user && usesWorkouts && bracketChanged && !planByTrainer && !regenerating) {
      setRegenerating(true);
      try {
        await generateAndActivatePlan();
        toast(t('✅ Perfil salvo — seu IMC mudou de faixa e o treino foi atualizado automaticamente'));
      } catch (err) {
        console.error('autoRegeneratePlan:', err);
        toast(t('⚠️ Perfil salvo, mas não deu pra atualizar o treino — use "Gerar novo treino com esses dados"'));
      } finally {
        setRegenerating(false);
      }
      return;
    }
    toast(t('Perfil salvo!'));
  }

  async function handleRegeneratePlan() {
    if (!user || regenerating) return;
    const pesoNum = parseFloat(peso);
    const alturaNum = parseFloat(altura);
    if (!pesoNum || !alturaNum) {
      toast(t('⚠️ Preencha peso e altura antes de gerar um novo treino'));
      return;
    }
    if (planByTrainer && !window.confirm(t('Seu plano atual foi montado pelo seu personal. Gerar um novo treino automático vai substituí-lo (ele continua salvo em "Editar treino"). Continuar?'))) return;
    if (!window.confirm(t('Isso cria um novo plano de treino com base nos seus dados atuais e o ativa. Seus planos existentes continuam salvos e podem ser reativados em "Editar treino". Continuar?'))) return;

    setRegenerating(true);
    try {
      await generateAndActivatePlan();
      toast(t('✅ Novo treino gerado e ativado!'));
    } catch (err) {
      console.error('regeneratePlan:', err);
      toast(t('⚠️ Erro ao gerar novo treino'));
    } finally {
      setRegenerating(false);
    }
  }

  async function handleSaveWeeklyGoal() {
    if (!validWeeklyGoal(weeklyGoal)) return toast(t('⚠️ Escolha de 1 a 7 treinos por semana.'));
    const { error } = await updateProfile({ weeklyGoal });
    if (error) return toast(t('⚠️ Não foi possível salvar — tente novamente'));
    localStorage.setItem('profile_weeklyGoal', weeklyGoal);
    toast(t('📅 Meta semanal salva!'));
  }

  async function handleSaveWaterGoal() {
    if (!validWaterGoal(macroAgua)) return toast(t('⚠️ Meta de água entre 0,5 e 10 L.'));
    const { error } = await updateProfile({ macroAgua });
    if (error) return toast(t('⚠️ Não foi possível salvar — tente novamente'));
    localStorage.setItem('profile_macroAgua', macroAgua);
    toast(t('🎯 Meta de água salva!'));
  }

  const weeklyGoalNum = parseInt(weeklyGoal, 10) || DEFAULT_WEEKLY_GOAL;
  const imc = imcInfo(parseFloat(peso), parseFloat(altura));
  const progress = useMemo(
    () => metaProgress(parseFloat(peso), parseFloat(pesoAlvo), weightLogs),
    [peso, pesoAlvo, weightLogs]
  );
  const nutritionGoals = computeNutritionGoals({ sexo, idade, peso, altura, meta, weeklyGoal });
  const suggestedWaterGoal = computedWaterGoalLiters(peso) ?? DEFAULT_WATER_GOAL;
  const waterGoalLabel = String(parseFloat(macroAgua) || suggestedWaterGoal).replace('.', ',');
  const fullName = [nome, sobrenome].filter(Boolean).join(' ');
  const bodySummary = [peso && `${peso}kg`, altura && `${altura}cm`, imc && t('IMC {v1}', { v1: imc.value.replace('.', ',') })]
    .filter(Boolean).join(' · ') || t('Peso, altura, meta e nível');

  // Peso e fotos moram na aba Corpo da Evolução (antes ficavam repetidos
  // aqui). Grava a aba e troca o hash — useHashTab ouve o hashchange.
  function openBodyProgress() {
    try { localStorage.setItem('dash_tab', 'corpo'); } catch { /* sem storage */ }
    window.location.hash = 'dash';
  }

  return (
    <section id="page-perfil" className="page active">
      <ProfileHeader
        user={user} avatarData={avatarData} uploadingAvatar={uploadingAvatar}
        onAvatarChange={handleAvatarChange} stats={stats} weeklyGoalNum={weeklyGoalNum}
        runStats={usesWorkouts ? null : runStats}
      />

      <div className="section-group">
        <div className="section-group__label">{t('Meus dados')}</div>

        <CollapsibleCard icon="👤" title={t('Dados pessoais')} summary={fullName || apelido || t('Nome e apelido')}>
          <ProfilePersonalSection
            nome={nome} setNome={setNome} sobrenome={sobrenome} setSobrenome={setSobrenome}
            apelido={apelido} setApelido={setApelido} onSave={handleSavePersonal}
          />
        </CollapsibleCard>

        {sports.length > 1 && (
          <CollapsibleCard icon={sport.icon} title={t('Meu esporte')} summary={`${sport.label} · ${brandName(sport)}`}>
            <ProfileSportSection key={sport.id} current={sport} modules={sports} updateProfile={updateProfile} toast={toast} />
          </CollapsibleCard>
        )}

        <CollapsibleCard icon="📏" title={t('Meu corpo')} summary={bodySummary} defaultOpen={cardToOpen === 'corpo'}>
          <ProfileBodySection
            sexo={sexo} setSexo={setSexo} idade={idade} setIdade={setIdade}
            peso={peso} setPeso={setPeso} altura={altura} setAltura={setAltura}
            meta={meta} setMeta={setMeta} nivel={nivel} setNivel={setNivel} local={local} setLocal={setLocal}
            pesoAlvo={pesoAlvo} setPesoAlvo={setPesoAlvo}
            progress={progress} imc={imc} onSave={handleSave}
            regenerating={regenerating} onRegeneratePlan={handleRegeneratePlan}
            showTraining={usesWorkouts}
          />
        </CollapsibleCard>

        {usesWorkouts ? (
          <>
            <CollapsibleCard icon="🎯" title={t('Metas')} summary={t('{weekly} treinos/semana · {water}L de água por dia', { weekly: weeklyGoalNum, water: waterGoalLabel })}>
              <WeeklyGoalSection weeklyGoal={weeklyGoal} setWeeklyGoal={setWeeklyGoal} onSave={handleSaveWeeklyGoal} />
              <div className="collapse__divider" />
              <MacrosSection
                macroAgua={macroAgua} setMacroAgua={setMacroAgua}
                suggestedGoal={suggestedWaterGoal}
                onSave={handleSaveWaterGoal}
              />
            </CollapsibleCard>

            <CollapsibleCard icon="🍽️" title={t('Nutrição')} summary={nutritionGoals ? t('{kcal} kcal · {protein} g de proteína por dia', { kcal: nutritionGoals.kcal, protein: nutritionGoals.protein }) : t('Metas diárias de calorias e proteína')}>
              <ProfileNutritionSection goals={nutritionGoals} />
            </CollapsibleCard>

            <ShortcutCard
              icon="📈" title={t('Peso e fotos de progresso')} onClick={openBodyProgress}
              summary={weightLogs.length ? t('{length} registros de peso · ver em Evolução', { length: weightLogs.length }) : t('Ver em Evolução')}
            />
          </>
        ) : (
          <>
            <CollapsibleCard
              icon="🎯" title={t('Metas')}
              summary={weeklyKmGoal(md) ? t('{v1} km por semana', { v1: decimal(weeklyKmGoal(md)) }) : t('Defina uma meta de km por semana')}
            >
              <RunGoalSection meta={md} updateProfile={updateProfile} toast={toast} />
            </CollapsibleCard>

            <CollapsibleCard icon="🏃" title={t('Preferências de corrida')} summary={t('Voz, pausa automática e GPS')}>
              <RunPrefsSection />
            </CollapsibleCard>

            <RunShortcuts meta={md} />
          </>
        )}
      </div>

      <ProfileAmbassadorSection />

      <InviteAndFeedback user={user} toast={toast} usesWorkouts={usesWorkouts} cardToOpen={cardToOpen} />

      <ProfilePreferencesGroup user={user} updateProfile={updateProfile} toast={toast} usesWorkouts={usesWorkouts} />

      {sport.tutorial && <HelpSection />}

      <ProfileAccountGroup user={user} toast={toast} />
    </section>
  );
}
