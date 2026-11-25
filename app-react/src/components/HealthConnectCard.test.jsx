// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  native: true, state: vi.fn(), connect: vi.fn(), summary: vi.fn(), settings: vi.fn(),
}));
vi.mock('../lib/native', () => ({ isNative: () => h.native }));
vi.mock('../lib/nativeHealth', () => ({
  getHealthState: h.state, connectHealth: h.connect, readHealthSummary: h.summary, openHealthSettings: h.settings,
}));

import HealthConnectCard from './HealthConnectCard';

beforeEach(() => {
  h.native = true;
  h.state.mockReset().mockResolvedValue('off');
  h.connect.mockReset().mockResolvedValue('on');
  h.summary.mockReset().mockResolvedValue({
    todaySteps: 5230, heartRate: { avg: 72, min: 50, max: 140 }, weight: { kg: 78.5, date: '2026-11-20' },
    days: [{ date: '2026-11-24T00:00:00', steps: 3000 }, { date: '2026-11-25T00:00:00', steps: 5230 }],
  });
});
afterEach(cleanup);

describe('HealthConnectCard', () => {
  it('fora do app não renderiza nada', () => {
    h.native = false;
    const { container } = render(<HealthConnectCard />);
    expect(container.firstChild).toBeNull();
  });

  it('sem permissão: oferece conectar e, ao conectar, mostra os dados', async () => {
    render(<HealthConnectCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Conectar Health Connect' }));
    expect(await screen.findByText('Passos hoje')).toBeTruthy();
    expect(await screen.findByText('72')).toBeTruthy();
    expect(screen.getByText('78,5kg')).toBeTruthy();
    expect(h.connect).toHaveBeenCalledTimes(1);
  });

  it('já conectado: carrega os dados direto', async () => {
    h.state.mockResolvedValue('on');
    render(<HealthConnectCard />);
    await waitFor(() => expect(h.summary).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'Gerenciar permissões' }));
    expect(h.settings).toHaveBeenCalled();
  });

  it('Health Connect indisponível: avisa e não oferece conectar', async () => {
    h.state.mockResolvedValue('unavailable');
    render(<HealthConnectCard />);
    expect(await screen.findByText(/não está disponível/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Conectar Health Connect' })).toBeNull();
  });
});
