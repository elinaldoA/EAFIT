import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAvatar } from '../context/AvatarContext';
import { useWorkout } from '../context/WorkoutContext';
import { enqueue } from '../lib/syncQueue';
import { fmtDate } from '../lib/utils';
import { TODAY_DATE, DEFAULT_WEEKLY_GOAL } from '../data/treinoData';
import { fetchWeightLogs, upsertWeightLog } from '../lib/weightLog';
import { saveAvatar } from '../lib/avatar';
import { generatePlan } from '../data/workoutTemplates';
import { createGeneratedPlan } from '../lib/workoutPlans';
import { useReminders } from '../hooks/useReminders';
import { useProfileData } from '../hooks/useProfileData';
import LineChart from '../components/LineChart';
import ProfileHeader from '../components/ProfileHeader';
import ProfilePersonalSection from '../components/ProfilePersonalSection';
import ProfileBodySection from '../components/ProfileBodySection';
import { imcInfo, metaProgress } from '../lib/profileCalc';
import { WeeklyGoalSection, MacrosSection } from '../components/ProfileGoalsSection';
import ProfilePreferencesSection from '../components/ProfilePreferencesSection';
import ProfileAccountSection from '../components/ProfileAccountSection';

export default function PerfilPage({ active }) {
  const { user, logout, updateProfile, updateEmail, updatePassword, deleteAccount } = useAuth();
  const toast = useToast();
  const { markPending, refreshPlan } = useWorkout();

  const md = user?.user_metadata || {};
  const [nome, setNome] = useState(md.nome || localStorage.getItem('profile_nome') || '');
  const [sobrenome, setSobrenome] = useState(md.sobrenome || localStorage.getItem('profile_sobrenome') || '');
  const [apelido, setApelido] = useState(md.apelido || localStorage.getItem('profile_apelido') || '');
  const [sexo, setSexo] = useState(md.sexo || localStorage.getItem('profile_sexo') || '');
  const [idade, setIdade] = useState(md.idade || localStorage.getItem('profile_idade') || '');
  const [peso, setPeso] = useState(md.peso || localStorage.getItem('profile_peso') || '');
  const [altura, setAltura] = useState(md.altura || localStorage.getItem('profile_altura') || '');
  const [meta, setMeta] = useState(md.meta || localStorage.getItem('profile_meta') || 'massa');
  const [nivel, setNivel] = useState(md.nivel || localStorage.getItem('profile_nivel') || 'intermediario');
  const [pesoAlvo, setPesoAlvo] = useState(md.pesoAlvo || localStorage.getItem('profile_pesoAlvo') || '');
  const [macroAgua, setMacroAgua] = useState(md.macroAgua || localStorage.getItem('profile_macroAgua') || '');
  const [weeklyGoal, setWeeklyGoal] = useState(md.weeklyGoal || localStorage.getItem('profile_weeklyGoal') || DEFAULT_WEEKLY_GOAL);
  const { stats, weightLogs, setWeightLogs } = useProfileData(active, user, toast);
  const { avatarData, setAvatarData } = useAvatar();
  const [remindersEnabled, toggleReminders] = useReminders(toast, user);

  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function handleExport(action, label) {
    if (!user || exporting) return;
    setExporting(true);
    try {
      await action(user.id);
    } catch (err) {
      console.error('export:', err);
      toast(`⚠️ Erro ao gerar ${label}`);
    } finally {
      setExporting(false);
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    setUploadingAvatar(true);
    try {
      const dataUrl = await saveAvatar(user.id, file);
      setAvatarData(dataUrl);
      toast('✅ Foto de perfil atualizada');
    } catch (err) {
      toast(`⚠️ ${err.message}`);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSavePersonal() {
    localStorage.setItem('profile_nome', nome);
    localStorage.setItem('profile_sobrenome', sobrenome);
    localStorage.setItem('profile_apelido', apelido);
    const { error } = await updateProfile({ nome, sobrenome, apelido });
    if (error) return toast('⚠️ Não foi possível salvar — tente novamente');
    toast('✅ Dados pessoais salvos!');
  }

  async function handleSave() {
    localStorage.setItem('profile_sexo', sexo);
    localStorage.setItem('profile_idade', idade);
    localStorage.setItem('profile_peso', peso);
    localStorage.setItem('profile_altura', altura);
    localStorage.setItem('profile_meta', meta);
    localStorage.setItem('profile_nivel', nivel);
    localStorage.setItem('profile_pesoAlvo', pesoAlvo);
    const { error } = await updateProfile({ sexo, idade, peso, altura, meta, nivel, pesoAlvo });
    if (error) return toast('⚠️ Não foi possível salvar — tente novamente');

    if (user && peso) {
      try {
        await upsertWeightLog(user.id, TODAY_DATE, parseFloat(peso));
        setWeightLogs(await fetchWeightLogs(user.id));
      } catch (err) {
        console.error('upsertWeightLog:', err);
        enqueue('weight_log', { userId: user.id, date: TODAY_DATE, peso: parseFloat(peso) });
        markPending();
      }
    }
    toast('Perfil salvo!');
  }

  async function handleRegeneratePlan() {
    if (!user || regenerating) return;
    const pesoNum = parseFloat(peso);
    const alturaNum = parseFloat(altura);
    if (!pesoNum || !alturaNum) {
      toast('⚠️ Preencha peso e altura antes de gerar um novo treino');
      return;
    }
    if (!window.confirm('Isso cria um novo plano de treino com base nos seus dados atuais e o ativa. Seus planos existentes continuam salvos e podem ser reativados em "Editar treino". Continuar?')) return;

    setRegenerating(true);
    try {
      const generatedDays = await generatePlan({ peso: pesoNum, altura: alturaNum, meta, nivel });
      await createGeneratedPlan(user.id, `Plano gerado ${new Date().toLocaleDateString('pt-BR')}`, generatedDays);
      await refreshPlan();
      toast('✅ Novo treino gerado e ativado!');
    } catch (err) {
      console.error('regeneratePlan:', err);
      toast('⚠️ Erro ao gerar novo treino');
    } finally {
      setRegenerating(false);
    }
  }

  async function handleSaveWeeklyGoal() {
    localStorage.setItem('profile_weeklyGoal', weeklyGoal);
    const { error } = await updateProfile({ weeklyGoal });
    if (error) return toast('⚠️ Não foi possível salvar — tente novamente');
    toast('📅 Meta semanal salva!');
  }

  async function handleSaveWaterGoal() {
    localStorage.setItem('profile_macroAgua', macroAgua);
    const { error } = await updateProfile({ macroAgua });
    if (error) return toast('⚠️ Não foi possível salvar — tente novamente');
    toast('🎯 Meta de água salva!');
  }

  async function handleUpdateEmail() {
    if (!newEmail) return;
    const { error } = await updateEmail(newEmail);
    if (error) return toast(`⚠️ ${error}`);
    toast('✅ Confirme o e-mail enviado para a nova conta');
    setNewEmail('');
  }

  async function handleUpdatePassword() {
    if (!newPassword) return;
    const { error } = await updatePassword(newPassword);
    if (error) return toast(`⚠️ ${error}`);
    toast('✅ Senha atualizada');
    setNewPassword('');
  }

  async function handleDeleteAccount() {
    if (!window.confirm('Isso apaga seus treinos e dados salvos e encerra a sessão. Continuar?')) return;
    const { error } = await deleteAccount();
    if (error) toast(`⚠️ ${error}`);
  }

  const weeklyGoalNum = parseInt(weeklyGoal, 10) || DEFAULT_WEEKLY_GOAL;
  const imc = imcInfo(parseFloat(peso), parseFloat(altura));
  const progress = useMemo(
    () => metaProgress(parseFloat(peso), parseFloat(pesoAlvo), weightLogs),
    [peso, pesoAlvo, weightLogs]
  );
  const weightPoints = useMemo(
    () => weightLogs.map(w => ({ label: fmtDate(w.log_date), value: w.peso })),
    [weightLogs]
  );

  return (
    <section id="page-perfil" className="page active">
      <ProfileHeader
        user={user} avatarData={avatarData} uploadingAvatar={uploadingAvatar}
        onAvatarChange={handleAvatarChange} stats={stats} weeklyGoalNum={weeklyGoalNum}
      />

      <div className="section-group">
        <div className="section-group__label">Meus dados</div>

        <ProfilePersonalSection
          nome={nome} setNome={setNome} sobrenome={sobrenome} setSobrenome={setSobrenome}
          apelido={apelido} setApelido={setApelido} onSave={handleSavePersonal}
        />

        <ProfileBodySection
          sexo={sexo} setSexo={setSexo} idade={idade} setIdade={setIdade}
          peso={peso} setPeso={setPeso} altura={altura} setAltura={setAltura}
          meta={meta} setMeta={setMeta} nivel={nivel} setNivel={setNivel}
          pesoAlvo={pesoAlvo} setPesoAlvo={setPesoAlvo}
          progress={progress} imc={imc} onSave={handleSave}
          regenerating={regenerating} onRegeneratePlan={handleRegeneratePlan}
        />

        <WeeklyGoalSection weeklyGoal={weeklyGoal} setWeeklyGoal={setWeeklyGoal} onSave={handleSaveWeeklyGoal} />

        <MacrosSection
          macroAgua={macroAgua} setMacroAgua={setMacroAgua}
          onSave={handleSaveWaterGoal}
        />
      </div>

      <div className="section-group">
        <div className="section-group__label">Progresso</div>

        <div className="profile-section">
          <div className="profile-section__title">Evolução do peso</div>
          <div className="line-chart-wrap">
            <LineChart
              points={weightPoints}
              valueSuffix="kg"
              singleMsg={v => `1 registro: ${v}kg — salve seu peso novamente em outro dia para ver a evolução`}
              emptyMsg="Nenhum peso registrado ainda. Salve seus dados corporais acima para começar."
            />
          </div>
        </div>
      </div>

      <div className="section-group">
        <div className="section-group__label">Preferências</div>
        <ProfilePreferencesSection
          user={user} updateProfile={updateProfile} toast={toast}
          remindersEnabled={remindersEnabled} toggleReminders={toggleReminders}
          exporting={exporting} onExport={handleExport}
        />
      </div>

      <div className="section-group">
        <div className="section-group__label">Conta</div>
        <ProfileAccountSection
          user={user} accountOpen={accountOpen} setAccountOpen={setAccountOpen}
          newEmail={newEmail} setNewEmail={setNewEmail} onUpdateEmail={handleUpdateEmail}
          newPassword={newPassword} setNewPassword={setNewPassword} onUpdatePassword={handleUpdatePassword}
          onLogout={logout} onDeleteAccount={handleDeleteAccount}
        />
      </div>
    </section>
  );
}
