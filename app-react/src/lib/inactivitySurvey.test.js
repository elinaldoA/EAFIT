// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock('./supabase', () => ({ db: { functions: { invoke: mockInvoke } } }));

import { REASONS, sendInactivityReason, takeSurveyLink } from './inactivitySurvey';

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('takeSurveyLink', () => {
  it('lê motivo e código e limpa a barra de endereço, preservando o resto', () => {
    window.history.replaceState(null, '', '/app/?origem=email&motivo=sem_tempo&r=id.abc#treino');
    expect(takeSurveyLink()).toEqual({ token: 'id.abc', reason: 'sem_tempo' });
    expect(window.location.search).toBe('?origem=email');
    expect(window.location.hash).toBe('#treino');
  });

  it('motivo fora da lista vira null (a tela pede a escolha)', () => {
    window.history.replaceState(null, '', '/app/?motivo=preguica&r=id.abc');
    expect(takeSurveyLink()).toEqual({ token: 'id.abc', reason: null });
  });

  it('sem código ou sem motivo devolve null e não mexe em nada', () => {
    window.history.replaceState(null, '', '/app/?motivo=sem_tempo');
    expect(takeSurveyLink()).toBeNull();
    expect(window.location.search).toBe('?motivo=sem_tempo');
    window.history.replaceState(null, '', '/app/?r=id.abc');
    expect(takeSurveyLink()).toBeNull();
  });
});

describe('sendInactivityReason', () => {
  it('chama a função com código, motivo e comentário', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await sendInactivityReason('id.abc', 'saude', 'joelho')).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('inactivity-reason', { body: { token: 'id.abc', reason: 'saude', comment: 'joelho' } });
  });

  it('devolve false quando a função recusa ou a rede falha', async () => {
    mockInvoke.mockResolvedValue({ data: { error: 'Link inválido.' }, error: null });
    expect(await sendInactivityReason('x', 'outro')).toBe(false);
    mockInvoke.mockResolvedValue({ data: null, error: new Error('400') });
    expect(await sendInactivityReason('x', 'outro')).toBe(false);
    mockInvoke.mockRejectedValue(new Error('offline'));
    expect(await sendInactivityReason('x', 'outro')).toBe(false);
  });
});

describe('REASONS', () => {
  it('tem os mesmos motivos do servidor', () => {
    expect(REASONS.map(r => r.value)).toEqual(['sem_tempo', 'treino', 'app_dificil', 'outro_app', 'saude', 'pausa', 'outro']);
  });
});
