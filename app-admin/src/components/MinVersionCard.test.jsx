// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const { mockRpc, mockFrom, upsert } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockFrom: vi.fn(), upsert: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc, from: mockFrom } }));

import MinVersionCard, { versionShare } from './MinVersionCard';
import { compareVersions, normalizeSettings } from '../lib/appSettings';

const ROWS = [
  { dimension: 'app_version', value: '0.3.4', users: 6 },
  { dimension: 'app_version', value: '0.3.10', users: 3 },
  { dimension: 'app_version', value: '0.2.9', users: 1 },
  { dimension: 'os', value: 'android', users: 10 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  mockRpc.mockResolvedValue({ data: ROWS, error: null });
  upsert.mockResolvedValue({ error: null });
  mockFrom.mockReturnValue({ upsert, insert: vi.fn().mockResolvedValue({ error: null }) });
});
afterEach(cleanup);

describe('versão mínima', () => {
  it('ordena as versões e conta quem fica abaixo', () => {
    expect(compareVersions('0.3.10', '0.3.4')).toBe(1);
    const s = versionShare(ROWS, '0.3.4');
    expect(s.list.map(r => r.version)).toEqual(['0.3.10', '0.3.4', '0.2.9']);
    expect(s).toMatchObject({ total: 10, below: 1, latest: '0.3.10' });
    expect(normalizeSettings([{ key: 'min_version', value: { version: 'x', mode: 'block' } }]).minVersion).toEqual({ version: '', mode: 'block', message: '' });
  });

  it('mostra a distribuição, simula o corte e salva bloqueando com confirmação', async () => {
    const onSaved = vi.fn();
    render(<MinVersionCard saved={{ version: '', mode: 'warn', message: '' }} adminId="adm1" onSaved={onSaved} />);
    expect((await screen.findAllByText('0.3.10')).length).toBe(2);
    fireEvent.change(screen.getByLabelText('Versão mínima (ex.: 0.3.4)'), { target: { value: '0.3.4' } });
    expect(screen.getByText('0.2.9 ⚠️')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Abaixo dela'), { target: { value: 'block' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('(1 pessoa(s)'));
    await waitFor(() => expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ key: 'min_version', value: { version: '0.3.4', mode: 'block', message: '' } })));
    expect(onSaved).toHaveBeenCalled();
  });

  it('formato inválido bloqueia o salvar', async () => {
    render(<MinVersionCard saved={{ version: '', mode: 'warn', message: '' }} adminId="adm1" onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Versão mínima (ex.: 0.3.4)'), { target: { value: 'v1.2' } });
    expect(screen.getByText(/Use o formato/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salvar' }).disabled).toBe(true);
  });
});
