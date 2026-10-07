// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  user: { id: 'u1' },
  toast: vi.fn(),
  photos: { fetchPhotos: vi.fn(), addPhoto: vi.fn(), deletePhoto: vi.fn() },
  hist: { fetchPreviousBests: vi.fn() },
  share: { shareWorkoutSummary: vi.fn() },
}));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/progressPhotos', () => h.photos);
vi.mock('../lib/workoutHistory', async orig => ({ ...(await orig()), ...h.hist }));
vi.mock('../lib/shareCard', () => h.share);
vi.mock('../data/treinoData', async orig => ({ ...(await orig()), todayDate: () => '2026-10-07' }));
vi.mock('./BodyAvatar', () => ({ default: ({ activeGroups }) => <div data-testid="avatar">{[...activeGroups].sort().join(',')}</div> }));
vi.mock('./PushPrompt', () => ({ default: () => <div data-testid="push-prompt" /> }));
vi.mock('./Loading', () => ({ default: () => <div data-testid="loading" /> }));

import ProgressPhotos from './ProgressPhotos';
import SessionDetailModal from './SessionDetailModal';
import WorkoutSummaryModal from './WorkoutSummaryModal';

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { id: 'u1' };
  localStorage.clear();
  h.photos.fetchPhotos.mockResolvedValue([]);
  h.photos.addPhoto.mockResolvedValue({ id: 'new', image_data: 'data:n', photo_date: '2026-10-07', note: '' });
  h.photos.deletePhoto.mockResolvedValue();
  h.hist.fetchPreviousBests.mockResolvedValue(new Map());
  h.share.shareWorkoutSummary.mockResolvedValue('shared');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.classList.remove('modal-open');
});

describe('ProgressPhotos', () => {
  const two = [
    { id: 'a', image_data: 'data:a', photo_date: '2026-09-01', note: 'antes' },
    { id: 'b', image_data: 'data:b', photo_date: '2026-10-01', note: '' },
  ];
  const upload = file => fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
  const png = () => new File(['x'], 'a.png', { type: 'image/png' });

  it('mostra carregando e depois as miniaturas', async () => {
    h.photos.fetchPhotos.mockResolvedValue(two);
    render(<ProgressPhotos />);
    expect(screen.getByTestId('loading')).toBeTruthy();
    expect(await screen.findAllByRole('img')).toHaveLength(2);
    expect(h.photos.fetchPhotos).toHaveBeenCalledWith('u1');
  });

  it('erro ao carregar vira toast', async () => {
    h.photos.fetchPhotos.mockRejectedValue(new Error('x'));
    render(<ProgressPhotos />);
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('⚠️ Erro ao carregar fotos'));
  });

  it('não busca sem usuário', () => {
    h.user = null;
    render(<ProgressPhotos />);
    expect(h.photos.fetchPhotos).not.toHaveBeenCalled();
  });

  it('abre o formulário, envia a foto com data e nota e ordena por data', async () => {
    h.photos.fetchPhotos.mockResolvedValue(two);
    render(<ProgressPhotos />);
    await screen.findAllByRole('img');
    fireEvent.click(screen.getByText('Adicionar'));
    fireEvent.change(screen.getByPlaceholderText('Nota (opcional)'), { target: { value: 'hoje' } });
    const file = png();
    upload(file);
    await waitFor(() => expect(h.photos.addPhoto).toHaveBeenCalledWith('u1', { file, date: '2026-10-07', note: 'hoje' }));
    expect(h.toast).toHaveBeenCalledWith('✅ Foto adicionada');
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(screen.queryByPlaceholderText('Nota (opcional)')).toBeNull();
  });

  it('erro ao salvar mostra a mensagem no toast e mantém o formulário', async () => {
    h.photos.addPhoto.mockRejectedValue(new Error('Imagem muito grande'));
    render(<ProgressPhotos />);
    await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull());
    fireEvent.click(screen.getByText('Adicionar'));
    upload(png());
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('⚠️ Imagem muito grande'));
    expect(screen.getByPlaceholderText('Nota (opcional)')).toBeTruthy();
  });

  it('visualizador: navega entre fotos, respeita limites e fecha', async () => {
    h.photos.fetchPhotos.mockResolvedValue(two);
    render(<ProgressPhotos />);
    fireEvent.click((await screen.findAllByRole('img'))[0]);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(document.body.classList.contains('modal-open')).toBe(true);
    expect(screen.getByText('antes')).toBeTruthy();
    expect(screen.getByText('‹ Anterior').disabled).toBe(true);
    fireEvent.click(screen.getByText('Próxima ›'));
    expect(screen.getByText('Próxima ›').disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('exclui após confirmar e fecha o visualizador', async () => {
    h.photos.fetchPhotos.mockResolvedValue(two);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ProgressPhotos />);
    fireEvent.click((await screen.findAllByRole('img'))[0]);
    fireEvent.click(screen.getByText('🗑 Excluir'));
    await waitFor(() => expect(h.photos.deletePhoto).toHaveBeenCalledWith('a', 'u1'));
    expect(h.toast).toHaveBeenCalledWith('🗑️ Foto excluída');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('cancelar a confirmação mantém a foto; erro vira toast', async () => {
    h.photos.fetchPhotos.mockResolvedValue(two);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ProgressPhotos />);
    fireEvent.click((await screen.findAllByRole('img'))[0]);
    fireEvent.click(screen.getByText('🗑 Excluir'));
    expect(h.photos.deletePhoto).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    h.photos.deletePhoto.mockRejectedValue(new Error('x'));
    fireEvent.click(screen.getByText('🗑 Excluir'));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('⚠️ Erro ao excluir foto'));
  });
});

