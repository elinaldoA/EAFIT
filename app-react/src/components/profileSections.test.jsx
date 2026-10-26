// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  fb: { sendFeedback: vi.fn(), fetchMyReplies: vi.fn() },
  tr: { fetchMyTrainer: vi.fn(), linkTrainer: vi.fn(), unlinkTrainer: vi.fn() },
  msgs: { fetchMyThread: vi.fn(), markMessagesRead: vi.fn(), sendReply: vi.fn() },
  photos: { fetchSharePhotos: vi.fn(), setSharePhotos: vi.fn() },
  goals: { fetchMyGoals: vi.fn() },
  notif: { supported: true, iosNotInstalled: false, sendNotification: vi.fn() },
}));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/feedback', async orig => ({ ...(await orig()), ...h.fb }));
vi.mock('../lib/trainer', async orig => ({ ...(await orig()), ...h.tr }));
vi.mock('../lib/trainerMessages', async orig => ({ ...(await orig()), ...h.msgs }));
vi.mock('../lib/trainerPhotos', () => h.photos);
vi.mock('../lib/trainerInsights', () => h.goals);
vi.mock('../lib/notifications', async orig => ({
  ...(await orig()),
  isNotificationSupported: () => h.notif.supported,
  isIosSafariNotInstalled: () => h.notif.iosNotInstalled,
  sendNotification: (...a) => h.notif.sendNotification(...a),
}));
vi.mock('./ChatThread', () => ({ default: () => <div data-testid="chat" /> }));
vi.mock('./MyAppointments', () => ({ default: () => <div data-testid="appointments" /> }));
vi.mock('../data/treinoData', async orig => ({ ...(await orig()), todayDate: () => '2026-10-07' }));

import CollapsibleCard from './CollapsibleCard';
import ProfileAccountSection from './ProfileAccountSection';
import ProfileBodySection from './ProfileBodySection';
import { WeeklyGoalSection, MacrosSection } from './ProfileGoalsSection';
import ProfileHeader from './ProfileHeader';
import ProfilePauseSection from './ProfilePauseSection';
import ProfilePersonalSection from './ProfilePersonalSection';
import ProfileFeedbackSection from './ProfileFeedbackSection';
import ProfileTrainerSection from './ProfileTrainerSection';
import { NotificationsSection, ExportSection } from './ProfilePreferencesSection';

beforeEach(() => {
  vi.clearAllMocks();
  h.notif.supported = true;
  h.notif.iosNotInstalled = false;
  h.fb.fetchMyReplies.mockResolvedValue([]);
  h.fb.sendFeedback.mockResolvedValue();
  h.tr.fetchMyTrainer.mockResolvedValue(null);
  h.tr.linkTrainer.mockResolvedValue();
  h.tr.unlinkTrainer.mockResolvedValue();
  h.msgs.markMessagesRead.mockResolvedValue();
  h.photos.fetchSharePhotos.mockResolvedValue(false);
  h.photos.setSharePhotos.mockResolvedValue();
  h.goals.fetchMyGoals.mockResolvedValue(null);
  h.notif.sendNotification.mockResolvedValue();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CollapsibleCard', () => {
  it('abre e fecha ao clicar no cabeçalho', () => {
    render(<CollapsibleCard icon="🔐" title="Título" summary="resumo"><p>corpo</p></CollapsibleCard>);
    const head = screen.getByRole('button', { name: /Título/ });
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('corpo')).toBeNull();
    fireEvent.click(head);
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('corpo')).toBeTruthy();
    fireEvent.click(head);
    expect(screen.queryByText('corpo')).toBeNull();
  });

  it('defaultOpen começa aberto e resumo é opcional', () => {
    render(<CollapsibleCard title="T" defaultOpen><p>corpo</p></CollapsibleCard>);
    expect(screen.getByText('corpo')).toBeTruthy();
    expect(document.querySelector('.collapse__summary')).toBeNull();
  });
});

