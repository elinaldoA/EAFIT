// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), auth: {}, voice: true }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/voice', () => ({ isVoiceSupported: () => h.voice, speak: vi.fn(), cancelSpeech: vi.fn() }));
vi.mock('../context/useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));

import CoachPrompt from './CoachPrompt';
import { getCoachPrefs } from '../lib/coach';

beforeEach(() => {
  localStorage.clear();
  h.toast.mockReset();
  h.voice = true;
  h.auth = { user: { id: 'u1', user_metadata: {} }, updateProfile: vi.fn().mockResolvedValue({ error: null }) };
});
afterEach(cleanup);

describe('CoachPrompt', () => {
  it('oferece a voz a quem ainda não ligou', () => {
    render(<CoachPrompt onEnabled={() => {}} />);
    expect(screen.getByText('🎙️ Quer um treinador falando com você?')).toBeTruthy();
  });

  it('não oferece sem suporte, com a voz ligada ou a quem já decidiu no Perfil', () => {
    h.voice = false;
    const a = render(<CoachPrompt onEnabled={() => {}} />);
    expect(a.container.firstChild).toBeNull();
    a.unmount();

    h.voice = true;
    localStorage.setItem('coach_prefs', JSON.stringify({ enabled: true }));
    const b = render(<CoachPrompt onEnabled={() => {}} />);
    expect(b.container.firstChild).toBeNull();
    b.unmount();

    localStorage.clear();
    h.auth.user.user_metadata.coachEnabled = false;
    const c = render(<CoachPrompt onEnabled={() => {}} />);
    expect(c.container.firstChild).toBeNull();
  });

  it('Ativar voz liga no aparelho e na conta, avisa e some', () => {
    const onEnabled = vi.fn();
    render(<CoachPrompt onEnabled={onEnabled} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ativar voz' }));
    expect(getCoachPrefs().enabled).toBe(true);
    expect(h.auth.updateProfile).toHaveBeenCalledWith({ coachEnabled: true });
    expect(onEnabled).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith('🎙️ Treinador por voz ativado — ajuste a voz e o tom em Perfil');
    expect(screen.queryByText(/Quer um treinador/)).toBeNull();
  });

  it('erro ao salvar na conta mostra a mensagem', async () => {
    h.auth.updateProfile.mockResolvedValue({ error: { message: 'falhou' } });
    render(<CoachPrompt onEnabled={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ativar voz' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('❌ falhou'));
  });

  it('Agora não guarda a data e esconde; não volta a aparecer logo depois', () => {
    const { unmount } = render(<CoachPrompt onEnabled={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(screen.queryByText(/Quer um treinador/)).toBeNull();
    expect(localStorage.getItem('eafit_coach_prompt_dismissed_at')).toBeTruthy();
    unmount();
    const again = render(<CoachPrompt onEnabled={() => {}} />);
    expect(again.container.firstChild).toBeNull();
  });
});
