// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const { mockFrom, auth } = vi.hoisted(() => ({ mockFrom: vi.fn(), auth: { current: {} } }));

vi.mock('../lib/supabase', () => ({ db: { from: mockFrom } }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => auth.current }));
vi.mock('../context/AdminAuthContext', () => ({ AdminAuthProvider: ({ children }) => <>{children}</> }));
vi.mock('../context/ThemeContext', () => ({ ThemeProvider: ({ children }) => <>{children}</> }));
vi.mock('../context/useTheme', () => ({ useTheme: () => ({ theme: 'dark', toggleTheme: () => {} }) }));
vi.mock('../components/Layout/Layout', async () => {
  const { Outlet } = await import('react-router-dom');
  return { default: () => <div><span>layout</span><Outlet /></div> };
});
// Páginas pesadas viram marcadores: o objetivo aqui é testar as rotas.
vi.mock('./Dashboard', () => ({ default: () => <div>pg-dashboard</div> }));
vi.mock('./UsersList', () => ({ default: () => <div>pg-users</div> }));
vi.mock('./Profile', () => ({ default: () => <div>pg-perfil</div> }));
vi.mock('./Login', () => ({ default: () => <div>pg-login</div> }));
vi.mock('./ResetPassword', () => ({ default: () => <div>pg-reset</div> }));
vi.mock('./Trainers', () => ({ default: () => <div>pg-personais</div> }));

import LandingEditor from './LandingEditor';
import App from '../App';

const content = () => ({
  theme: { primaryColor: '#123456' },
  sections: [
    { id: 'h', type: 'hero', enabled: true, badge: 'B', titleTop: 'T1', titleBottom: 'T2', titleHighlight: 'HL', lead: 'L', ctaPrimaryLabel: 'P', ctaSecondaryLabel: 'S' },
    { id: 'hi', type: 'highlights', enabled: true, items: [{ icon: 'cloud', label: 'Sync' }] },
    { id: 'c', type: 'compare', enabled: false, title: 'Comp', subtitle: 'sub', badLabel: 'Ruim', badItems: ['a', 'b'], goodLabel: 'Bom', goodItems: ['c'] },
    { id: 'f', type: 'faq', enabled: true, title: 'FAQ', subtitle: '', items: [{ question: 'Q1', answer: 'A1' }] },
    { id: 's', type: 'stats', enabled: true },
  ],
});

