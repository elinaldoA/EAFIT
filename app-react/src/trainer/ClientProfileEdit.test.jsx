// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), update: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/trainer', async (importActual) => ({
  ...(await importActual()),
  updateClientProfile: (...a) => h.update(...a),
}));

import ClientProfileEdit from './ClientProfileEdit';

const profile = { name: 'Ana', email: 'ana@x.com', peso: '70.5', altura: '165', idade: '30', meta: 'massa', nivel: 'iniciante', weeklyGoal: '3' };

beforeEach(() => { h.toast.mockReset(); h.update = vi.fn().mockResolvedValue(undefined); });
afterEach(cleanup);

describe('ClientProfileEdit', () => {
  it('preenche com o cadastro atual e salva as alterações, e-mail incluído', async () => {
    const onSaved = vi.fn();
    render(<ClientProfileEdit clientId="c1" profile={profile} onSaved={onSaved} />);
    expect(screen.getByLabelText('Peso (kg)').value).toBe('70,5');
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: ' novo@x.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar dados' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(h.update).toHaveBeenCalledWith('c1', expect.objectContaining({ nome: 'Ana', email: 'novo@x.com', peso: '70,5', meta: 'massa' }));
  });

  it('não salva sem nome', () => {
    render(<ClientProfileEdit clientId="c1" profile={profile} />);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar dados' }));
    expect(screen.getByRole('alert').textContent).toBe('Informe o nome do aluno.');
    expect(h.update).not.toHaveBeenCalled();
  });

  it('mostra erro amigável quando o e-mail já existe', async () => {
    h.update.mockRejectedValue(new Error('email_in_use'));
    render(<ClientProfileEdit clientId="c1" profile={profile} />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar dados' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Este e-mail já está em uso por outra conta.');
  });
});
