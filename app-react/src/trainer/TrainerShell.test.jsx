// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 't1', user_metadata: { nome: 'Carla Dias' } } }) }));
vi.mock('../components/ThemeToggle', () => ({ default: () => <button type="button">tema</button> }));
vi.mock('../components/Tutorial', () => ({ default: ({ role }) => <div data-testid="tutorial">{role}</div> }));
vi.mock('./PainelPage', () => ({ default: ({ userName, onQueueLoaded, onOpenClient, onNavigate }) => (
  <div data-testid="p-painel">
    <span>{userName}</span>
    <button type="button" onClick={() => onQueueLoaded(4)}>carregou</button>
    <button type="button" onClick={() => onOpenClient({ id: 'c9', name: 'Bia' })}>abrir Bia</button>
    <button type="button" onClick={() => onNavigate('turma', 'desafios')}>ir desafios</button>
  </div>
) }));
vi.mock('./AlunosPage', () => ({ default: ({ openClient }) => <div data-testid="p-alunos">{openClient ? `aberto ${openClient.name}` : ''}</div> }));
vi.mock('./TemplatesPage', () => ({ default: () => <div data-testid="p-modelos" /> }));
vi.mock('./TurmaPage', () => ({ default: ({ view }) => <div data-testid="p-turma">{view}</div> }));
vi.mock('./TrainerAccount', () => ({ default: ({ onSwitchToStudent }) => (
  <div data-testid="p-conta"><button type="button" onClick={onSwitchToStudent}>virar aluno</button></div>
) }));

import TrainerShell from './TrainerShell';

beforeEach(() => window.history.replaceState(null, '', '/'));
afterEach(cleanup);

describe('TrainerShell', () => {
  it('abre no Painel com o nome do personal e mostra o tutorial do personal', () => {
    render(<TrainerShell onSwitchToStudent={() => {}} />);
    expect(screen.getByTestId('p-painel')).toBeTruthy();
    expect(screen.getByText('Carla Dias')).toBeTruthy();
    expect(screen.getByTestId('tutorial').textContent).toBe('trainer');
  });

  it('a navegação troca de página', () => {
    render(<TrainerShell onSwitchToStudent={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Alunos/ }));
    expect(screen.getByTestId('p-alunos')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Modelos/ }));
    expect(screen.getByTestId('p-modelos')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Turma/ }));
    expect(screen.getByTestId('p-turma').textContent).toBe('recados');
    fireEvent.click(screen.getByRole('button', { name: /Conta/ }));
    expect(screen.getByTestId('p-conta')).toBeTruthy();
  });

  it('abre direto na aba do hash; hash antigo (#recados) cai no Painel', () => {
    window.history.replaceState(null, '', '/#modelos');
    render(<TrainerShell onSwitchToStudent={() => {}} />);
    expect(screen.getByTestId('p-modelos')).toBeTruthy();
    cleanup();
    window.history.replaceState(null, '', '/#recados');
    render(<TrainerShell onSwitchToStudent={() => {}} />);
    expect(screen.getByTestId('p-painel')).toBeTruthy();
  });

  it('a bolinha do Painel mostra os casos urgentes', () => {
    render(<TrainerShell onSwitchToStudent={() => {}} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'carregou' })); });
    expect(screen.getByRole('button', { name: /Painel/ }).textContent).toContain('4');
  });

  it('aluno tocado no Painel abre a ficha em Alunos', () => {
    render(<TrainerShell onSwitchToStudent={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'abrir Bia' }));
    expect(screen.getByTestId('p-alunos').textContent).toBe('aberto Bia');
    expect(window.location.hash).toBe('#alunos');
  });

  it('atalho do Painel abre a Turma já em Desafios', () => {
    render(<TrainerShell onSwitchToStudent={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'ir desafios' }));
    expect(screen.getByTestId('p-turma').textContent).toBe('desafios');
  });

  it('Usar como aluno chama o callback da Conta', () => {
    const onSwitchToStudent = vi.fn();
    window.history.replaceState(null, '', '/#conta');
    render(<TrainerShell onSwitchToStudent={onSwitchToStudent} />);
    fireEvent.click(screen.getByRole('button', { name: 'virar aluno' }));
    expect(onSwitchToStudent).toHaveBeenCalledTimes(1);
  });
});
