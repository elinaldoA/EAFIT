// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ meta: {}, updateProfile: vi.fn() }));
vi.mock('../context/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', user_metadata: h.meta }, updateProfile: h.updateProfile }),
}));

import HealthScreen from './HealthScreen';

beforeEach(() => { h.meta = { peso: '80' }; h.updateProfile.mockReset().mockResolvedValue({ error: null }); });
afterEach(cleanup);

const answerAll = value => {
  const label = value ? 'Sim' : 'Não';
  screen.getAllByRole('button', { name: label }).forEach(b => fireEvent.click(b));
};

describe('HealthScreen', () => {
  it('não aparece antes do onboarding nem para quem já respondeu', () => {
    h.meta = {};
    const { container, rerender } = render(<HealthScreen />);
    expect(container.textContent).toBe('');
    h.meta = { peso: '80', parqAt: new Date().toISOString(), parqVersion: 1 };
    rerender(<HealthScreen />);
    expect(container.textContent).toBe('');
  });

  it('aparece uma vez para conta antiga e dá para pular sem responder', async () => {
    render(<HealthScreen />);
    expect(screen.getByText('Sua saúde em primeiro lugar')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pular por agora' }));
    await waitFor(() => expect(h.updateProfile).toHaveBeenCalled());
    expect(Object.keys(h.updateProfile.mock.calls[0][0])).toEqual(['parqSkippedAt']);
  });

  it('só salva com as 7 respondidas e o consentimento', () => {
    render(<HealthScreen />);
    const save = screen.getByRole('button', { name: 'Salvar respostas' });
    expect(save.disabled).toBe(true);
    answerAll(false);
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(save.disabled).toBe(false);
  });

  it('grava as respostas e avisa quando há alerta', async () => {
    render(<HealthScreen />);
    answerAll(false);
    fireEvent.click(screen.getAllByRole('button', { name: 'Sim' })[1]);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar respostas' }));
    await waitFor(() => expect(h.updateProfile).toHaveBeenCalled());
    expect(h.updateProfile.mock.calls[0][0]).toMatchObject({ parqAnswers: '0100000', parqAlert: true, parqVersion: 1 });
    expect(await screen.findByRole('status')).toBeTruthy();
  });
});