describe('SessionDetailModal', () => {
  const session = (over = {}) => ({
    date: '2026-10-05', dayOfWeek: 'Segunda', completed: true, durationSeconds: 3725, doneSets: 8, volume: 12500, rating: 5, notes: '',
    exercises: [
      { nome: 'Supino', best: { carga: 62.5, reps: 8, date: '2026-10-05' }, sets: [{ n: 1, reps: 8, carga: 62.5, done: true }, { n: 2, reps: null, carga: null, done: false }] },
      { nome: 'Esteira', cardio: true, best: null, sets: [{ n: 1, duracao: 20, distancia: 3, done: true }, { n: 2, duracao: null, distancia: null, done: false }] },
    ],
    ...over,
  });

  it('mostra título, estatísticas e séries', async () => {
    render(<SessionDetailModal session={session()} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: /Treino de Segunda/ })).toBeTruthy();
    expect(screen.getByText('8', { selector: '.stat-card__value' })).toBeTruthy();
    expect(screen.getByText('12,5t')).toBeTruthy();
    expect(screen.getByText('Ótimo')).toBeTruthy();
    expect(screen.getByText('8× 62,5kg')).toBeTruthy();
    expect(screen.getByText('–× –kg')).toBeTruthy();
    expect(screen.getByText('–', { selector: '.summary-table__chip:not(.summary-table__chip--done)' })).toBeTruthy();
    await waitFor(() => expect(h.hist.fetchPreviousBests).toHaveBeenCalledWith('u1', ['Supino'], '2026-10-05'));
  });

  it('sessão incompleta, sem duração/volume/nota mostra travessões', () => {
    render(<SessionDetailModal session={session({ completed: false, durationSeconds: 0, volume: 0, rating: null })} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: /⏳/ })).toBeTruthy();
    expect(screen.getAllByText('–', { selector: '.stat-card__value' })).toHaveLength(3);
  });

  it('exibe as notas quando existem e vazio sem séries', () => {
    render(<SessionDetailModal session={session({ notes: 'Ombro doeu', exercises: [] })} onClose={vi.fn()} />);
    expect(screen.getByText('Ombro doeu')).toBeTruthy();
    expect(screen.getByText('Nenhuma série registrada nesse treino.')).toBeTruthy();
  });

  it('mostra a tendência em relação à vez anterior', async () => {
    h.hist.fetchPreviousBests.mockResolvedValue(new Map([['Supino', { carga: 60, reps: 8, date: '2026-09-28' }]]));
    render(<SessionDetailModal session={session()} onClose={vi.fn()} />);
    expect(await screen.findByText(/▲ \+2,5kg/)).toBeTruthy();
    expect(screen.getByText(/▲▼ comparam/)).toBeTruthy();
  });

  it('exercício sem histórico aparece como "novo"', async () => {
    render(<SessionDetailModal session={session()} onClose={vi.fn()} />);
    expect(await screen.findByText('novo')).toBeTruthy();
  });

  it('erro na busca do histórico não quebra o modal', async () => {
    h.hist.fetchPreviousBests.mockRejectedValue(new Error('x'));
    render(<SessionDetailModal session={session()} onClose={vi.fn()} />);
    expect(await screen.findByText('novo')).toBeTruthy();
  });

  it('fecha pelo botão e pelo ✕, e libera o scroll ao desmontar', () => {
    const onClose = vi.fn();
    const { unmount } = render(<SessionDetailModal session={session()} onClose={onClose} />);
    expect(document.body.classList.contains('modal-open')).toBe(true);
    fireEvent.click(screen.getAllByLabelText('Fechar')[0]);
    fireEvent.click(screen.getAllByText('Fechar').at(-1));
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });
});

