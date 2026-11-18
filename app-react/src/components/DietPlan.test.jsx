// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import DietPlan from './DietPlan';

afterEach(cleanup);

const PLAN = [{ meal: 'almoco', name: 'Almoço', items: [{ label: 'Arroz', icon: '🍚', g: 4, kcal: 195, carbs: 42, fat: 0, amount: '150 g' }] }];

describe('DietPlan', () => {
  it('importa o texto, mostra a prévia e salva', async () => {
    const onSave = vi.fn();
    render(<DietPlan plan={[]} onSave={onSave} onClear={() => {}} onRegister={() => {}} />);
    fireEvent.click(screen.getByText('Importar dieta'));
    fireEvent.change(screen.getByLabelText('Cole a dieta aqui'), { target: { value: 'Almoço\nArroz 150g - 195 kcal - 4g prot' } });
    fireEvent.click(screen.getByText('Ler a dieta'));
    expect(screen.getByText('Arroz')).toBeTruthy();
    fireEvent.click(screen.getByText('Salvar minha dieta'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0][0]).toMatchObject({ meal: 'almoco', name: 'Almoço' });
  });

  it('avisa quando o texto não tem refeições', () => {
    render(<DietPlan plan={[]} onSave={() => {}} onClear={() => {}} onRegister={() => {}} />);
    fireEvent.click(screen.getByText('Importar dieta'));
    fireEvent.change(screen.getByLabelText('Cole a dieta aqui'), { target: { value: 'oi' } });
    fireEvent.click(screen.getByText('Ler a dieta'));
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('registra a refeição do plano com um toque', () => {
    const onRegister = vi.fn();
    render(<DietPlan plan={PLAN} onSave={() => {}} onClear={() => {}} onRegister={onRegister} />);
    fireEvent.click(screen.getByText('Registrar almoço'));
    expect(onRegister).toHaveBeenCalledWith(PLAN[0]);
  });
});
