import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc } }));

import { fetchInactivityAnswers, fetchInactivitySummary, summarizeSurveys } from './inactivity';

beforeEach(() => vi.clearAllMocks());

const rows = [
  { is_segment: 'absent', is_reason: '', is_total: '6' },
  { is_segment: 'absent', is_reason: 'sem_tempo', is_total: '3' },
  { is_segment: 'absent', is_reason: 'saude', is_total: '1' },
  { is_segment: 'idle', is_reason: '', is_total: '2' },
  { is_segment: 'idle', is_reason: 'sem_tempo', is_total: '1' },
  { is_segment: 'idle', is_reason: 'treino', is_total: '3' },
];

describe('summarizeSurveys', () => {
  it('soma envios e respostas por segmento e ordena os motivos', () => {
    const s = summarizeSurveys(rows);
    expect(s.sent).toBe(16);
    expect(s.answered).toBe(8);
    expect(s.rate).toBe(50);
    expect(s.segments).toEqual({ absent: { sent: 10, answered: 4 }, idle: { sent: 6, answered: 4 } });
    expect(s.reasons.map(r => [r.reason, r.total, r.share, r.absent, r.idle])).toEqual([
      ['sem_tempo', 4, 50, 3, 1],
      ['treino', 3, 38, 0, 3],
      ['saude', 1, 13, 1, 0],
    ]);
    expect(s.reasons[0].label).toBe('Sem tempo');
  });

  it('sem envios não divide por zero', () => {
    expect(summarizeSurveys(undefined)).toEqual({
      sent: 0, answered: 0, rate: null, segments: { absent: { sent: 0, answered: 0 }, idle: { sent: 0, answered: 0 } }, reasons: [],
    });
  });
});

describe('consultas', () => {
  it('fetchInactivitySummary resume o retorno da RPC', async () => {
    mockRpc.mockResolvedValue({ data: rows, error: null });
    expect((await fetchInactivitySummary()).sent).toBe(16);
    expect(mockRpc).toHaveBeenCalledWith('admin_inactivity_summary', undefined);
  });

  it('fetchInactivityAnswers mapeia as colunas ia_*', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ia_id: 7, ia_user: 'u1', ia_email: 'a@x.com', ia_name: 'Ana', ia_segment: 'idle', ia_reason: 'treino', ia_comment: 'longo', ia_days: 40, ia_never_trained: false, ia_answered: 't' }],
      error: null,
    });
    expect(await fetchInactivityAnswers()).toEqual([{
      id: 7, userId: 'u1', email: 'a@x.com', name: 'Ana', segment: 'idle', reason: 'treino', comment: 'longo', days: 40, neverTrained: false, answeredAt: 't',
    }]);
    expect(mockRpc).toHaveBeenCalledWith('admin_inactivity_answers', { max_rows: 100 });
  });

  it('erro da RPC sobe pra tela', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    await expect(fetchInactivitySummary()).rejects.toThrow('not_authorized');
  });
});
