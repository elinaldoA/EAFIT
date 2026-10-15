// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText('Android')).toBeTruthy();
    expect(screen.getByText('15/10/2026')).toBeTruthy();
    expect(screen.queryByText('14/10/2026')).toBeNull();
    const link = screen.getByRole('link', { name: 'Ana' });
    expect(link.getAttribute('href')).toBe('/users/u1');
    expect(screen.getByText('iPhone/iPad')).toBeTruthy();
  });

  it('mostra o erro da consulta', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    renderPanel();
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });
});
