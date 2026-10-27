// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  user: { id: 'u1' },
  weight: { fetchWeightLogs: vi.fn() },
  measures: { fetchMeasurements: vi.fn() },
  photos: { fetchPhotos: vi.fn(), addPhoto: vi.fn(), deletePhoto: vi.fn() },
}));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../context/useToast', () => ({ useToast: () => vi.fn() }));
vi.mock('../lib/progressPhotos', () => h.photos);
vi.mock('../lib/weightLog', () => h.weight);
vi.mock('../lib/bodyMeasurements', async orig => ({ ...(await orig()), ...h.measures }));
vi.mock('./Loading', () => ({ default: () => <div data-testid="loading" /> }));

import PhotoCompare from './PhotoCompare';
import ProgressPhotos from './ProgressPhotos';

const photos = [
  { id: 'a', image_data: 'data:a', photo_date: '2026-01-15' },
  { id: 'b', image_data: 'data:b', photo_date: '2026-03-01' },
  { id: 'c', image_data: 'data:c', photo_date: '2026-04-15' },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.weight.fetchWeightLogs.mockResolvedValue([
    { log_date: '2026-01-10', peso: 90 }, { log_date: '2026-04-10', peso: 84.5 },
  ]);
  h.measures.fetchMeasurements.mockResolvedValue([
    { measured_on: '2026-01-12', cintura: 100, quadril: null, peito: null, braco: null, coxa: null },
    { measured_on: '2026-04-12', cintura: 92, quadril: null, peito: null, braco: null, coxa: null },
  ]);
  h.photos.fetchPhotos.mockResolvedValue(photos);
});
afterEach(() => {
  cleanup();
  document.body.classList.remove('modal-open');
});

describe('PhotoCompare', () => {
  it('começa com a primeira e a última foto e mostra tempo, peso e medidas', async () => {
    render(<PhotoCompare photos={photos} userId="u1" onClose={() => {}} />);
    expect(screen.getByText('90 dias entre as fotos')).toBeTruthy();
    expect(await screen.findByText(/90 → 84,5 kg/)).toBeTruthy();
    expect(screen.getByText('(-5,5)')).toBeTruthy();
    expect(screen.getByText(/100 → 92 cm/)).toBeTruthy();
    expect(screen.getByText('(-8)')).toBeTruthy();
    expect(h.weight.fetchWeightLogs).toHaveBeenCalledWith('u1');
  });

  it('trocar a foto recalcula a comparação', async () => {
    render(<PhotoCompare photos={photos} userId="u1" onClose={() => {}} />);
    await screen.findByText(/90 → 84,5 kg/);
    fireEvent.change(screen.getByLabelText('Antes'), { target: { value: '1' } });
    expect(screen.getByText('45 dias entre as fotos')).toBeTruthy();
  });

  it('avisa quando Antes é mais recente que Depois', async () => {
    render(<PhotoCompare photos={photos} userId="u1" onClose={() => {}} />);
    await screen.findByText(/90 → 84,5 kg/);
    fireEvent.change(screen.getByLabelText('Antes'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Depois'), { target: { value: '0' } });
    expect(screen.getByText('A foto "Antes" é mais recente que a "Depois"')).toBeTruthy();
    expect(screen.queryByText(/kg/)).toBeNull();
  });

  it('se peso e medidas falharem, as fotos continuam comparáveis', async () => {
    h.weight.fetchWeightLogs.mockRejectedValue(new Error('x'));
    h.measures.fetchMeasurements.mockRejectedValue(new Error('x'));
    render(<PhotoCompare photos={photos} userId="u1" onClose={() => {}} />);
    expect(screen.getByText('90 dias entre as fotos')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Registre peso e medidas em datas diferentes/)).toBeTruthy());
  });

  it('fecha pelo botão', () => {
    const onClose = vi.fn();
    render(<PhotoCompare photos={photos} userId="u1" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ProgressPhotos — comparar', () => {
  it('o botão só aparece com 2 ou mais fotos e abre a comparação', async () => {
    render(<ProgressPhotos />);
    fireEvent.click(await screen.findByText('↔ Comparar antes e depois'));
    expect(screen.getByRole('dialog', { name: 'Antes e depois' })).toBeTruthy();
  });

  it('com uma foto só não oferece comparar', async () => {
    h.photos.fetchPhotos.mockResolvedValue([photos[0]]);
    render(<ProgressPhotos />);
    await screen.findAllByRole('img');
    expect(screen.queryByText('↔ Comparar antes e depois')).toBeNull();
  });
});
