// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc } }));

import SurveyPrompt from './SurveyPrompt';
import { fetchPendingSurvey, isSnoozed, snoozeSurvey, SNOOZE_DAYS } from '../lib/surveys';

const NPS = { id: 's1', kind: 'nps', question: 'De 0 a 10, quanto indicaria o EAFIT?', question_en: null, options: [] };
const CHOICE = { id: 's2', kind: 'escolha', question: 'O que mais falta?', options: ['Mais treinos', 'Dieta'] };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockRpc.mockResolvedValue({ data: null, error: null });
});
afterEach(cleanup);

describe('surveys', () => {
  it('"Agora não" segura a pesquisa por alguns dias neste aparelho', async () => {
    const now = Date.now();
    mockRpc.mockResolvedValue({ data: [NPS], error: null });
    expect(await fetchPendingSurvey(now)).toEqual(NPS);
    snoozeSurvey('s1', now);
    expect(isSnoozed('s1', now + 1000)).toBe(true);
    expect(await fetchPendingSurvey(now + 1000)).toBeNull();
    expect(isSnoozed('s1', now + SNOOZE_DAYS * 86400000 + 1)).toBe(false);
  });

  it('falha de rede vira "sem pesquisa"', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('offline') });
    expect(await fetchPendingSurvey()).toBeNull();
    mockRpc.mockRejectedValue(new Error('offline'));
    expect(await fetchPendingSurvey()).toBeNull();
  });
});

describe('SurveyPrompt', () => {
  it('NPS: escolhe a nota, comenta e envia', async () => {
    render(<SurveyPrompt survey={NPS} onClose={vi.fn()} />);
    expect(screen.getByText(NPS.question)).toBeTruthy();
    const send = screen.getByRole('button', { name: 'Enviar resposta' });
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '9' }));
    fireEvent.change(screen.getByLabelText('Comentário (opcional)'), { target: { value: ' muito bom ' } });
    fireEvent.click(send);
    await waitFor(() => expect(screen.getByText('Obrigado pela resposta!')).toBeTruthy());
    expect(mockRpc).toHaveBeenCalledWith('answer_survey', { p_survey: 's1', p_score: 9, p_choice: null, p_comment: 'muito bom' });
  });

  it('escolha: manda a opção; fechar sem responder adia', async () => {
    const onClose = vi.fn();
    render(<SurveyPrompt survey={CHOICE} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dieta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('answer_survey', { p_survey: 's2', p_score: null, p_choice: 'Dieta', p_comment: null }));
    cleanup();

    render(<SurveyPrompt survey={CHOICE} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(onClose).toHaveBeenCalled();
    expect(isSnoozed('s2')).toBe(true);
  });

  it('erro no envio aparece e permite tentar de novo', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('survey_closed') });
    render(<SurveyPrompt survey={NPS} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
