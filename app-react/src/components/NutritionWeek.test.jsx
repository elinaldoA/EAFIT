// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import NutritionWeek from './NutritionWeek';
import ProteinSources from './ProteinSources';

afterEach(cleanup);

const series = Array.from({ length: 14 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, g: 100 + i }));
const base = {
  tdee: null, tdeeKcal: null, tdeeDiffers: false, newKcal: null, reading: null,
  week: { avgKcal: 2100 }, stats: { avg7: 130 }, weightRate: null,
  series, kcalSeries: series.map(d => ({ date: d.date, g: d.g * 20 })), goalG: 140, kcalGoal: 2200, loading: false,
};

describe('NutritionWeek', () => {
  it('mostra as médias da semana e o ritmo de peso, com traço quando falta dado', () => {
    render(<NutritionWeek {...base} />);
    expect(screen.getByText('Sua semana')).toBeTruthy();
    expect(screen.getByText('2.100')).toBeTruthy();
    expect(screen.getByText('130')).toBeTruthy();
    expect(screen.getByText('–')).toBeTruthy();
  });

  it('o ritmo de peso positivo ganha o sinal de mais', () => {
    render(<NutritionWeek {...base} weightRate={0.4} />);
    expect(screen.getByText('+0,4')).toBeTruthy();
  });

  it('o gasto real medido manda: diz se a meta está de acordo ou qual mirar', () => {
    const { rerender } = render(<NutritionWeek {...base} tdee={2500} tdeeKcal={2200} tdeeDiffers={false} />);
    expect(screen.getByText(/seu gasto real é de cerca de 2\.500 kcal/)).toBeTruthy();
    expect(screen.getByText(/Sua meta de 2\.200 kcal está de acordo/)).toBeTruthy();
    rerender(<NutritionWeek {...base} tdee={2900} tdeeKcal={2700} tdeeDiffers />);
    expect(screen.getByText(/mire em 2\.700 kcal por dia \(meta atual: 2\.200\)/)).toBeTruthy();
  });

  it('sem gasto medido, o ajuste calculado vem antes da leitura do platô', () => {
    render(<NutritionWeek {...base} newKcal={2000} reading="plateau" />);
    expect(screen.getByText(/Passe para cerca de 2\.000 kcal por dia/)).toBeTruthy();
    expect(screen.queryByText(/Calorias na meta, mas o peso/)).toBeNull();
  });

  it('sem nada disso, mostra o texto da leitura da semana', () => {
    render(<NutritionWeek {...base} reading="on_track" />);
    expect(screen.getByText('Você está dentro da meta de calorias. Continue assim.')).toBeTruthy();
  });

  it('alterna o gráfico entre calorias e proteína', () => {
    render(<NutritionWeek {...base} />);
    expect(screen.getByRole('tab', { name: 'Calorias' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Proteína' }));
    expect(screen.getByRole('tab', { name: 'Proteína' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Calorias' }).getAttribute('aria-selected')).toBe('false');
  });

  it('carregando, no lugar do gráfico aparece o esqueleto', () => {
    const { container } = render(<NutritionWeek {...base} loading />);
    expect(container.querySelector('.skeleton, [class*="skeleton"]')).not.toBeNull();
  });
});

describe('ProteinSources', () => {
  it('lista as fontes com a proteína de cada uma e o aviso de valores aproximados', () => {
    const { container } = render(<ProteinSources />);
    expect(screen.getByText('Fontes de proteína')).toBeTruthy();
    expect(container.querySelectorAll('.protein-sources__item').length).toBeGreaterThan(3);
    expect(screen.getByText(/Não substituem orientação de nutricionista/)).toBeTruthy();
  });
});
