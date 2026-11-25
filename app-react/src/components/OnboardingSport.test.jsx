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

const next = () => fireEvent.click(document.querySelector('button[type="submit"]'));
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const pickCard = label => fireEvent.click(screen.getAllByRole('radio').find(r => r.querySelector('strong')?.textContent === label));
// Passa pelas telas de cartão que existirem (objetivo, nível, local, sexo) e pelas de número.
const fillCards = () => {
  [['Objetivo principal', 'Ganho de massa'], ['Nível de experiência', 'Iniciante'], ['Onde você treina', 'Academia'], ['Sexo biológico', 'Masculino']].forEach(([group, label]) => {
    if (screen.queryByRole('radiogroup', { name: group })) pickCard(label);
  });
};
// Preenche o cadastro todo, tela a tela, e para na última (pronto para enviar).
const fill = () => {
  if (screen.queryByRole('radiogroup', { name: 'Qual é a sua vibe?' })) next();
  fillCards();
  type('Idade', '30');
  next();
  type('Peso (kg)', '80');
  type('Altura (cm)', '180');
  next();
  type('Como podemos te chamar?', 'Ana');
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
    next();
    expect(screen.getByText('Escolha o seu esporte para continuar.')).toBeTruthy();
    expect(screen.getByText('Passo 1 de 8')).toBeTruthy();
    expect(h.updateProfile).not.toHaveBeenCalled();
    expect(h.track).toHaveBeenCalledWith('onboarding', 'erro_esporte');
  });

  it('o Enter / Ir do teclado envia o formulário (é um <form>)', async () => {
    localStorage.setItem('eafit_sport_pref', JSON.stringify({ id: 'corrida', at: Date.now() }));
    render(<OnboardingScreen />);
    fill();
    fireEvent.submit(screen.getByLabelText('Como podemos te chamar?').closest('form'));
    await waitFor(() => expect(h.updateProfile).toHaveBeenCalled());
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
    fireEvent.click(screen.getByRole('button', { name: /Gerar meu treino|Começar/ }));
    await waitFor(() => expect(h.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ esporte: 'corrida' })));
    expect(localStorage.getItem('eafit_sport_pref')).toBeNull();
  });

  it('sem o módulo liberado para todos não há pergunta de esporte, nem com o link de divulgação', async () => {
    h.released = [h.sports[0]]; // liberado só por conta ou no modo de desenvolvimento
    localStorage.setItem('eafit_sport_pref', JSON.stringify({ id: 'corrida', at: Date.now() }));
    render(<OnboardingScreen />);
    expect(screen.queryByRole('radiogroup', { name: 'Qual é a sua vibe?' })).toBeNull(); // sem tela de esporte
    fill();
    fireEvent.click(screen.getByRole('button', { name: /Gerar meu treino|Começar/ }));
    await waitFor(() => expect(h.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ esporte: 'musculacao' })));
  });

  it('em telas: não avança com campo inválido, volta sem perder o que foi digitado e as escolhas começam vazias', () => {
    localStorage.setItem('eafit_sport_pref', JSON.stringify({ id: 'musculacao', at: Date.now() }));
    render(<OnboardingScreen />);
    next(); // esporte
    expect(screen.getByText('Passo 2 de 8')).toBeTruthy();
    pickCard('Ganho de massa');
    expect(screen.getAllByRole('radio').every(r => r.getAttribute('aria-checked') === 'false')).toBe(true); // nível
    pickCard('Iniciante');
    pickCard('Academia');
    pickCard('Masculino');
    expect(screen.getByText('Passo 6 de 8')).toBeTruthy();
    type('Idade', '3');
    next();
    expect(screen.getByText('Corrija os campos marcados acima.')).toBeTruthy();
    expect(screen.getByText('Passo 6 de 8')).toBeTruthy();
    type('Idade', '30');
    next();
    expect(screen.getByText('Passo 7 de 8')).toBeTruthy();
    type('Peso (kg)', '80');
    type('Altura (cm)', '180');
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByLabelText('Idade').value).toBe('30');
    next();
    expect(screen.getByLabelText('Peso (kg)').value).toBe('80');
    next();
    expect(screen.getByLabelText('Como podemos te chamar?').value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar meu treino' }));
    expect(screen.getByText('Diga como podemos te chamar.')).toBeTruthy();
    expect(h.updateProfile).not.toHaveBeenCalled();
  });

  it('corrida (sem plano) não pergunta objetivo nem local: 6 telas, com o nível logo depois do esporte', async () => {
    localStorage.setItem('eafit_sport_pref', JSON.stringify({ id: 'corrida', at: Date.now() }));
    render(<OnboardingScreen />);
    next(); // esporte
    expect(screen.getByText('Passo 2 de 6')).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'Objetivo principal' })).toBeNull();
    pickCard('Avançado');
    pickCard('Masculino');
    type('Idade', '30');
    next();
    type('Peso (kg)', '80');
    type('Altura (cm)', '180');
    next();
    type('Como podemos te chamar?', 'Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }));
    await waitFor(() => expect(h.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ nivel: 'avancado', esporte: 'corrida' })));
  });
});