describe('ProfileAccountSection', () => {
  const props = () => ({
    user: { email: 'a@x.com' },
    newEmail: '', setNewEmail: vi.fn(), onUpdateEmail: vi.fn(),
    newPassword: '', setNewPassword: vi.fn(), onUpdatePassword: vi.fn(),
    onLogout: vi.fn(), onDeleteAccount: vi.fn(),
  });

  it('mostra o e-mail no resumo e dispara atualizações', () => {
    const p = props();
    render(<ProfileAccountSection {...p} />);
    expect(screen.getByText('a@x.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /E-mail e senha/ }));
    fireEvent.change(screen.getByLabelText('Novo e-mail'), { target: { value: 'b@x.com' } });
    expect(p.setNewEmail).toHaveBeenCalledWith('b@x.com');
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: '123456' } });
    expect(p.setNewPassword).toHaveBeenCalledWith('123456');
    fireEvent.click(screen.getByText('Atualizar e-mail'));
    fireEvent.click(screen.getByText('Atualizar senha'));
    expect(p.onUpdateEmail).toHaveBeenCalled();
    expect(p.onUpdatePassword).toHaveBeenCalled();
  });

  it('sair da conta', () => {
    const p = props();
    render(<ProfileAccountSection {...p} />);
    fireEvent.click(screen.getByText('Sair da conta'));
    expect(p.onLogout).toHaveBeenCalled();
  });

  it('exclusão exige digitar EXCLUIR (sem diferenciar maiúsculas)', () => {
    const p = props();
    render(<ProfileAccountSection {...p} />);
    fireEvent.click(screen.getByText('Excluir minha conta'));
    const confirm = screen.getByText('Excluir permanentemente');
    expect(confirm.disabled).toBe(true);
    const input = screen.getByPlaceholderText('EXCLUIR');
    fireEvent.change(input, { target: { value: 'errado' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(input, { target: { value: ' excluir ' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(p.onDeleteAccount).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Excluir minha conta')).toBeTruthy();
  });

  it('cancelar a exclusão limpa o campo e volta ao link', () => {
    const p = props();
    render(<ProfileAccountSection {...p} />);
    fireEvent.click(screen.getByText('Excluir minha conta'));
    fireEvent.change(screen.getByPlaceholderText('EXCLUIR'), { target: { value: 'EXC' } });
    fireEvent.click(screen.getByText('Cancelar'));
    expect(p.onDeleteAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Excluir minha conta'));
    expect(screen.getByPlaceholderText('EXCLUIR').value).toBe('');
  });

  it('mostra a versão do app', () => {
    render(<ProfileAccountSection {...props()} />);
    expect(document.querySelector('.app-version').textContent).toMatch(/^EAFIT v\d+\.\d+\.\d+/);
  });
});

describe('ProfileBodySection', () => {
  const base = () => ({
    sexo: 'M', setSexo: vi.fn(), idade: '30', setIdade: vi.fn(), peso: '80', setPeso: vi.fn(),
    altura: '180', setAltura: vi.fn(), meta: 'massa', setMeta: vi.fn(), nivel: 'iniciante', setNivel: vi.fn(),
    pesoAlvo: '', setPesoAlvo: vi.fn(), progress: null, imc: null, onSave: vi.fn(),
    regenerating: false, onRegeneratePlan: vi.fn(),
  });

  it('propaga alterações de cada campo', () => {
    const p = base();
    render(<ProfileBodySection {...p} />);
    fireEvent.change(screen.getByLabelText('Sexo biológico'), { target: { value: 'F' } });
    fireEvent.change(screen.getByLabelText('Idade'), { target: { value: '31' } });
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '81' } });
    fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: '181' } });
    fireEvent.change(screen.getByLabelText('Meta principal'), { target: { value: 'forca' } });
    fireEvent.change(screen.getByLabelText('Nível de experiência'), { target: { value: 'avancado' } });
    fireEvent.change(screen.getByLabelText('Peso alvo (kg)'), { target: { value: '75' } });
    expect(p.setSexo).toHaveBeenCalledWith('F');
    expect(p.setIdade).toHaveBeenCalledWith('31');
    expect(p.setPeso).toHaveBeenCalledWith('81');
    expect(p.setAltura).toHaveBeenCalledWith('181');
    expect(p.setMeta).toHaveBeenCalledWith('forca');
    expect(p.setNivel).toHaveBeenCalledWith('avancado');
    expect(p.setPesoAlvo).toHaveBeenCalledWith('75');
  });

  it('salva e gera novo treino; desabilita enquanto gera', () => {
    const p = base();
    const { rerender } = render(<ProfileBodySection {...p} />);
    fireEvent.click(screen.getByText('Salvar dados corporais'));
    fireEvent.click(screen.getByText('🔄 Gerar novo treino com esses dados'));
    expect(p.onSave).toHaveBeenCalled();
    expect(p.onRegeneratePlan).toHaveBeenCalled();
    rerender(<ProfileBodySection {...p} regenerating />);
    expect(screen.getByText('Gerando novo treino…').disabled).toBe(true);
  });

  it('mostra IMC com vírgula e barra de progresso só quando não concluída', () => {
    const p = base();
    const { rerender } = render(<ProfileBodySection {...p} imc={{ value: '24.7', cls: 'Normal' }} progress={{ msg: '50% da meta', pct: 50, done: false }} />);
    expect(screen.getByText('24,7')).toBeTruthy();
    expect(screen.getByText('Normal')).toBeTruthy();
    expect(screen.getByText('50% da meta')).toBeTruthy();
    expect(document.querySelector('.progress-card__fill').style.width).toBe('50%');
    rerender(<ProfileBodySection {...p} progress={{ msg: 'Meta atingida!', pct: 100, done: true }} />);
    expect(document.querySelector('.progress-card__fill')).toBeNull();
  });
});

