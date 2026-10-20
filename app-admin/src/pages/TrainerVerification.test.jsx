// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { lib } = vi.hoisted(() => ({
  lib: { fetchRequests: vi.fn(), decideRequest: vi.fn(), fetchTrainerCrefs: vi.fn(), setTrainerCref: vi.fn() },
}));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/trainerVerification', async orig => ({ ...(await orig()), ...lib }));

import TrainerVerification from './TrainerVerification';
import { friendlyVerificationError, mapRequest, splitCref } from '../lib/trainerVerification';

const req = mapRequest({
  tr_id: 'r1', tr_user: 'u1', tr_email: 'ana@x.com', tr_name: 'Ana Souza', tr_cref: '012345-G/SP', tr_note: 'Academia X',
  tr_status: 'pendente', tr_reason: '', tr_created: '2026-10-19T12:00:00Z', tr_account_created: '2026-01-01T00:00:00Z', tr_previous: 1,
});

beforeEach(() => {
  vi.clearAllMocks();
  lib.fetchRequests.mockResolvedValue([req]);
  lib.fetchTrainerCrefs.mockResolvedValue([{ userId: 'u9', email: 'velho@x.com', code: 'PABC12', cref: null, verifiedAt: null, since: '2026-05-01T00:00:00Z' }]);
  lib.decideRequest.mockResolvedValue();
  lib.setTrainerCref.mockResolvedValue('000999-P/RJ');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('trainerVerification', () => {
  it('separa o CREF e traduz os erros', () => {
    expect(splitCref('012345-G/SP')).toEqual({ number: '012345', category: 'G', uf: 'SP' });
    expect(splitCref('x')).toBeNull();
    expect(friendlyVerificationError(new Error('reason_required'))).toMatch(/motivo/);
    expect(req).toMatchObject({ previous: 1, note: 'Academia X' });
  });
});

describe('TrainerVerification', () => {
  it('aprova, recusa com motivo e registra CREF de personal antigo', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryRouter><TrainerVerification /></MemoryRouter>);
    expect(await screen.findByText('Ana Souza')).toBeTruthy();
    expect(screen.getByText(/graduado · SP/)).toBeTruthy();
    expect(screen.getByText(/1 sem CREF verificado/)).toBeTruthy();

    fireEvent.click(screen.getByText('Aprovar'));
    await waitFor(() => expect(lib.decideRequest).toHaveBeenCalledWith('r1', true, ''));
    await waitFor(() => expect(lib.fetchRequests).toHaveBeenCalledTimes(2));

    fireEvent.click(await screen.findByText('Recusar'));
    fireEvent.change(screen.getByLabelText('Motivo da recusa'), { target: { value: 'Nome diferente.' } });
    fireEvent.click(screen.getByText('Enviar recusa'));
    await waitFor(() => expect(lib.decideRequest).toHaveBeenCalledWith('r1', false, 'Nome diferente.'));

    fireEvent.click(screen.getByLabelText('CREF de velho@x.com'));
    fireEvent.change(screen.getByLabelText('CREF'), { target: { value: '999 p rj' } });
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(lib.setTrainerCref).toHaveBeenCalledWith('u9', '999 p rj'));

    fireEvent.click(screen.getByText('Recusados'));
    await waitFor(() => expect(lib.fetchRequests).toHaveBeenLastCalledWith('recusado'));
  });
});
