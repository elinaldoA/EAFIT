// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const createImportedPlan = vi.fn(async () => ({ id: 'p1' }));
const saveImportedSessions = vi.fn(async () => ({ imported: 1, skippedExisting: 0, skippedFuture: 0 }));
let fileText = '';

vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../hooks/useBackToClose', () => ({ useBackToClose: () => {} }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/workoutPlans', () => ({ createImportedPlan: (...a) => createImportedPlan(...a) }));
vi.mock('../lib/workoutImportFiles', () => ({ readWorkoutFile: async () => ({ text: fileText }) }));
vi.mock('../lib/workoutImport', async (orig) => ({ ...(await orig()), saveImportedSessions: (...a) => saveImportedSessions(...a) }));

import ImportWorkoutsModal from './ImportWorkoutsModal';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function choose(name) {
  const input = document.querySelector('input[type=file]:not([capture])');
  fireEvent.change(input, { target: { files: [new File(['x'], name)] } });
}

describe('ImportWorkoutsModal', () => {
  it('ficha sem datas vira plano de treino', async () => {
    fileText = 'Dia A (Peito):\n1. Supino reto com barra 4 8-10\n2. Crucifixo 3 12-15\nDia B (Costas):\nRemada curvada 4 8-10\nPuxada 3x12';
    const onImported = vi.fn();
    render(<ImportWorkoutsModal onImported={onImported} onClose={() => {}} />);
    await choose('Treino_ABC.pdf');
    await screen.findByText('📋 Ficha com 2 treinos');
    expect(screen.getByDisplayValue('Treino ABC')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Criar plano' }));
    await screen.findByText('✅ Plano “Treino ABC” criado e ativado');
    const [, name, days, activate] = createImportedPlan.mock.calls[0];
    expect([name, activate]).toEqual(['Treino ABC', true]);
    expect(days.find(d => d.dia === 'Segunda').exercicios.map(e => e.nome)).toEqual(['Supino reto com barra', 'Crucifixo']);
    expect(days.find(d => d.dia === 'Quinta').foco).toBe('Treino B — Costas');
    expect(onImported).toHaveBeenCalled();
    expect(saveImportedSessions).not.toHaveBeenCalled();
  });

  it('ficha pode ir pro histórico no dia escolhido', async () => {
    fileText = 'Supino 4x10 40kg\nRemada 3x12 30kg';
    render(<ImportWorkoutsModal onClose={() => {}} />);
    await choose('ficha.txt');
    fireEvent.click(await screen.findByRole('button', { name: /registrar no histórico/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Importar 1 treinos' })).toBeTruthy());
    expect(screen.getByText(/Em que dia foi esse treino/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Importar 1 treinos' }));
    await waitFor(() => expect(saveImportedSessions).toHaveBeenCalled());
    expect(createImportedPlan).not.toHaveBeenCalled();
  });

  it('arquivo com datas continua indo pro histórico', async () => {
    fileText = '15/01/2024\nSupino 4x10 40kg';
    render(<ImportWorkoutsModal onClose={() => {}} />);
    await choose('log.txt');
    await screen.findByRole('button', { name: 'Importar 1 treinos' });
    expect(screen.queryByText(/Ficha com/)).toBeNull();
  });
});