describe('LandingEditor', () => {
  let updateSpy;
  let updateEq;

  beforeEach(() => {
    vi.clearAllMocks();
    updateEq = vi.fn().mockResolvedValue({ error: null });
    updateSpy = vi.fn(() => ({ eq: updateEq }));
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { content: content() }, error: null }) }) }),
      update: updateSpy,
    });
  });

  it('carrega e mostra as seções com seus rótulos', async () => {
    render(<LandingEditor />);
    expect(await screen.findByText('Topo (hero)')).toBeTruthy();
    expect(screen.getByText('Faixa de destaques')).toBeTruthy();
    expect(screen.getByText('Perguntas frequentes')).toBeTruthy();
    expect(screen.getByDisplayValue('T1')).toBeTruthy();
    expect(screen.getByText(/Os números vêm do banco/)).toBeTruthy();
  });

  it('mostra erro de carregamento', async () => {
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: new Error('rls') }) }) }) });
    render(<LandingEditor />);
    expect(await screen.findByText('rls')).toBeTruthy();
  });

  it('edita um campo e salva o conteúdo completo', async () => {
    render(<LandingEditor />);
    await screen.findByText('Topo (hero)');
    fireEvent.change(screen.getByDisplayValue('T1'), { target: { value: 'Novo título' } });
    fireEvent.click(screen.getByText('Salvar'));
    expect(await screen.findByText(/Salvo! A landing page/)).toBeTruthy();
    const saved = updateSpy.mock.calls[0][0].content;
    expect(saved.sections[0].titleTop).toBe('Novo título');
    expect(saved.theme.primaryColor).toBe('#123456');
    expect(updateEq).toHaveBeenCalledWith('id', 1);
  });

  it('mostra erro ao salvar', async () => {
    updateEq.mockResolvedValue({ error: new Error('falhou') });
    render(<LandingEditor />);
    await screen.findByText('Topo (hero)');
    fireEvent.click(screen.getByText('Salvar'));
    expect(await screen.findByText('Erro: falhou')).toBeTruthy();
  });

  it('alterna a visibilidade de uma seção', async () => {
    render(<LandingEditor />);
    await screen.findByText('Topo (hero)');
    const box = within(screen.getByText('Comparação (sem plano vs. com EAFIT)').closest('.day-editor')).getByRole('checkbox');
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(updateSpy.mock.calls[0][0].content.sections[2].enabled).toBe(true));
  });

  it('reordena seções e desabilita os limites', async () => {
    render(<LandingEditor />);
    await screen.findByText('Topo (hero)');
    const ups = screen.getAllByTitle('Mover para cima');
    const sectionHeads = () => screen.getAllByText(/Topo|Faixa de destaques/).map(e => e.textContent);
    expect(ups[0].disabled).toBe(true);
    fireEvent.click(screen.getAllByTitle('Mover para baixo')[0]);
    expect(sectionHeads()[0]).toBe('Faixa de destaques');
  });

  it('comparação: converte linhas do textarea em lista sem vazios', async () => {
    render(<LandingEditor />);
    await screen.findByText('Topo (hero)');
    fireEvent.change(screen.getByLabelText('Itens (coluna ruim, um por linha)'), { target: { value: 'x\n\n  y  \n' } });
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(updateSpy.mock.calls[0][0].content.sections[2].badItems).toEqual(['x', 'y']));
  });

  it('altera a cor principal', async () => {
    render(<LandingEditor />);
    await screen.findByText('Topo (hero)');
    fireEvent.change(screen.getByDisplayValue('#123456'), { target: { value: '#ff0000' } });
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(updateSpy.mock.calls[0][0].content.theme.primaryColor).toBe('#ff0000'));
  });

  it('adiciona, edita e remove itens de listas (FAQ)', async () => {
    render(<LandingEditor />);
    await screen.findByText('Topo (hero)');
    fireEvent.click(screen.getByText('+ Adicionar pergunta'));
    const questions = screen.getAllByLabelText('Pergunta');
    expect(questions).toHaveLength(2);
    fireEvent.change(questions[1], { target: { value: 'Q2' } });
    fireEvent.click(screen.getAllByTitle('Remover').at(-2));
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => {
      const faq = updateSpy.mock.calls[0][0].content.sections[3];
      expect(faq.items.map(i => i.question)).toEqual(['Q2']);
    });
  });
});

describe('App', () => {
  beforeEach(() => {
    window.location.hash = '#/';
    auth.current = { recoveryMode: false, adminUser: { email: 'a@x.com' }, authLoading: false };
  });

  it('renderiza a tela de redefinição fora do roteador em modo de recuperação', () => {
    auth.current = { recoveryMode: true, adminUser: null, authLoading: false };
    render(<App />);
    expect(screen.getByText('pg-reset')).toBeTruthy();
  });

  it('admin logado vê o Dashboard dentro do Layout', () => {
    render(<App />);
    expect(screen.getByText('pg-dashboard')).toBeTruthy();
    expect(screen.getByText('layout')).toBeTruthy();
  });

  it('rota protegida redireciona para /login sem sessão', () => {
    auth.current = { recoveryMode: false, adminUser: null, authLoading: false };
    render(<App />);
    expect(screen.getByText('pg-login')).toBeTruthy();
  });

  it('navega por hash para outras rotas', () => {
    window.location.hash = '#/personais';
    render(<App />);
    expect(screen.getByText('pg-personais')).toBeTruthy();
  });

  it('rota desconhecida volta para o Dashboard', () => {
    window.location.hash = '#/nao-existe';
    render(<App />);
    expect(screen.getByText('pg-dashboard')).toBeTruthy();
  });
});
