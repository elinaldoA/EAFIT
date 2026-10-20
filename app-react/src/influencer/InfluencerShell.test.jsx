// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ fetchMyAmbassador: vi.fn(), countUnread: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/ambassador', async orig => ({ ...(await orig()), fetchMyAmbassador: (...a) => h.fetchMyAmbassador(...a) }));
vi.mock('../lib/inbox', () => ({ countUnreadInfluencerMessages: (...a) => h.countUnread(...a) }));
vi.mock('./MessagesPage', () => ({ default: ({ onRead }) => <div data-testid="p-recados"><button type="button" onClick={onRead}>li</button></div> }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'i1' } }) }));
vi.mock('../components/ThemeToggle', () => ({ default: () => <button type="button">tema</button> }));
vi.mock('../components/Tutorial', () => ({ default: ({ role }) => <div data-testid="tutorial">{role}</div> }));
vi.mock('./ResultsPage', () => ({ default: ({ amb }) => <div data-testid="p-resultados">{amb.code}</div> }));
vi.mock('./SharePage', () => ({ default: ({ amb }) => <div data-testid="p-divulgar">{amb.code}</div> }));
vi.mock('./InfluencerAccount', () => ({ default: ({ onSwitchToStudent }) => (
  <div data-testid="p-conta"><button type="button" onClick={onSwitchToStudent}>virar aluno</button></div>
) }));

import InfluencerShell from './InfluencerShell';

const AMB = { name: 'Ana', code: 'anafit', active: true, kind: 'influenciador', visits: 0, signups: 0, total: 0, active7: 0 };

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  h.fetchMyAmbassador.mockReset().mockResolvedValue(AMB);
  h.countUnread.mockReset().mockResolvedValue(0);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('InfluencerShell', () => {
  it('abre em Resultados com os dados do programa e o tutorial do influenciador', async () => {
    render(<InfluencerShell onSwitchToStudent={() => {}} />);
    expect((await screen.findByTestId('p-resultados')).textContent).toBe('anafit');
    expect(screen.getByTestId('tutorial').textContent).toBe('influencer');
    expect(screen.getByRole('navigation', { name: 'Navegação do influenciador' })).toBeTruthy();
  });

  it('a navegação troca de página e a conta volta para o modo aluno', async () => {
    const onSwitch = vi.fn();
    render(<InfluencerShell onSwitchToStudent={onSwitch} />);
    await screen.findByTestId('p-resultados');
    fireEvent.click(screen.getByRole('button', { name: /Divulgar/ }));
    expect(screen.getByTestId('p-divulgar')).toBeTruthy();
    expect(window.location.hash).toBe('#divulgar');
    fireEvent.click(screen.getByRole('button', { name: /Conta/ }));
    fireEvent.click(screen.getByText('virar aluno'));
    expect(onSwitch).toHaveBeenCalled();
  });

  it('recados novos aparecem na aba e somem depois de lidos', async () => {
    h.countUnread.mockResolvedValue(2);
    render(<InfluencerShell onSwitchToStudent={() => {}} />);
    const tab = await screen.findByRole('button', { name: /Recados\s*2/ });
    fireEvent.click(tab);
    fireEvent.click(screen.getByText('li'));
    expect(screen.getByRole('button', { name: /^Recados$/ })).toBeTruthy();
  });

  it('conta que saiu do programa vê o aviso e volta para o modo aluno', async () => {
    h.fetchMyAmbassador.mockResolvedValue(null);
    const onSwitch = vi.fn();
    render(<InfluencerShell onSwitchToStudent={onSwitch} />);
    expect(await screen.findByText(/não está mais no programa/)).toBeTruthy();
    fireEvent.click(screen.getByText('Usar como aluno'));
    expect(onSwitch).toHaveBeenCalled();
  });

  it('falha de rede mostra o aviso em vez de travar no carregamento', async () => {
    h.fetchMyAmbassador.mockRejectedValue(new Error('rede'));
    render(<InfluencerShell onSwitchToStudent={() => {}} />);
    expect(await screen.findByText(/Não foi possível carregar seu painel/)).toBeTruthy();
  });
});
