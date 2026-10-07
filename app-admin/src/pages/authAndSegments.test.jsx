// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { auth, seg } = vi.hoisted(() => ({
  auth: { current: {} },
  seg: { fetchSegments: vi.fn(), deleteSegment: vi.fn(), countSegment: vi.fn(), describeFilters: vi.fn() },
}));

vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => auth.current }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/segments', () => seg);

import Login from './Login';
import ResetPassword from './ResetPassword';
import Profile from './Profile';
import Segments from './Segments';

const wrap = ui => render(<MemoryRouter>{ui}</MemoryRouter>);
const typeInto = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  auth.current = {
    adminUser: null,
    login: vi.fn().mockResolvedValue({}),
    requestPasswordReset: vi.fn().mockResolvedValue({}),
    updatePassword: vi.fn().mockResolvedValue({}),
    updateProfile: vi.fn().mockResolvedValue({}),
    finishRecovery: vi.fn(),
    logout: vi.fn(),
  };
});

describe('Login', () => {
  it('envia e-mail e senha para login', async () => {
    wrap(<Login />);
    typeInto('E-mail', 'a@b.com');
    typeInto('Senha', 'segredo');
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(auth.current.login).toHaveBeenCalledWith('a@b.com', 'segredo'));
  });

  it('mostra o erro devolvido pelo login', async () => {
    auth.current.login.mockResolvedValue({ error: 'E-mail ou senha inválidos.' });
    wrap(<Login />);
    typeInto('E-mail', 'a@b.com');
    typeInto('Senha', 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('E-mail ou senha inválidos.')).toBeTruthy();
  });

  it('esqueci a senha exige e-mail preenchido', () => {
    wrap(<Login />);
    fireEvent.click(screen.getByText('Esqueci minha senha'));
    expect(screen.getByText(/Preencha o e-mail/)).toBeTruthy();
    expect(auth.current.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('esqueci a senha pede o link e mostra aviso neutro', async () => {
    wrap(<Login />);
    typeInto('E-mail', 'a@b.com');
    fireEvent.click(screen.getByText('Esqueci minha senha'));
    expect(await screen.findByText(/enviamos um link/)).toBeTruthy();
    expect(auth.current.requestPasswordReset).toHaveBeenCalledWith('a@b.com');
  });

  it('já logado não mostra o formulário', () => {
    auth.current.adminUser = { email: 'a@b.com' };
    wrap(<Login />);
    expect(screen.queryByRole('button', { name: 'Entrar' })).toBeNull();
  });
});

describe('ResetPassword', () => {
  it('bloqueia senhas diferentes', () => {
    wrap(<ResetPassword />);
    typeInto('Nova senha', '123456');
    typeInto('Confirmar nova senha', '654321');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect(screen.getByText('As senhas não coincidem.')).toBeTruthy();
    expect(auth.current.updatePassword).not.toHaveBeenCalled();
  });

  it('salva e finaliza a recuperação', async () => {
    wrap(<ResetPassword />);
    typeInto('Nova senha', '123456');
    typeInto('Confirmar nova senha', '123456');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    await waitFor(() => expect(auth.current.finishRecovery).toHaveBeenCalled());
    expect(auth.current.updatePassword).toHaveBeenCalledWith('123456');
  });

  it('mantém a tela e mostra o erro se falhar', async () => {
    auth.current.updatePassword.mockResolvedValue({ error: 'fraca' });
    wrap(<ResetPassword />);
    typeInto('Nova senha', '123456');
    typeInto('Confirmar nova senha', '123456');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect(await screen.findByText('fraca')).toBeTruthy();
    expect(auth.current.finishRecovery).not.toHaveBeenCalled();
  });
});

describe('Profile', () => {
  beforeEach(() => {
    auth.current.adminUser = { email: 'adm@x.com', user_metadata: { nome: 'Ana' } };
  });

  it('carrega e-mail e nome atuais', () => {
    render(<Profile />);
    expect(screen.getByLabelText('E-mail').value).toBe('adm@x.com');
    expect(screen.getByLabelText('Nome').value).toBe('Ana');
  });

  it('salva o nome', async () => {
    render(<Profile />);
    typeInto('Nome', 'Bia');
    fireEvent.click(screen.getByText('Salvar perfil'));
    expect(await screen.findByText('Perfil atualizado.')).toBeTruthy();
    expect(auth.current.updateProfile).toHaveBeenCalledWith({ nome: 'Bia' });
  });

  it('mostra erro ao salvar perfil', async () => {
    auth.current.updateProfile.mockResolvedValue({ error: 'falhou' });
    render(<Profile />);
    fireEvent.click(screen.getByText('Salvar perfil'));
    expect(await screen.findByText('Erro: falhou')).toBeTruthy();
  });

  it('botão de senha fica desabilitado sem texto e limpa o campo após sucesso', async () => {
    render(<Profile />);
    expect(screen.getByText('Atualizar senha').disabled).toBe(true);
    typeInto('Nova senha', 'abcdef');
    fireEvent.click(screen.getByText('Atualizar senha'));
    expect(await screen.findByText('Senha atualizada.')).toBeTruthy();
    expect(auth.current.updatePassword).toHaveBeenCalledWith('abcdef');
    expect(screen.getByLabelText('Nova senha').value).toBe('');
  });

  it('mantém a senha digitada quando dá erro', async () => {
    auth.current.updatePassword.mockResolvedValue({ error: 'curta' });
    render(<Profile />);
    typeInto('Nova senha', 'abc');
    fireEvent.click(screen.getByText('Atualizar senha'));
    expect(await screen.findByText('Erro: curta')).toBeTruthy();
    expect(screen.getByLabelText('Nova senha').value).toBe('abc');
  });

  it('Sair chama logout', () => {
    render(<Profile />);
    fireEvent.click(screen.getByText('Sair'));
    expect(auth.current.logout).toHaveBeenCalled();
  });
});

describe('Segments', () => {
  const list = [
    { id: 's1', name: 'Iniciantes', filters: { nivel: 'iniciante' }, created_at: '2026-03-05T12:00:00Z' },
    { id: 's2', name: 'Massa', filters: { meta: 'massa' }, created_at: '2026-03-06T12:00:00Z' },
  ];

  beforeEach(() => {
    seg.fetchSegments.mockResolvedValue(list);
    seg.countSegment.mockImplementation(async s => (s.id === 's1' ? 42 : Promise.reject(new Error('x'))));
    seg.describeFilters.mockImplementation(f => `filtro:${Object.values(f)[0]}`);
    seg.deleteSegment.mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('lista segmentos com contagem e traço quando a contagem falha', async () => {
    wrap(<Segments />);
    expect(await screen.findByText('Iniciantes')).toBeTruthy();
    expect(screen.getByText('filtro:iniciante')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('42')).toBeTruthy());
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('mostra estado vazio', async () => {
    seg.fetchSegments.mockResolvedValue([]);
    wrap(<Segments />);
    expect(await screen.findByText('Nenhum segmento salvo ainda.')).toBeTruthy();
  });

  it('mostra erro de carregamento', async () => {
    seg.fetchSegments.mockRejectedValue(new Error('sem acesso'));
    wrap(<Segments />);
    expect(await screen.findByText('sem acesso')).toBeTruthy();
  });

  it('exclui após confirmar e recarrega', async () => {
    wrap(<Segments />);
    await screen.findByText('Iniciantes');
    fireEvent.click(screen.getAllByText('Excluir')[0]);
    await waitFor(() => expect(seg.deleteSegment).toHaveBeenCalledWith('s1'));
    await waitFor(() => expect(seg.fetchSegments).toHaveBeenCalledTimes(2));
  });

  it('não exclui se o usuário cancelar', async () => {
    window.confirm.mockReturnValue(false);
    wrap(<Segments />);
    await screen.findByText('Iniciantes');
    fireEvent.click(screen.getAllByText('Excluir')[0]);
    expect(seg.deleteSegment).not.toHaveBeenCalled();
  });

  it('mostra erro se a exclusão falhar', async () => {
    seg.deleteSegment.mockRejectedValue(new Error('não deu'));
    wrap(<Segments />);
    await screen.findByText('Iniciantes');
    fireEvent.click(screen.getAllByText('Excluir')[0]);
    expect(await screen.findByText('não deu')).toBeTruthy();
  });
});
