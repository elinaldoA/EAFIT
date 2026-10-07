// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../data/treinoData', () => ({ todayDate: () => '2026-10-07' }));
vi.mock('./LineChart', () => ({
  default: ({ points, emptyMsg }) => (
    <div data-testid="chart">{points.length ? points.map(p => `${p.label}=${p.value}`).join(';') : emptyMsg}</div>
  ),
}));
vi.mock('../lib/bodyMeasurements', async (importActual) => ({
  ...(await importActual()),
  fetchMeasurements: (...a) => h.api.fetchMeasurements(...a),
  upsertMeasurement: (...a) => h.api.upsertMeasurement(...a),
}));

import BodyMeasurements from './BodyMeasurements';

const row = (date, values = {}) => ({ measured_on: date, cintura: null, quadril: null, peito: null, braco: null, coxa: null, ...values });

beforeEach(() => {
  h.toast.mockReset();
  h.api = {
    fetchMeasurements: vi.fn().mockResolvedValue([]),
    upsertMeasurement: vi.fn().mockResolvedValue(undefined),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function setup() {
  render(<BodyMeasurements userId="u1" />);
  await screen.findByText('📏 Medidas corporais (cm)');
}

const field = label => screen.getByText(label, { selector: 'span' }).closest('label').querySelector('input');

describe('BodyMeasurements', () => {
  it('sem registros mostra o formulário e o vazio do gráfico', async () => {
    await setup();
    expect(screen.getByTestId('chart').textContent).toBe('Nenhuma medida registrada ainda.');
    expect(screen.queryByRole('list')).toBeNull();
    expect(h.api.fetchMeasurements).toHaveBeenCalledWith('u1');
  });

  it('salvar sem preencher nada avisa e não chama o banco', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar medidas de hoje' }));
    expect(h.toast).toHaveBeenCalledWith('Preencha ao menos uma medida');
    expect(h.api.upsertMeasurement).not.toHaveBeenCalled();
  });

  it('salvar aceita vírgula, ignora valores inválidos e limpa o formulário', async () => {
    await setup();
    fireEvent.change(field('Cintura'), { target: { value: '82,5' } });
    fireEvent.change(field('Braço'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar medidas de hoje' }));
    await waitFor(() => expect(h.api.upsertMeasurement).toHaveBeenCalledWith('u1', '2026-10-07', {
      cintura: 82.5, quadril: null, peito: null, braco: null, coxa: null,
    }));
    expect(h.toast).toHaveBeenCalledWith('📏 Medidas salvas');
    expect(field('Cintura').value).toBe('');
    expect(h.api.fetchMeasurements).toHaveBeenCalledTimes(2);
  });

  it('campos deixados em branco mantêm o que já foi salvo hoje', async () => {
    h.api.fetchMeasurements.mockResolvedValue([row('2026-10-07', { cintura: 90, coxa: 58 })]);
    await setup();
    fireEvent.change(field('Peito'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar medidas de hoje' }));
    await waitFor(() => expect(h.api.upsertMeasurement).toHaveBeenCalledWith('u1', '2026-10-07', {
      cintura: 90, quadril: null, peito: 100, braco: null, coxa: 58,
    }));
  });

  it('erro ao salvar avisa e mantém o que foi digitado', async () => {
    h.api.upsertMeasurement.mockRejectedValue(new Error('check'));
    await setup();
    fireEvent.change(field('Cintura'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar medidas de hoje' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('❌ Não foi possível salvar. Confira os valores (em cm).'));
    expect(field('Cintura').value).toBe('5');
  });

  it('mostra a diferença desde o primeiro registro, com sinal', async () => {
    h.api.fetchMeasurements.mockResolvedValue([
      row('2026-09-01', { cintura: 90, braco: 34 }),
      row('2026-10-01', { cintura: 86.5, braco: 35.5 }),
    ]);
    await setup();
    const items = screen.getAllByRole('listitem').map(li => li.textContent);
    expect(items.some(t => t.includes('Cintura') && t.includes('90 → 86.5 cm') && t.includes('(-3,5)'))).toBe(true);
    expect(items.some(t => t.includes('Braço') && t.includes('(+1,5)'))).toBe(true);
  });

  it('o gráfico segue a medida escolhida', async () => {
    h.api.fetchMeasurements.mockResolvedValue([
      row('2026-09-01', { cintura: 90, coxa: 58 }),
      row('2026-10-01', { cintura: 88, coxa: 59 }),
    ]);
    await setup();
    expect(screen.getByRole('button', { name: 'Cintura' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('chart').textContent).toMatch(/=90;.*=88/);

    fireEvent.click(screen.getByRole('button', { name: 'Coxa' }));
    expect(screen.getByRole('button', { name: 'Coxa' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('chart').textContent).toMatch(/=58;.*=59/);

    fireEvent.click(screen.getByRole('button', { name: 'Peito' }));
    expect(screen.getByTestId('chart').textContent).toBe('Nenhuma medida registrada ainda.');
  });

  it('falha ao carregar mostra o formulário vazio em vez de sumir', async () => {
    h.api.fetchMeasurements.mockRejectedValue(new Error('rede'));
    await setup();
    expect(screen.getByRole('button', { name: 'Salvar medidas de hoje' })).toBeTruthy();
  });
});
