// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ProfileAccountSection from './ProfileAccountSection';

afterEach(cleanup);

const props = {
  newEmail: '', setNewEmail: vi.fn(),
  newPassword: '', setNewPassword: vi.fn(),
  onUpdateEmail: vi.fn(), onUpdatePassword: vi.fn(),
  onLogout: vi.fn(), onDeleteAccount: vi.fn(),
};

const emailUser = { email: 'a@b.com', app_metadata: { provider: 'email', providers: ['email'] } };
const googleUser = { email: 'a@gmail.com', app_metadata: { provider: 'google', providers: ['google'] } };

function open() {
  // O cartão "E-mail e senha" começa recolhido.
  fireEvent.click(screen.getByRole('button', { name: /E-mail e senha/ }));
}

describe('ProfileAccountSection', () => {
  it('conta de e-mail e senha: troca e-mail e senha como sempre', () => {
    render(<ProfileAccountSection user={emailUser} {...props} />);
    open();
    expect(screen.getByLabelText('Novo e-mail')).toBeTruthy();
    expect(screen.getByLabelText('Nova senha')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Atualizar senha' })).toBeTruthy();
  });

  it('conta só do Google: sem troca de e-mail e com a senha como opcional', () => {
    render(<ProfileAccountSection user={googleUser} {...props} />);
    open();
    expect(screen.queryByLabelText('Novo e-mail')).toBeNull();
    expect(screen.getByText(/o e-mail da conta é o do Google/)).toBeTruthy();
    expect(screen.getByLabelText('Criar senha (opcional)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Criar senha' })).toBeTruthy();
  });

  it('conta do Google que já criou senha volta ao formulário normal', () => {
    const both = { email: 'a@gmail.com', app_metadata: { provider: 'google', providers: ['google', 'email'] } };
    render(<ProfileAccountSection user={both} {...props} />);
    open();
    expect(screen.getByLabelText('Novo e-mail')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Atualizar senha' })).toBeTruthy();
  });
});
