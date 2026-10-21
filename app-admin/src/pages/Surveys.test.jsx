// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockRpc, mockFrom, insert, update } = vi.hoisted(() => ({
  mockRpc: vi.fn(), mockFrom: vi.fn(), insert: vi.fn(), update: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc, from: mockFrom } }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));

import Surveys from './Surveys';
import { buildResults, buildSurveyRow, npsOf, surveyStatus } from '../lib/surveys';

const SURVEY = {
  sv_id: 's1', sv_kind: 'nps', sv_question: 'Indicaria?', sv_question_en: null, sv_options: [], sv_audience: 'todos',
  sv_min_account_days: 7, sv_starts_on: null, sv_ends_on: null, sv_active: true, sv_created_at: '2026-10-01T12:00:00Z',
  sv_answers: 3, sv_last_answer: '2026-10-10T12:00:00Z',
};
const ans = (id, score, over = {}) => ({
  sa_id: id, sa_user: `u${id}`, sa_name: `Pessoa ${id}`, sa_email: `p${id}@x.com`, sa_score: score, sa_choice: null,
  sa_comment: null, sa_at: '2026-10-08T12:00:00Z', sa_meta: 'hipertrofia', sa_nivel: 'iniciante', sa_local: 'academia',
  sa_personal: false, sa_account_days: 40, sa_active30: true, ...over,
});
const ANSWERS = [ans(1, 10, { sa_comment: 'Amei' }), ans(2, 9, { sa_local: 'casa' }), ans(3, 4, { sa_local: 'casa', sa_comment: 'Lento' })];

beforeEach(() => {
  vi.clearAllMocks();
  insert.mockResolvedValue({ error: null });
  update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  mockFrom.mockReturnValue({ insert, update });
  mockRpc.mockImplementation(async name => ({ data: name === 'admin_surveys' ? [SURVEY] : ANSWERS, error: null }));
});
afterEach(cleanup);

describe('lib/surveys', () => {
  it('NPS, distribuição, recorte e comentários', () => {
    expect(npsOf([{ score: 10 }, { score: 9 }, { score: 4 }])).toMatchObject({ nps: 34, promoters: 2, detractors: 1, passives: 0 });
    const survey = { kind: 'nps', options: [] };
    const answers = ANSWERS.map(a => ({ score: a.sa_score, comment: a.sa_comment, local: a.sa_local, at: a.sa_at, accountDays: 40 }));
    const r = buildResults(survey, answers, 'local');
    expect(r.breakdown).toEqual([{ label: 'Em casa', total: 2, nps: 0, top: null }, { label: 'Academia', total: 1, nps: 100, top: null }]);
    expect(buildResults(survey, [{ score: 10, local: 'condominio', at: '2026-10-06T12:00:00Z', accountDays: 40 }], 'local').breakdown[0].label).toBe('Condomínio');
    expect(r.distribution[10]).toMatchObject({ total: 1, pct: 33 });
    expect(r.comments).toHaveLength(2);
    expect(r.weekly).toEqual([{ week: '2026-10-05', total: 3, nps: 34 }]);
  });

  it('valida o formulário', () => {
    expect(buildSurveyRow({ kind: 'escolha', question: 'O que falta?', options: ['A', ' ', 'A'], audience: 'todos', minAccountDays: 0 }).error).toBe('Coloque ao menos 2 opções.');
    expect(buildSurveyRow({ kind: 'nps', question: 'Oi?', audience: 'todos', minAccountDays: 0, startsOn: '2026-10-10', endsOn: '2026-10-01' }).error).toBe('O fim vem antes do início.');
    expect(buildSurveyRow({ kind: 'texto', question: ' O que mudar? ', questionEn: '', audience: 'casa', minAccountDays: '3' }).row)
      .toEqual({ kind: 'texto', question: 'O que mudar?', question_en: null, options: [], audience: 'casa', min_account_days: 3, starts_on: null, ends_on: null, active: true });
  });

  it('situação pela data e pelo ativo', () => {
    expect(surveyStatus({ active: false }, '2026-10-20')).toBe('pausada');
    expect(surveyStatus({ active: true, startsOn: '2026-11-01' }, '2026-10-20')).toBe('agendada');
    expect(surveyStatus({ active: true, endsOn: '2026-10-01' }, '2026-10-20')).toBe('encerrada');
    expect(surveyStatus({ active: true }, '2026-10-20')).toBe('no_ar');
  });
});

describe('Surveys', () => {
  it('lista, abre os resultados e cria uma pesquisa de escolha', async () => {
    render(<MemoryRouter><Surveys /></MemoryRouter>);
    expect(await screen.findByText('Indicaria?')).toBeTruthy();
    expect(screen.getByText('No ar')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Resultados' }));
    expect(await screen.findByText('NPS (−100 a 100)')).toBeTruthy();
    expect(screen.getByText('Amei')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pessoa 3' }).getAttribute('href')).toBe('/users/u3');

    fireEvent.click(screen.getByRole('button', { name: 'Nova pesquisa' }));
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'escolha' } });
    fireEvent.change(screen.getByLabelText('Pergunta'), { target: { value: 'O que falta no app?' } });
    fireEvent.change(screen.getByLabelText('Opção 1'), { target: { value: 'Mais treinos' } });
    fireEvent.change(screen.getByLabelText('Opção 2'), { target: { value: 'Dieta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'escolha', question: 'O que falta no app?', options: ['Mais treinos', 'Dieta'], created_by: 'adm1',
    })));
  });

  it('pausar atualiza a pesquisa; erro aparece', async () => {
    render(<MemoryRouter><Surveys /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Pausar' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ active: false }));
    cleanup();

    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    render(<MemoryRouter><Surveys /></MemoryRouter>);
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });
});