describe('ProfileGoalsSection', () => {
  it('meta semanal', () => {
    const setWeeklyGoal = vi.fn();
    const onSave = vi.fn();
    render(<WeeklyGoalSection weeklyGoal="4" setWeeklyGoal={setWeeklyGoal} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Treinos por semana'), { target: { value: '5' } });
    expect(setWeeklyGoal).toHaveBeenCalledWith('5');
    fireEvent.click(screen.getByText('Salvar meta semanal'));
    expect(onSave).toHaveBeenCalled();
  });

  it('meta de água usa a sugestão com vírgula no texto e no placeholder', () => {
    const setMacroAgua = vi.fn();
    const onSave = vi.fn();
    render(<MacrosSection macroAgua="" setMacroAgua={setMacroAgua} onSave={onSave} suggestedGoal={2.8} />);
    expect(screen.getByLabelText('Meta de água (L)').getAttribute('placeholder')).toBe('2.8');
    expect(screen.getByText(/usar 2,8 L/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Meta de água (L)'), { target: { value: '3' } });
    expect(setMacroAgua).toHaveBeenCalledWith('3');
    fireEvent.click(screen.getByText('Salvar meta de água'));
    expect(onSave).toHaveBeenCalled();
  });
});

describe('ProfileHeader', () => {
  const user = { email: 'ana@x.com', created_at: '2026-01-15T12:00:00Z', user_metadata: { apelido: 'Aninha' } };

  it('mostra apelido, e-mail, estatísticas e meta semanal', () => {
    render(<ProfileHeader user={user} avatarData={null} uploadingAvatar={false} onAvatarChange={vi.fn()} stats={{ week: 3, streak: 5, total: 40 }} weeklyGoalNum={4} />);
    expect(screen.getByText('Aninha')).toBeTruthy();
    expect(screen.getByText('ana@x.com')).toBeTruthy();
    expect(screen.getByText('3/4')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('semana ainda não numérica aparece sem a meta', () => {
    render(<ProfileHeader user={user} stats={{ week: '–', streak: 0, total: 0 }} weeklyGoalNum={4} />);
    expect(screen.getByText('–', { selector: '.stat-card__value' })).toBeTruthy();
  });

  it('usa a foto quando existe e bloqueia upload em andamento', () => {
    render(<ProfileHeader user={user} avatarData="data:img" uploadingAvatar onAvatarChange={vi.fn()} stats={{ week: 0, streak: 0, total: 0 }} weeklyGoalNum={3} />);
    expect(screen.getByAltText('Foto de perfil').getAttribute('src')).toBe('data:img');
    expect(document.querySelector('input[type="file"]').disabled).toBe(true);
  });

  it('não repete o e-mail quando ele é o nome exibido', () => {
    render(<ProfileHeader user={{ email: 'solo@x.com', created_at: '2026-01-01T12:00:00Z' }} stats={{ week: 0, streak: 0, total: 0 }} weeklyGoalNum={3} />);
    expect(screen.getAllByText('solo@x.com')).toHaveLength(1);
  });

  it('avatar vazio mostra "?" e sem usuário mostra travessão', () => {
    render(<ProfileHeader user={null} stats={{ week: 0, streak: 0, total: 0 }} weeklyGoalNum={3} />);
    expect(screen.getByText('?')).toBeTruthy();
    expect(screen.getAllByText('–').length).toBeGreaterThan(0);
  });

  it('dispara onAvatarChange ao escolher arquivo', () => {
    const onAvatarChange = vi.fn();
    render(<ProfileHeader user={user} onAvatarChange={onAvatarChange} stats={{ week: 0, streak: 0, total: 0 }} weeklyGoalNum={3} />);
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    expect(onAvatarChange).toHaveBeenCalled();
  });
});

describe('ProfilePauseSection', () => {
  it('inicia uma pausa e avisa', async () => {
    const updateProfile = vi.fn().mockResolvedValue({});
    const toast = vi.fn();
    render(<ProfilePauseSection user={{ user_metadata: {} }} updateProfile={updateProfile} toast={toast} />);
    fireEvent.click(screen.getByText('Pausar 7 dias'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('⏸ Pausa ativada por 7 dias'));
    expect(updateProfile.mock.calls[0][0]).toMatchObject({ pausedUntil: '2026-10-13' });
    expect(screen.queryByText('▶️ Retomar agora')).toBeNull();
  });

  it('com pausa ativa, mostra o fim, estende e retoma', async () => {
    const updateProfile = vi.fn().mockResolvedValue({});
    const toast = vi.fn();
    const user = { user_metadata: { pausedUntil: '2026-10-10', pauses: [{ from: '2026-10-05', to: '2026-10-10' }] } };
    render(<ProfilePauseSection user={user} updateProfile={updateProfile} toast={toast} />);
    expect(screen.getByRole('status').textContent).toContain('10/10');
    fireEvent.click(screen.getByText('Pausar mais 14 dias'));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile.mock.calls[0][0].pausedUntil).toBe('2026-10-20');
    fireEvent.click(screen.getByText('▶️ Retomar agora'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('▶️ Pausa encerrada. Bom treino!'));
    expect(updateProfile.mock.calls[1][0]).toMatchObject({ pausedUntil: null });
  });

  it('mostra o erro do updateProfile no toast', async () => {
    const toast = vi.fn();
    render(<ProfilePauseSection user={{ user_metadata: {} }} updateProfile={vi.fn().mockResolvedValue({ error: { message: 'falhou' } })} toast={toast} />);
    fireEvent.click(screen.getByText('Pausar 30 dias'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('❌ falhou'));
  });
});

describe('ProfilePersonalSection', () => {
  it('propaga nome, sobrenome e apelido e salva', () => {
    const p = { nome: '', setNome: vi.fn(), sobrenome: '', setSobrenome: vi.fn(), apelido: '', setApelido: vi.fn(), onSave: vi.fn() };
    render(<ProfilePersonalSection {...p} />);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Sobrenome'), { target: { value: 'Souza' } });
    fireEvent.change(screen.getByLabelText('Apelido'), { target: { value: 'Aninha' } });
    fireEvent.click(screen.getByText('Salvar dados pessoais'));
    expect(p.setNome).toHaveBeenCalledWith('Ana');
    expect(p.setSobrenome).toHaveBeenCalledWith('Souza');
    expect(p.setApelido).toHaveBeenCalledWith('Aninha');
    expect(p.onSave).toHaveBeenCalled();
  });
});

describe('ProfileFeedbackSection', () => {
  const toast = vi.fn();

  it('envia feedback válido, limpa o texto e agradece', async () => {
    render(<ProfileFeedbackSection userId="u1" toast={toast} />);
    const send = screen.getByText('Enviar feedback');
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'elogio' } });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: '  Muito bom o app  ' } });
    expect(screen.getByText('19/1000')).toBeTruthy();
    fireEvent.click(send);
    await waitFor(() => expect(h.fb.sendFeedback).toHaveBeenCalledWith('u1', 'elogio', 'Muito bom o app'));
    expect(toast).toHaveBeenCalledWith('✅ Obrigado! Recebemos seu feedback.');
    expect(screen.getByLabelText('Mensagem').value).toBe('');
  });

  it('rejeita mensagem curta sem enviar', () => {
    render(<ProfileFeedbackSection userId="u1" toast={toast} />);
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'oi' } });
    fireEvent.click(screen.getByText('Enviar feedback'));
    expect(screen.getByRole('alert').textContent).toMatch(/Escreva um pouco mais/);
    expect(h.fb.sendFeedback).not.toHaveBeenCalled();
  });

  it('mostra erro amigável do limite diário e mantém o texto', async () => {
    h.fb.sendFeedback.mockRejectedValue(new Error('new row violates row-level security'));
    render(<ProfileFeedbackSection userId="u1" toast={toast} />);
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Mensagem longa o bastante' } });
    fireEvent.click(screen.getByText('Enviar feedback'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/vários feedbacks hoje/);
    expect(screen.getByLabelText('Mensagem').value).toBe('Mensagem longa o bastante');
  });

  it('lista as respostas da equipe', async () => {
    h.fb.fetchMyReplies.mockResolvedValue([{ id: 'r1', message: 'Bug no treino', admin_reply: 'Corrigido!' }]);
    render(<ProfileFeedbackSection userId="u1" toast={toast} />);
    expect(await screen.findByText('💬 Corrigido!')).toBeTruthy();
    expect(screen.getByText('Você: Bug no treino')).toBeTruthy();
  });
});

