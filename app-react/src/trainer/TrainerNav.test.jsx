// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TrainerNav from './TrainerNav';

afterEach(cleanup);

const ITEMS = [
  { key: 'alunos', label: 'Alunos', badge: 3 },
  { key: 'modelos', label: 'Modelos' },
  { key: 'conta', label: 'Conta', badge: 0 },
];

describe('TrainerNav', () => {
  it('mostra um botão por item e marca o ativo', () => {
    render(<TrainerNav items={ITEMS} active="modelos" onChange={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /Modelos/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: /Alunos/ }).getAttribute('aria-current')).toBeNull();
  });

  it('clicar troca de aba', () => {
    const onChange = vi.fn();
    render(<TrainerNav items={ITEMS} active="alunos" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Conta/ }));
    expect(onChange).toHaveBeenCalledWith('conta');
  });

  it('mostra a bolinha só quando o número é maior que zero', () => {
    render(<TrainerNav items={ITEMS} active="alunos" onChange={() => {}} />);
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });
});
