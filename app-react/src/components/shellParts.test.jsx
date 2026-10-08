// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ config: {}, reportError: vi.fn(), reload: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAppConfig', () => ({ useAppConfig: () => ({ config: h.config }) }));
vi.mock('../lib/errorReporter', () => ({ reportError: (...a) => h.reportError(...a) }));

import ErrorBoundary from './ErrorBoundary';
import BottomNav from './BottomNav';
import AnnouncementBanner from './AnnouncementBanner';
import MaintenanceScreen from './MaintenanceScreen';

const banner = (o = {}) => ({ enabled: true, message: 'Manutenção às 22h', level: 'warning', linkUrl: '', linkLabel: '', version: 3, ...o });

beforeEach(() => {
  localStorage.clear();
  h.reportError.mockReset();
  h.config = { banner: banner() };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Bomb({ explode = true }) {
  if (explode) throw new Error('boom');
  return <div>tudo certo</div>;
}

describe('ErrorBoundary', () => {
  it('sem erro mostra o conteúdo', () => {
    render(<ErrorBoundary><Bomb explode={false} /></ErrorBoundary>);
    expect(screen.getByText('tudo certo')).toBeTruthy();
  });

  it('com erro mostra a tela de recuperação e registra o erro', () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    expect(screen.getByRole('alert').textContent).toMatch(/Algo deu errado/);
    expect(screen.getByText(/erro inesperado/)).toBeTruthy();
    expect(h.reportError).toHaveBeenCalledWith('boundary', expect.any(Error));
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
  });

  it('na variante de página oferece tentar de novo, que volta a renderizar', () => {
    let explode = true;
    function Flaky() { return <Bomb explode={explode} />; }
    render(<ErrorBoundary variant="page"><Flaky /></ErrorBoundary>);
    expect(screen.getByText(/Não foi possível abrir esta tela/)).toBeTruthy();
    explode = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(screen.getByText('tudo certo')).toBeTruthy();
  });

  it('erro de chunk de deploy novo recarrega uma vez', () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
    function ChunkBomb() { throw new Error('Failed to fetch dynamically imported module: x'); }
    render(<ErrorBoundary><ChunkBomb /></ErrorBoundary>);
    expect(reload).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });
});

describe('BottomNav', () => {
  it('cinco abas, a ativa marcada, e clicar troca', () => {
    const onChange = vi.fn();
    render(<BottomNav active="dash" onChange={onChange} />);
    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.getByRole('button', { name: /Evolução/ }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: /Água/ }));
    expect(onChange).toHaveBeenCalledWith('hidratacao');
  });

  it('mostra a bolinha de não lidos só quando maior que zero', () => {
    render(<BottomNav active="treino" onChange={() => {}} badges={{ perfil: 2, dash: 0 }} />);
    expect(screen.getByLabelText('2 não lido(s)')).toBeTruthy();
    expect(screen.queryByLabelText('0 não lido(s)')).toBeNull();
  });
});

describe('AnnouncementBanner', () => {
  it('mostra o aviso do admin com o nível', () => {
    render(<AnnouncementBanner />);
    const el = screen.getByRole('status');
    expect(el.textContent).toContain('Manutenção às 22h');
    expect(el.className).toContain('announce--warning');
  });

  it('desligado ou sem mensagem não aparece', () => {
    h.config = { banner: banner({ enabled: false }) };
    const { container } = render(<AnnouncementBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('link do aviso abre em outra aba, sem referrer, com rótulo padrão', () => {
    h.config = { banner: banner({ linkUrl: 'https://x.com/novidade' }) };
    render(<AnnouncementBanner />);
    const link = screen.getByRole('link', { name: 'Saiba mais' });
    expect(link.getAttribute('href')).toBe('https://x.com/novidade');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('aviso cujo link aponta pra esta mesma página não aparece', () => {
    h.config = { banner: banner({ linkUrl: window.location.origin + window.location.pathname }) };
    const { container } = render(<AnnouncementBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('dispensar esconde até o admin publicar uma versão nova', () => {
    const { unmount } = render(<AnnouncementBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }));
    expect(screen.queryByRole('status')).toBeNull();
    unmount();

    render(<AnnouncementBanner />);
    expect(screen.queryByRole('status')).toBeNull(); // continua dispensado (v3)

    cleanup();
    h.config = { banner: banner({ version: 4 }) };
    render(<AnnouncementBanner />);
    expect(screen.getByRole('status')).toBeTruthy(); // versão nova volta
  });
});

describe('MaintenanceScreen', () => {
  it('mostra a mensagem do admin ou o texto padrão', () => {
    render(<MaintenanceScreen message="Volta às 14h" />);
    expect(screen.getByText('Volta às 14h')).toBeTruthy();
    cleanup();
    render(<MaintenanceScreen />);
    expect(screen.getByText(/manutenção rápida/)).toBeTruthy();
  });

  it('Tentar novamente recarrega a página', () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
    render(<MaintenanceScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(reload).toHaveBeenCalled();
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });
});
