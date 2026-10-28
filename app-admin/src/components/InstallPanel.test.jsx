// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc } }));

import InstallPanel from './InstallPanel';

const responses = {
  admin_install_summary: [{
    screen_shown: 8, prompt_accepted: 3, prompt_dismissed: 1, installs: 4, installs_prompt: 3, installs_browser: 0,
    installs_icon: 1, first_opens: 4, installed_total: 6, active_30d: 5, inactive_30d: 1, push_stale: 2,
  }],
  admin_install_daily: [{ day: '2026-10-14', installs: 0, push_stale: 0 }, { day: '2026-10-15', installs: 4, push_stale: 2 }],
  admin_install_by_os: [{ os: 'android', installed_total: 4, installs: 3, active_30d: 3, push_stale: 1 }],
  admin_install_compare: [{ screen_shown: 4, prompt_accepted: 1, prompt_dismissed: 1, installs: 2, first_opens: 2, push_stale: 4 }],
  admin_install_by_browser: [{ browser: 'chrome', installed_total: 5, installs: 3, active_30d: 4 }],
  admin_install_by_origin: [{ source: 'instagram', installs: 3, active_30d: 2 }, { source: 'sem_conta', installs: 1, active_30d: 0 }],
  admin_install_retention: [
    { kind: 'return', bucket: 1, total: 3, base: 4 }, { kind: 'return', bucket: 7, total: 1, base: 2 }, { kind: 'return', bucket: 30, total: 0, base: 0 },
    { kind: 'days', bucket: 0, total: 1, base: 6 }, { kind: 'days', bucket: 1, total: 5, base: 6 },
  ],
  admin_install_devices: [{ installed_at: '2026-10-10T12:00:00Z', os: 'android', browser: 'chrome', install_source: 'prompt', open_days: 3, last_open_on: '2026-10-12', user_id: 'u2', email: 'x@y.z', nome: 'Beto' }],
  admin_push_stale_recent: [{ detected_at: '2026-10-15T15:00:00Z', platform: 'ios', subscribed_at: '2026-09-01T12:00:00Z', user_id: 'u1', email: 'a@b.c', nome: 'Ana', still_has_push: false }],
};

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockImplementation(async name => ({ data: responses[name], error: null }));
});

const renderPanel = () => render(<MemoryRouter><InstallPanel /></MemoryRouter>);

describe('InstallPanel', () => {
  it('mostra números, funil da tela de instalar, sistemas, dias e desinstalações', async () => {
    renderPanel();
    expect(await screen.findByText('Instalações novas no período')).toBeTruthy();
    expect(screen.getByText('Taxa de aceite do botão').nextSibling.textContent).toBe('75%');
    expect(screen.getByText('15/10/2026')).toBeTruthy();
    expect(screen.queryByText('14/10/2026')).toBeNull();
    const link = screen.getByRole('link', { name: 'Ana' });
    expect(link.getAttribute('href')).toBe('/users/u1');
    expect(screen.getByText('iPhone/iPad')).toBeTruthy();
  });

  it('compara com o período anterior e mostra o funil', async () => {
    renderPanel();
    const tile = (await screen.findByText('Instalações novas no período')).previousSibling;
    expect(tile.textContent).toContain('↑ 100%');
    // desinstalações caíram: queda é boa, então a seta é verde (classe "up")
    const stale = screen.getByText('Indícios de desinstalação no período').previousSibling.querySelector('.geo-trend');
    expect(stale.textContent).toBe('↓ 50%');
    expect(stale.className).toContain('geo-trend--up');
    expect(screen.getByText('Viram a tela "Instale o app"')).toBeTruthy();
    expect(screen.getByText('Seguiam abrindo 7 dias depois')).toBeTruthy();
    expect(screen.queryByText('Seguiam abrindo 30 dias depois')).toBeNull();
  });

  it('abas: sistema, navegador, retenção, origem, recentes e parados', async () => {
    renderPanel();
    await screen.findByText('Instalações novas no período');
    fireEvent.click(screen.getByRole('button', { name: 'Sistema e navegador' }));
    expect(screen.getByText('Android')).toBeTruthy();
    expect(screen.getByText('Chrome')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retenção' }));
    expect(screen.getByText('7 dias ou mais').nextSibling.textContent).toBe('1');
    expect(screen.getByText('Nunca abriu pelo ícone')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Origem' }));
    expect(screen.getByText('instagram')).toBeTruthy();
    expect(screen.getByText('Aparelho sem conta')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Instalações recentes' }));
    expect(screen.getByRole('link', { name: 'Beto' }).getAttribute('href')).toBe('/users/u2');
    fireEvent.click(screen.getByRole('button', { name: 'Pararam de abrir' }));
    expect(screen.getByRole('link', { name: 'Beto' })).toBeTruthy();
  });

  it('período personalizado consulta de novo', async () => {
    renderPanel();
    await screen.findByText('Instalações novas no período');
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '45' } });
    fireEvent.blur(screen.getByRole('spinbutton'));
    await screen.findByText('Instalações novas no período');
    expect(mockRpc).toHaveBeenCalledWith('admin_install_summary', { days_back: 45 });
  });

  it('segue sem os extras quando a migration nova não existe', async () => {
    const core = ['admin_install_summary', 'admin_install_daily', 'admin_install_by_os', 'admin_push_stale_recent'];
    mockRpc.mockImplementation(async name => (
      core.includes(name) ? { data: responses[name], error: null } : { data: null, error: new Error('function not found') }
    ));
    renderPanel();
    expect(await screen.findByText('Instalações novas no período')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retenção' })).toBeNull();
  });

  it('mostra o erro da consulta', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    renderPanel();
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });
});
