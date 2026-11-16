// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  track: vi.fn(),
  released: null,
  sports: [
    { id: 'musculacao', label: 'Musculação', icon: '🏋️', blurb: 'Treino na academia' },
    { id: 'corrida', label: 'Corrida', icon: '🏃', blurb: 'GPS e voz', workoutPlan: false },
  ],
}));

vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' }, updateProfile: h.updateProfile }) }));
vi.mock('../context/useToast', () => ({ useToast: () => vi.fn() }));
vi.mock('../data/workoutTemplates', () => ({ generatePlan: vi.fn().mockResolvedValue([{ dia: 'Seg' }]) }));
vi.mock('../lib/workoutPlans', () => ({ seedGeneratedPlan: vi.fn().mockResolvedValue() }));
vi.mock('../lib/weightLog', () => ({ upsertWeightLog: vi.fn().mockResolvedValue() }));
vi.mock('../lib/tracking', () => ({ trackEvent: (...a) => h.track(...a) }));
vi.mock('../hooks/useSportModule', () => ({ useSportModule: () => ({ module: h.sports[0], available: h.sports, released: h.released || h.sports }) }));

import OnboardingScreen from './OnboardingScreen';

const fill = () => {
  fireEvent.change(screen.getByLabelText('Como podemos te chamar?'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText('Sexo biológico'), { target: { value: 'M' } });
  fireEvent.change(screen.getByLabelText('Idade'), { target: { value: '30' } });
  fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '80' } });
  fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: '180' } });
};

beforeEach(() => {
  h.released = null;
  localStorage.clear();
  h.updateProfile.mockReset().mockResolvedValue({});
  h.track.mockReset();
});
afterEach(cleanup);

describe('onboarding: qual é a sua vibe?', () => {
  it('abre sem nenhum esporte marcado e pede a escolha antes de continuar', () => {
    render(<OnboardingScreen />);
    expect(screen.getAllByRole('radio').every(r => r.getAttribute('aria-checked') === 'false')).toBe(true);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /Gerar meu treino|Continuar|Começar/ }));
    expect(screen.getByText('Escolha o seu esporte para continuar.')).toBeTruthy();
    expect(h.updateProfile).not.toHaveBeenCalled();
    expect(h.track).toHaveBeenCalledWith('onboarding', 'erro_esporte');
  });

  it('o esporte do link de divulgação já vem marcado', () => {
    localStorage.setItem('eafit_sport_pref', JSON.stringify({ id: 'corrida', at: Date.now() }));
    render(<OnboardingScreen />);
    expect(screen.getByRole('radio', { name: /Corrida/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('link de um esporte que não está liberado é ignorado', () => {
    localStorage.setItem('eafit_sport_pref', JSON.stringify({ id: 'natacao', at: Date.now() }));
    render(<OnboardingScreen />);
    expect(screen.getAllByRole('radio').every(r => r.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('escolher corrida salva o esporte, registra a métrica e limpa a sugestão do link', async () => {
    localStorage.setItem('eafit_sport_pref', JSON.stringify({ id: 'corrida', at: Date.now() }));
    render(<OnboardingScreen />);
    fireEvent.click(screen.getByRole('radio', { name: /Musculação/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Corrida/ }));
    expect(h.track).toHaveBeenCalledWith('onboarding', 'esporte_corrida');
    fill();
    fireEvent.click(screen.getByRole('button', { name: /Gerar meu treino|Continuar|Começar/ }));
    await waitFor(() => expect(h.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ esporte: 'corrida' })));
    expect(localStorage.getItem('eafit_sport_pref')).toBeNull();
  });

  it('sem o módulo liberado para todos não há pergunta de esporte, nem com o link de divulgação', async () => {
    h.released = [h.sports[0]]; // liberado só por conta ou no modo de desenvolvimento
    localStorage.setItem('eafit_sport_pref', JSON.stringify({ id: 'corrida', at: Date.now() }));
    render(<OnboardingScreen />);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /Gerar meu treino|Continuar|Começar/ }));
    await waitFor(() => expect(h.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ esporte: 'musculacao' })));
  });
});
