// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  render: vi.fn(),
  share: vi.fn(),
  load: vi.fn(),
}));

vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../hooks/useBackToClose', () => ({ useBackToClose: () => {} }));
vi.mock('../lib/modalRoot', () => ({ getModalRoot: () => document.body }));
vi.mock('../lib/shareCard', () => ({
  PHOTO_STATS: ['duracao', 'carga', 'series', 'exercicios'],
  renderWorkoutPhotoCard: (...a) => h.render(...a),
  shareWorkoutPhoto: (...a) => h.share(...a),
}));
vi.mock('../lib/imageUtils', () => ({
  fileToDataUrl: async () => 'data:image/jpeg;base64,xx',
  loadImage: (...a) => h.load(...a),
}));

import WorkoutPhotoShare from './WorkoutPhotoShare';

const SUMMARY = { day: { dia: 'Segunda', foco: 'Peito' }, durationMs: 1000, totalCarga: 10, exercises: [] };
const IMG = { width: 100, height: 200 };

beforeEach(() => {
  h.toast.mockReset();
  h.render.mockReset().mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
  h.share.mockReset().mockResolvedValue('shared');
  h.load.mockReset().mockResolvedValue(IMG);
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const pick = () => new File(['x'], 'eu.jpg', { type: 'image/jpeg' });
const upload = file => fireEvent.change(screen.getByLabelText('Tirar foto'), { target: { files: [file] } });

describe('WorkoutPhotoShare', () => {
  it('sem foto não deixa compartilhar', () => {
    render(<WorkoutPhotoShare summary={SUMMARY} onClose={() => {}} />);
    expect(screen.getByText('📤 Compartilhar').disabled).toBe(true);
    expect(h.render).not.toHaveBeenCalled();
  });

  it('a câmera frontal é pedida pelo input (capture=user) e a galeria não', () => {
    render(<WorkoutPhotoShare summary={SUMMARY} onClose={() => {}} />);
    expect(screen.getByLabelText('Tirar foto').getAttribute('capture')).toBe('user');
    expect(screen.getByLabelText('Escolher da galeria').getAttribute('capture')).toBeNull();
  });

  it('com a foto desenha o cartão com todos os dados e libera o compartilhamento', async () => {
    render(<WorkoutPhotoShare summary={SUMMARY} onClose={() => {}} />);
    upload(pick());
    await waitFor(() => expect(screen.getByAltText('Prévia da foto com os dados do treino')).toBeTruthy());
    expect(h.render).toHaveBeenCalledWith(SUMMARY, IMG, { duracao: true, carga: true, series: true, exercicios: true });
    fireEvent.click(screen.getByText('📤 Compartilhar'));
    await waitFor(() => expect(h.share).toHaveBeenCalledTimes(1));
  });

  it('desligar um dado redesenha o cartão sem ele', async () => {
    render(<WorkoutPhotoShare summary={SUMMARY} onClose={() => {}} />);
    upload(pick());
    await waitFor(() => expect(h.render).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Carga total' }));
    await waitFor(() => expect(h.render).toHaveBeenCalledTimes(2));
    expect(h.render.mock.calls[1][2]).toEqual({ duracao: true, carga: false, series: true, exercicios: true });
  });

  it('arquivo que não é imagem avisa e não desenha', async () => {
    render(<WorkoutPhotoShare summary={SUMMARY} onClose={() => {}} />);
    upload(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Selecione um arquivo de imagem.'));
    expect(h.render).not.toHaveBeenCalled();
  });

  it('baixou em vez de compartilhar: avisa; cancelar o share não mostra erro', async () => {
    h.share.mockResolvedValueOnce('downloaded');
    render(<WorkoutPhotoShare summary={SUMMARY} onClose={() => {}} />);
    upload(pick());
    await waitFor(() => expect(screen.getByText('📤 Compartilhar').disabled).toBe(false));
    fireEvent.click(screen.getByText('📤 Compartilhar'));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('🖼️ Imagem baixada'));

    h.toast.mockReset();
    h.share.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'AbortError' }));
    fireEvent.click(screen.getByText('📤 Compartilhar'));
    await waitFor(() => expect(h.share).toHaveBeenCalledTimes(2));
    expect(h.toast).not.toHaveBeenCalled();
  });
});
