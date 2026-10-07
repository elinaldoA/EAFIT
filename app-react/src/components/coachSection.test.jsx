// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  genderAvailable: vi.fn(),
  listPtVoices: vi.fn(),
  coachSample: vi.fn(),
  coachStop: vi.fn(),
  updateProfile: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/voice', () => ({
  genderAvailable: (...a) => h.genderAvailable(...a),
  listPtVoices: (...a) => h.listPtVoices(...a),
  isVoiceSupported: () => true,
  speak: vi.fn(),
  cancelSpeech: vi.fn(),
}));
vi.mock('../lib/coach', async orig => ({
  ...(await orig()),
  coachSample: (...a) => h.coachSample(...a),
  coachStop: (...a) => h.coachStop(...a),
}));

import { CoachSection } from './ProfilePreferencesSection';
import { getCoachPrefs } from '../lib/coach';

beforeEach(() => {
  localStorage.clear();
  h.listPtVoices.mockReset().mockResolvedValue([]);
  h.genderAvailable.mockReset().mockResolvedValue({ supported: true, matched: true });
  h.updateProfile.mockReset().mockResolvedValue({ error: null });
  h.toast.mockReset();
  h.coachSample.mockReset();
  h.coachStop.mockReset();
});
afterEach(cleanup);

const setup = () => render(<CoachSection updateProfile={h.updateProfile} toast={h.toast} />);

describe('CoachSection', () => {
  it('começa desligado e ligar toca a amostra e salva no perfil e no aparelho', async () => {
    setup();
    const toggle = screen.getByLabelText('Falar durante o treino');
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(h.coachSample).toHaveBeenCalled();
    expect(h.updateProfile).toHaveBeenCalledWith({ coachEnabled: true });
    expect(getCoachPrefs().enabled).toBe(true);
    await waitFor(() => expect(h.genderAvailable).toHaveBeenCalled());
  });

  it('desligar para a fala', () => {
    localStorage.setItem('coach_prefs', JSON.stringify({ enabled: true }));
    setup();
    fireEvent.click(screen.getByLabelText('Falar durante o treino'));
    expect(h.updateProfile).toHaveBeenCalledWith({ coachEnabled: false });
    expect(h.coachStop).toHaveBeenCalled();
    expect(getCoachPrefs().enabled).toBe(false);
  });

  it('escolhe voz masculina, tom, quantidade e velocidade', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Voz'), { target: { value: 'male' } });
    expect(h.updateProfile).toHaveBeenCalledWith({ coachGender: 'male' });
    fireEvent.change(screen.getByLabelText('Jeito de falar'), { target: { value: 'zoeira' } });
    expect(h.updateProfile).toHaveBeenCalledWith({ coachTone: 'zoeira' });
    fireEvent.change(screen.getByLabelText('Quanto ele fala'), { target: { value: 'light' } });
    expect(h.updateProfile).toHaveBeenCalledWith({ coachFrequency: 'light' });
    fireEvent.change(screen.getByLabelText('Velocidade da fala'), { target: { value: '1.1' } });
    expect(h.updateProfile).toHaveBeenCalledWith({ coachRate: 1.1 });
    expect(getCoachPrefs()).toMatchObject({ gender: 'male', tone: 'zoeira', frequency: 'light', rate: 1.1 });
  });

  it('as opções de voz mostram o nome do treinador', () => {
    setup();
    expect(screen.getByRole('option', { name: 'Feminina · Bia' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Masculina · Beto' })).toBeTruthy();
  });

  it('avisa quando o aparelho não tem voz do gênero escolhido', async () => {
    h.genderAvailable.mockResolvedValue({ supported: true, matched: false });
    setup();
    expect(await screen.findByText(/não tem uma voz feminina em português/)).toBeTruthy();
  });

  it('não avisa quando há voz do gênero', async () => {
    setup();
    await waitFor(() => expect(h.genderAvailable).toHaveBeenCalled());
    expect(screen.queryByText(/não tem uma voz/)).toBeNull();
  });

  it('mostra erro do perfil em toast', async () => {
    h.updateProfile.mockResolvedValue({ error: { message: 'falhou' } });
    setup();
    fireEvent.change(screen.getByLabelText('Jeito de falar'), { target: { value: 'calmo' } });
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('❌ falhou'));
  });

  it('com várias vozes no aparelho, permite escolher uma à mão e volta ao automático ao trocar o gênero', async () => {
    h.listPtVoices.mockResolvedValue([
      { name: 'Microsoft Antonio Online (Natural)', lang: 'pt-BR', gender: 'male' },
      { name: 'Voz Qualquer', lang: 'pt-BR', gender: null },
    ]);
    setup();
    const select = await screen.findByLabelText('Voz do aparelho');
    expect(screen.getByRole('option', { name: 'Microsoft Antonio Online (Natural) · masculina' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Voz Qualquer' })).toBeTruthy();
    fireEvent.change(select, { target: { value: 'Voz Qualquer' } });
    expect(getCoachPrefs().voiceName).toBe('Voz Qualquer');
    expect(h.coachSample).toHaveBeenCalled();
    expect(h.updateProfile).not.toHaveBeenCalled(); // vale só neste aparelho
    fireEvent.change(screen.getByLabelText('Voz'), { target: { value: 'male' } });
    expect(getCoachPrefs().voiceName).toBe('');
  });

  it('com uma voz só, não mostra o seletor manual', async () => {
    h.listPtVoices.mockResolvedValue([{ name: 'Luciana', lang: 'pt-BR', gender: 'female' }]);
    setup();
    await waitFor(() => expect(h.listPtVoices).toHaveBeenCalled());
    expect(screen.queryByLabelText('Voz do aparelho')).toBeNull();
  });

  it('o botão de amostra fala com as escolhas atuais', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Ouvir amostra/ }));
    expect(h.coachSample).toHaveBeenCalled();
  });
});
