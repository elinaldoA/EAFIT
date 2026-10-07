// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/trainerInsights', async (importActual) => ({
  ...(await importActual()),
  fetchGoals: (...a) => h.api.fetchGoals(...a),
  setGoals: (...a) => h.api.setGoals(...a),
}));

import ClientGoals from './ClientGoals';

beforeEach(() => {
  h.toast.mockReset();
  h.api = {
    fetchGoals: vi.fn().mockResolvedValue(null),
    setGoals: vi.fn().mockResolvedValue(undefined),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const save = () => screen.getByRole('button', { name: 'Salvar e enviar ao aluno' });

describe('ClientGoals', () => {
  it('carrega as metas atuais nos campos (peso com vírgula)', async () => {
    h.api.fetchGoals.mockResolvedValue({ weekly: 4, weight: 78.5, note: 'Constância' });
    render(<ClientGoals clientId="c1" />);
    expect((await screen.findByLabelText('Treinos por semana')).value).toBe('4');
    expect(screen.getByLabelText('Peso alvo (kg)').value).toBe('78,5');
    expect(screen.getByLabelText('Recado sobre a meta (opcional)').value).toBe('Constância');
  });

  it('falha ao carregar ainda mostra o formulário vazio', async () => {
    h.api.fetchGoals.mockRejectedValue(new Error('x'));
    render(<ClientGoals clientId="c1" />);
    expect(await screen.findByLabelText('Treinos por semana')).toBeTruthy();
  });

  it('sem nenhuma meta definida avisa', async () => {
    render(<ClientGoals clientId="c1" />);
    await screen.findByLabelText('Treinos por semana');
    fireEvent.click(save());
    expect(screen.getByRole('alert').textContent).toBe('Defina ao menos uma meta.');
    expect(h.api.setGoals).not.toHaveBeenCalled();
  });

  it('peso alvo inválido avisa', async () => {
    render(<ClientGoals clientId="c1" />);
    fireEvent.change(await screen.findByLabelText('Peso alvo (kg)'), { target: { value: 'abc' } });
    fireEvent.click(save());
    expect(screen.getByRole('alert').textContent).toBe('Peso alvo inválido.');
  });

  it('salva treinos por semana, peso com vírgula e recado, e avisa o pai', async () => {
    const onSaved = vi.fn();
    render(<ClientGoals clientId="c1" onSaved={onSaved} />);
    fireEvent.change(await screen.findByLabelText('Treinos por semana'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Peso alvo (kg)'), { target: { value: '78,5' } });
    fireEvent.change(screen.getByLabelText('Recado sobre a meta (opcional)'), { target: { value: '  foco  ' } });
    fireEvent.click(save());
    await waitFor(() => expect(h.api.setGoals).toHaveBeenCalledWith('c1', { weekly: 5, weight: 78.5, note: 'foco' }));
    expect(h.toast).toHaveBeenCalledWith('🎯 Metas enviadas para o aluno');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('uma meta só já basta', async () => {
    render(<ClientGoals clientId="c1" />);
    fireEvent.change(await screen.findByLabelText('Treinos por semana'), { target: { value: '3' } });
    fireEvent.click(save());
    await waitFor(() => expect(h.api.setGoals).toHaveBeenCalledWith('c1', { weekly: 3, weight: null, note: '' }));
  });

  it('erro do servidor aparece como mensagem', async () => {
    h.api.setGoals.mockRejectedValue(new Error('not_authorized'));
    render(<ClientGoals clientId="c1" />);
    fireEvent.change(await screen.findByLabelText('Treinos por semana'), { target: { value: '3' } });
    fireEvent.click(save());
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });
});
