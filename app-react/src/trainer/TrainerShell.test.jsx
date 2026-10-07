// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 't1' } }) }));
vi.mock('../components/ThemeToggle', () => ({ default: () => <button type="button">tema</button> }));
vi.mock('../components/Tutorial', () => ({ default: ({ role }) => <div data-testid="tutorial">{role}</div> }));
vi.mock('./AlunosPage', () => ({ default: ({ onClientsLoaded }) => (
  <div data-testid="p-alunos"><button type="button" onClick={() => onClientsLoaded(4)}>carregou</button></div>
) }));
vi.mock('./TemplatesPage', () => ({ default: () => <div data-testid="p-modelos" /> }));
vi.mock('./ClassPage', () => ({ default: () => <div data-testid="p-turma" /> }));
vi.mock('./MessagesPage', () => ({ default: () => <div data-testid="p-recados" /> }));
vi.mock('./TrainerAccount', () => ({ default: ({ onSwitchToStudent }) => (
  <div data-testid="p-conta"><button type="button" onClick={onSwitchToStudent}>virar aluno</button></div>
) }));

import TrainerShell from './TrainerShell';

beforeEach(() => window.history.replaceState(null, '', '/'));
afterEach(cleanup);

describe('TrainerShell', () => {
  it('abre em Alunos e mostra o tutorial do personal', () => {
    render(<TrainerShell onSwitchToStudent={() => {}} />);
    expect(screen.getByTestId('p-alunos')).toBeTruthy();
    expect(screen.getByTestId('tutorial').textContent).toBe('trainer');
  });

  it('a navegação troca de página', () => {
    render(<TrainerShell onSwitchToStudent={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Modelos/ }));
    expect(screen.getByTestId('p-modelos')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Turma/ }));
    expect(screen.getByTestId('p-turma')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Recados/ }));
    expect(screen.getByTestId('p-recados')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Conta/ }));
    expect(screen.getByTestId('p-conta')).toBeTruthy();
  });

  it('abre direto na aba do hash', () => {
    window.history.replaceState(null, '', '/#recados');
    render(<TrainerShell onSwitchToStudent={() => {}} />);
    expect(screen.getByTestId('p-recados')).toBeTruthy();
  });

  it('a bolinha de Alunos mostra quantos precisam de atenção', () => {
    render(<TrainerShell onSwitchToStudent={() => {}} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'carregou' })); });
    expect(screen.getByRole('button', { name: /Alunos/ }).textContent).toContain('4');
  });

  it('Usar como aluno chama o callback da Conta', () => {
    const onSwitchToStudent = vi.fn();
    window.history.replaceState(null, '', '/#conta');
    render(<TrainerShell onSwitchToStudent={onSwitchToStudent} />);
    fireEvent.click(screen.getByRole('button', { name: 'virar aluno' }));
    expect(onSwitchToStudent).toHaveBeenCalledTimes(1);
  });
});
