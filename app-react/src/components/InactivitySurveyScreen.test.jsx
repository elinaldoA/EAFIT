// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock('../lib/inactivitySurvey', async orig => ({ ...(await orig()), sendInactivityReason: mockSend }));
vi.mock('../lib/supabase', () => ({ db: {} }));

import InactivitySurveyScreen from './InactivitySurveyScreen';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('InactivitySurveyScreen', () => {
  it('grava na hora o motivo do link e depois envia o comentário', async () => {
    mockSend.mockResolvedValue(true);
    const onClose = vi.fn();
    render(<InactivitySurveyScreen token="id.abc" reason="sem_tempo" onClose={onClose} />);
    expect(mockSend).toHaveBeenCalledWith('id.abc', 'sem_tempo');
    expect(await screen.findByText(/Resposta registrada/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Estou sem tempo' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.change(screen.getByLabelText('Quer contar mais? (opcional)'), { target: { value: 'trabalho em dois turnos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Obrigado por contar pra gente')).toBeTruthy();
    expect(mockSend).toHaveBeenLastCalledWith('id.abc', 'sem_tempo', 'trabalho em dois turnos');

    fireEvent.click(screen.getByRole('button', { name: 'Continuar para o app' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('trocar o motivo grava o novo', async () => {
    mockSend.mockResolvedValue(true);
    render(<InactivitySurveyScreen token="id.abc" reason="sem_tempo" onClose={() => {}} />);
    await screen.findByText(/Resposta registrada/);
    fireEvent.click(screen.getByRole('button', { name: 'Lesão ou questão de saúde' }));
    expect(mockSend).toHaveBeenLastCalledWith('id.abc', 'saude', '');
    await screen.findByText(/Resposta registrada/);
    expect(screen.getByRole('button', { name: 'Lesão ou questão de saúde' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('sem motivo no link, pede a escolha e não grava nada sozinho', () => {
    render(<InactivitySurveyScreen token="id.abc" reason={null} onClose={() => {}} />);
    expect(mockSend).not.toHaveBeenCalled();
    expect(screen.getByText('Escolha o motivo que mais combina com você.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enviar' }).disabled).toBe(true);
  });

  it('avisa quando não deu pra registrar', async () => {
    mockSend.mockResolvedValue(false);
    render(<InactivitySurveyScreen token="x" reason="outro" onClose={() => {}} />);
    expect(await screen.findByText(/Não foi possível registrar agora/)).toBeTruthy();
  });
});