describe('ProfileTrainerSection', () => {
  const toast = vi.fn();

  it('mostra carregando e depois o formulário sem personal', async () => {
    render(<ProfileTrainerSection toast={toast} />);
    expect(screen.getByText('Carregando…')).toBeTruthy();
    expect(await screen.findByLabelText('Código do personal')).toBeTruthy();
  });

  it('só habilita vincular com código e autorização', async () => {
    render(<ProfileTrainerSection toast={toast} />);
    const btn = await screen.findByText('Vincular ao personal');
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Código do personal'), { target: { value: 'p1a2b3' } });
    expect(btn.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(btn.disabled).toBe(false);
  });

  it('código curto demais mostra erro', async () => {
    render(<ProfileTrainerSection toast={toast} />);
    await screen.findByLabelText('Código do personal');
    fireEvent.change(screen.getByLabelText('Código do personal'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Vincular ao personal'));
    expect(screen.getByRole('alert').textContent).toBe('Digite o código do seu personal.');
    expect(h.tr.linkTrainer).not.toHaveBeenCalled();
  });

  it('vincula com o código normalizado e passa a mostrar o personal', async () => {
    h.tr.fetchMyTrainer.mockResolvedValueOnce(null).mockResolvedValueOnce({ name: 'Carlos' });
    const onChange = vi.fn();
    render(<ProfileTrainerSection toast={toast} onChange={onChange} />);
    await screen.findByLabelText('Código do personal');
    fireEvent.change(screen.getByLabelText('Código do personal'), { target: { value: ' p1a2b3 ' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Vincular ao personal'));
    await waitFor(() => expect(h.tr.linkTrainer).toHaveBeenCalledWith('P1A2B3'));
    expect(await screen.findByText('Carlos')).toBeTruthy();
    expect(toast).toHaveBeenCalledWith('🤝 Vinculado ao seu personal');
    expect(onChange).toHaveBeenLastCalledWith({ name: 'Carlos' });
  });

  it('mostra erro amigável quando o código não existe', async () => {
    h.tr.linkTrainer.mockRejectedValue(new Error('invalid_code'));
    render(<ProfileTrainerSection toast={toast} />);
    await screen.findByLabelText('Código do personal');
    fireEvent.change(screen.getByLabelText('Código do personal'), { target: { value: 'ZZZZZZ' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Vincular ao personal'));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('aluno vinculado: mostra metas, chat, e marca recados como lidos', async () => {
    h.tr.fetchMyTrainer.mockResolvedValue({ name: 'Carlos' });
    h.goals.fetchMyGoals.mockResolvedValue({ weekly: 4, weight: 72.5, note: 'Foco em pernas' });
    render(<ProfileTrainerSection toast={toast} />);
    expect(await screen.findByText('Carlos')).toBeTruthy();
    expect(await screen.findByText('4 treinos por semana · peso alvo 72,5 kg')).toBeTruthy();
    expect(screen.getByText('Foco em pernas')).toBeTruthy();
    expect(screen.getByTestId('chat')).toBeTruthy();
    expect(screen.getByTestId('appointments')).toBeTruthy();
    expect(h.msgs.markMessagesRead).toHaveBeenCalled();
  });

  it('compartilhar fotos persiste e desfaz se falhar', async () => {
    h.tr.fetchMyTrainer.mockResolvedValue({ name: 'Carlos' });
    render(<ProfileTrainerSection toast={toast} />);
    const box = await screen.findByRole('checkbox');
    fireEvent.click(box);
    await waitFor(() => expect(h.photos.setSharePhotos).toHaveBeenCalledWith(true));
    expect(toast).toHaveBeenCalledWith('📸 Fotos compartilhadas com seu personal');
    h.photos.setSharePhotos.mockRejectedValue(new Error('x'));
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('❌ Não foi possível salvar'));
    expect(screen.getByRole('checkbox').checked).toBe(true);
  });

  it('encerrar vínculo pede confirmação', async () => {
    h.tr.fetchMyTrainer.mockResolvedValue({ name: 'Carlos' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onChange = vi.fn();
    render(<ProfileTrainerSection toast={toast} onChange={onChange} />);
    fireEvent.click(await screen.findByText('Encerrar vínculo'));
    expect(h.tr.unlinkTrainer).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText('Encerrar vínculo'));
    await waitFor(() => expect(h.tr.unlinkTrainer).toHaveBeenCalled());
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(toast).toHaveBeenCalledWith('Vínculo encerrado');
    expect(await screen.findByLabelText('Código do personal')).toBeTruthy();
  });

  it('falha ao buscar personal cai no formulário', async () => {
    h.tr.fetchMyTrainer.mockRejectedValue(new Error('offline'));
    render(<ProfileTrainerSection toast={toast} />);
    expect(await screen.findByLabelText('Código do personal')).toBeTruthy();
  });
});

describe('ProfilePreferencesSection', () => {
  const user = (md = {}) => ({ user_metadata: md });

  it('NotificationsSection: horário de treino salva e avisa', async () => {
    const updateProfile = vi.fn().mockResolvedValue({});
    const toast = vi.fn();
    render(<NotificationsSection user={user()} updateProfile={updateProfile} toast={toast} remindersEnabled toggleReminders={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Horário em que costumo treinar'), { target: { value: '7' } });
    await waitFor(() => expect(toast).toHaveBeenCalledWith('⏰ Horário salvo'));
    expect(updateProfile).toHaveBeenCalledWith({ trainingHour: 7 });
    fireEvent.change(screen.getByLabelText('Horário em que costumo treinar'), { target: { value: '' } });
    await waitFor(() => expect(updateProfile).toHaveBeenLastCalledWith({ trainingHour: null }));
  });

  it('NotificationsSection: preferências ficam desabilitadas sem lembretes e salvam ao marcar', async () => {
    const updateProfile = vi.fn().mockResolvedValue({});
    const { rerender } = render(<NotificationsSection user={user({ notifyRecords: false })} updateProfile={updateProfile} toast={vi.fn()} remindersEnabled={false} toggleReminders={vi.fn()} />);
    const recordsBox = screen.getByLabelText('Recordes e conquistas');
    expect(recordsBox.disabled).toBe(true);
    expect(recordsBox.checked).toBe(false);
    rerender(<NotificationsSection user={user({ notifyRecords: false })} updateProfile={updateProfile} toast={vi.fn()} remindersEnabled toggleReminders={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Recordes e conquistas'));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ notifyRecords: true }));
  });

  it('NotificationsSection: alterna lembretes e envia notificação de teste', async () => {
    const toggleReminders = vi.fn();
    const toast = vi.fn();
    render(<NotificationsSection user={user()} updateProfile={vi.fn()} toast={toast} remindersEnabled toggleReminders={toggleReminders} />);
    fireEvent.click(screen.getByLabelText(/Lembretes de refeição/));
    expect(toggleReminders).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Testar notificação'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('✅ Notificação enviada'));
  });

  it('NotificationsSection: erro no teste vira toast de falha', async () => {
    h.notif.sendNotification.mockRejectedValue(new Error('bloqueada'));
    const toast = vi.fn();
    render(<NotificationsSection user={user()} updateProfile={vi.fn()} toast={toast} remindersEnabled toggleReminders={vi.fn()} />);
    fireEvent.click(screen.getByText('Testar notificação'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('❌ Falhou: bloqueada'));
  });

  it('NotificationsSection: sem suporte, desabilita e explica (inclusive iOS)', () => {
    h.notif.supported = false;
    const { unmount } = render(<NotificationsSection user={user()} updateProfile={vi.fn()} toast={vi.fn()} remindersEnabled toggleReminders={vi.fn()} />);
    expect(screen.getByText('Notificações não são suportadas neste navegador.')).toBeTruthy();
    expect(screen.getByText('Testar notificação').disabled).toBe(true);
    unmount();
    h.notif.iosNotInstalled = true;
    render(<NotificationsSection user={user()} updateProfile={vi.fn()} toast={vi.fn()} remindersEnabled toggleReminders={vi.fn()} />);
    expect(screen.getByText(/No iPhone\/iPad/)).toBeTruthy();
  });

  it('ExportSection: chama onExport com cada exportador e desabilita durante exportação', () => {
    const onExport = vi.fn();
    const { rerender } = render(<ExportSection exporting={false} onExport={onExport} />);
    fireEvent.click(screen.getByText('📊 Resumo (CSV)'));
    fireEvent.click(screen.getByText('💾 Backup completo (JSON)'));
    fireEvent.click(screen.getByText('🖨️ Relatório para imprimir'));
    expect(onExport.mock.calls.map(c => c[1])).toEqual(['o resumo (CSV)', 'o backup (JSON)', 'o relatório']);
    expect(onExport.mock.calls.every(c => typeof c[0] === 'function')).toBe(true);
    rerender(<ExportSection exporting onExport={onExport} />);
    expect(screen.getByText('📊 Resumo (CSV)').disabled).toBe(true);
  });
});
