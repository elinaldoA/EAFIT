// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ user: null, updateProfile: vi.fn(), toast: vi.fn() }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: h.user, updateProfile: h.updateProfile }) }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));

import NamePrompt from './NamePrompt';

const TITLE = '👋 Como podemos te chamar?';
const field = () => screen.getByLabelText('Seu primeiro nome');

beforeEach(() => {
  localStorage.clear();
  h.user = { id: 'u1', email: 'ana@x.com', user_metadata: {} };
  h.updateProfile.mockReset().mockResolvedValue({ error: null });
  h.toast.mockReset();
});
afterEach(cleanup);

describe('NamePrompt', () => {
  it('não aparece para quem já tem nome', () => {
    h.user.user_metadata = { nome: 'Ana' };
    render(<NamePrompt />);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('salva o nome na conta e no aparelho, agradece e some', async () => {
    render(<NamePrompt />);
    fireEvent.change(field(), { target: { value: '  Ana  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Prazer, Ana! 👋'));
    expect(h.updateProfile).toHaveBeenCalledWith({ nome: 'Ana' });
    expect(localStorage.getItem('profile_nome')).toBe('Ana');
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('vazio mostra o erro junto do campo e não salva', () => {
    render(<NamePrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Diga como podemos te chamar.')).toBeTruthy();
    expect(h.updateProfile).not.toHaveBeenCalled();
  });

  it('erro ao salvar avisa e mantém o convite', async () => {
    h.updateProfile.mockResolvedValue({ error: new Error('x') });
    render(<NamePrompt />);
    fireEvent.change(field(), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('⚠️ Não foi possível salvar — tente novamente'));
    expect(screen.getByText(TITLE)).toBeTruthy();
  });

  it('"Agora não" some e não volta', () => {
    const first = render(<NamePrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(screen.queryByText(TITLE)).toBeNull();
    first.unmount();
    render(<NamePrompt />);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('conta do Google sem nome salvo já vem com o primeiro nome', () => {
    h.user.user_metadata = { full_name: 'Carla Dias' };
    render(<NamePrompt />);
    expect(field().value).toBe('Carla');
  });
});