describe('WorkoutSummaryModal', () => {
  const summary = () => ({
    day: { dia: 'Segunda', foco: 'Peito / Tríceps', pos: [] },
    durationMs: 3_600_000, totalCarga: 12500, weekDone: 2, weekTotal: 4, totalSetsDone: 9, totalPlannedSets: 12,
    exercises: [
      { nome: 'Supino', sets: [{ n: 1, reps: 10, carga: 60, done: true }, { n: 2, reps: null, carga: null, done: false }] },
      { nome: 'Esteira', cardio: true, sets: [{ n: 1, duracao: 20, distancia: 3, done: true }] },
    ],
  });

  it('mostra estatísticas, meta da semana e detalhes das séries', () => {
    render(<WorkoutSummaryModal summary={summary()} onClose={vi.fn()} onRate={vi.fn()} />);
    expect(screen.getByText('Segunda · Peito / Tríceps')).toBeTruthy();
    expect(screen.getByText('9/12')).toBeTruthy();
    expect(screen.getByText('2/4')).toBeTruthy();
    expect(document.querySelector('.progress-card__fill').style.width).toBe('50%');
    expect(screen.getByText('10× 60kg')).toBeTruthy();
    expect(screen.getByText('–× –kg')).toBeTruthy();
    expect(screen.getByTestId('push-prompt')).toBeTruthy();
    expect(screen.getByTestId('avatar').textContent).not.toBe('');
  });

  it('meta semanal zerada não quebra a barra', () => {
    render(<WorkoutSummaryModal summary={{ ...summary(), weekTotal: 0 }} onClose={vi.fn()} onRate={vi.fn()} />);
    expect(document.querySelector('.progress-card__fill').style.width).toBe('0%');
  });

  it('sem exercícios esconde "Detalhes das séries"', () => {
    render(<WorkoutSummaryModal summary={{ ...summary(), exercises: [] }} onClose={vi.fn()} onRate={vi.fn()} />);
    expect(screen.queryByText('Detalhes das séries')).toBeNull();
  });

  it('avaliar: abre o seletor, grava no localStorage e chama onRate', () => {
    const onRate = vi.fn();
    render(<WorkoutSummaryModal summary={summary()} onClose={vi.fn()} onRate={onRate} />);
    fireEvent.click(screen.getByText('Avaliar treino'));
    fireEvent.click(screen.getByRole('button', { name: 'Bom' }));
    expect(onRate).toHaveBeenCalledWith(4);
    expect(localStorage.getItem('treino_Segunda_rating')).toBe('4');
    expect(screen.getByText('Avaliação: Bom')).toBeTruthy();
    expect(screen.queryByText('Péssimo')).toBeNull();
  });

  it('lê a avaliação já salva', () => {
    localStorage.setItem('treino_Segunda_rating', '5');
    render(<WorkoutSummaryModal summary={summary()} onClose={vi.fn()} onRate={vi.fn()} />);
    expect(screen.getByText('Avaliação: Ótimo')).toBeTruthy();
  });

  it('compartilhar: baixou a imagem avisa; cancelamento é silencioso; erro avisa', async () => {
    h.share.shareWorkoutSummary.mockResolvedValueOnce('downloaded');
    render(<WorkoutSummaryModal summary={summary()} onClose={vi.fn()} onRate={vi.fn()} />);
    fireEvent.click(screen.getByText('📤 Compartilhar treino'));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('🖼️ Imagem baixada'));

    h.toast.mockClear();
    h.share.shareWorkoutSummary.mockRejectedValueOnce(Object.assign(new Error('cancel'), { name: 'AbortError' }));
    fireEvent.click(screen.getByText('📤 Compartilhar treino'));
    await waitFor(() => expect(h.share.shareWorkoutSummary).toHaveBeenCalledTimes(2));
    expect(h.toast).not.toHaveBeenCalled();

    h.share.shareWorkoutSummary.mockRejectedValueOnce(new Error('canvas'));
    fireEvent.click(screen.getByText('📤 Compartilhar treino'));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('⚠️ Erro ao gerar imagem de compartilhamento'));
  });

  it('fecha pelo botão e libera o scroll ao desmontar', () => {
    const onClose = vi.fn();
    const { unmount } = render(<WorkoutSummaryModal summary={summary()} onClose={onClose} onRate={vi.fn()} />);
    expect(document.body.classList.contains('modal-open')).toBe(true);
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });
});
