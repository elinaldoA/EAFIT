// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ fetchMyAmbassador: vi.fn(), goTo: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/ambassador', async orig => ({ ...(await orig()), fetchMyAmbassador: (...a) => h.fetchMyAmbassador(...a) }));
vi.mock('../lib/appNav', () => ({ goTo: (...a) => h.goTo(...a) }));

import ProfileAmbassadorSection from './ProfileAmbassadorSection';

const SUMMARY = { name: 'Ana', code: 'anafit', active: true, kind: 'embaixador', visits: 20, signups: 5, total: 12, active7: 4 };

beforeEach(() => {
  h.fetchMyAmbassador.mockReset().mockResolvedValue(SUMMARY);
  h.goTo.mockReset();
});
afterEach(cleanup);

describe('ProfileAmbassadorSection', () => {
  it('não aparece para quem não está no programa', async () => {
    h.fetchMyAmbassador.mockResolvedValue(null);
    const { container } = render(<ProfileAmbassadorSection />);
    await waitFor(() => expect(h.fetchMyAmbassador).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('embaixador vê o atalho para o modo Embaixador', async () => {
    render(<ProfileAmbassadorSection />);
    expect(await screen.findByText('Embaixador EAFIT')).toBeTruthy();
    expect(screen.getByText('12 cadastros pelo seu link')).toBeTruthy();
    fireEvent.click(screen.getByText('Abrir modo Embaixador'));
    expect(h.goTo).toHaveBeenCalledWith({ mode: 'program', tab: 'resultados' });
  });

  it('influenciador vê o atalho para o modo Influenciador', async () => {
    h.fetchMyAmbassador.mockResolvedValue({ ...SUMMARY, kind: 'influenciador' });
    render(<ProfileAmbassadorSection />);
    expect(await screen.findByText('Influenciador EAFIT')).toBeTruthy();
    expect(screen.queryByText('Abrir modo Embaixador')).toBeNull();
    fireEvent.click(screen.getByText('Abrir modo Influenciador'));
    expect(h.goTo).toHaveBeenCalledWith({ mode: 'program', tab: 'resultados' });
  });

  it('link pausado aparece no resumo', async () => {
    h.fetchMyAmbassador.mockResolvedValue({ ...SUMMARY, active: false });
    render(<ProfileAmbassadorSection />);
    expect(await screen.findByText('Link pausado pela equipe EAFIT')).toBeTruthy();
  });
});
