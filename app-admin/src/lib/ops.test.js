import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc, mockFrom } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockFrom: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc, from: mockFrom } }));

import {
  fetchAdmins, removeAdmin, fetchAccountDeletions, summarizeDeletions, formatAge,
  validateLegalVersion, friendlyLegalError, currentVersions, legalUrl,
  fetchLegalVersions, publishLegalVersion, fetchTermsAcceptance, mapStorage,
} from './ops';
import { confirmRate, fetchTrainerActivity, fetchUpcomingAppointments } from './trainers';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('administradores', () => {
  it('fetchAdmins mapeia as colunas ad_*', async () => {
    mockRpc.mockResolvedValue({ data: [{ ad_user: 'a1', ad_email: 'adm@x.com', ad_name: 'Adm', ad_created: 't1', ad_last_sign_in: null }], error: null });
    expect(await fetchAdmins()).toEqual([{ id: 'a1', email: 'adm@x.com', name: 'Adm', createdAt: 't1', lastSignIn: null }]);
  });

  it('removeAdmin tira is_admin e registra na auditoria', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation(table => (table === 'profiles' ? { update } : { insert }));
    await removeAdmin('u2', 'adm1');
    expect(update).toHaveBeenCalledWith({ is_admin: false });
    expect(eq).toHaveBeenCalledWith('id', 'u2');
    expect(insert).toHaveBeenCalledWith({ admin_id: 'adm1', target_user_id: 'u2', action: 'demoteAdmin', details: null });
  });

  it('removeAdmin falha se o update falhar e não registra auditoria', async () => {
    const insert = vi.fn();
    mockFrom.mockImplementation(table => (table === 'profiles'
      ? { update: () => ({ eq: () => Promise.resolve({ error: new Error('not_authorized') }) }) }
      : { insert }));
    await expect(removeAdmin('u2', 'adm1')).rejects.toThrow('not_authorized');
    expect(insert).not.toHaveBeenCalled();
  });

  it('falha só na auditoria não desfaz a remoção', async () => {
    mockFrom.mockImplementation(table => (table === 'profiles'
      ? { update: () => ({ eq: () => Promise.resolve({ error: null }) }) }
      : { insert: () => Promise.resolve({ error: new Error('rls') }) }));
    await expect(removeAdmin('u2', 'adm1')).resolves.toBeUndefined();
  });
});

describe('exclusões de conta', () => {
  it('fetchAccountDeletions pagina pelo range', async () => {
    const range = vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null, count: 73 });
    mockFrom.mockReturnValue({ select: () => ({ order: () => ({ range }) }) });
    expect(await fetchAccountDeletions({ page: 1 })).toEqual({ rows: [{ id: 1 }], total: 73 });
    expect(range).toHaveBeenCalledWith(50, 99);
  });

  it('summarizeDeletions conta origem, quem nunca treinou e a mediana da idade', () => {
    const rows = [
      { source: 'self', account_age_days: 2, workouts: 0 },
      { source: 'self', account_age_days: 100, workouts: 12 },
      { source: 'admin', account_age_days: 10, workouts: 0 },
      { source: 'self', account_age_days: null, workouts: null },
    ];
    expect(summarizeDeletions(rows)).toEqual({ total: 4, self: 3, neverTrained: 2, medianAgeDays: 10 });
    expect(summarizeDeletions([{ source: 'self', account_age_days: 4, workouts: 1 }, { source: 'self', account_age_days: 9, workouts: 1 }]).medianAgeDays).toBe(7);
    expect(summarizeDeletions([])).toEqual({ total: 0, self: 0, neverTrained: 0, medianAgeDays: null });
  });

  it('formatAge', () => {
    expect(formatAge(null)).toBe('—');
    expect(formatAge(0)).toBe('no mesmo dia');
    expect(formatAge(45)).toBe('45 dia(s)');
    expect(formatAge(90)).toBe('3 meses');
    expect(formatAge(800)).toBe('2 anos');
  });
});

describe('documentos legais', () => {
  it('validateLegalVersion', () => {
    const ok = { version: '2026-10', effectiveDate: '2026-10-08', summary: '' };
    expect(validateLegalVersion(ok)).toBe('');
    expect(validateLegalVersion({ ...ok, version: '  ' })).toMatch(/nome para a versão/);
    expect(validateLegalVersion({ ...ok, version: 'x'.repeat(31) })).toMatch(/nome para a versão/);
    expect(validateLegalVersion({ ...ok, effectiveDate: '' })).toMatch(/data de entrada em vigor/);
    expect(validateLegalVersion({ ...ok, summary: 'x'.repeat(501) })).toMatch(/500/);
  });

  it('friendlyLegalError', () => {
    expect(friendlyLegalError(new Error('version_exists'))).toMatch(/Já existe/);
    expect(friendlyLegalError(new Error('qualquer'))).toBe('qualquer');
  });

  it('currentVersions escolhe a data mais recente e, no empate, a registrada por último', () => {
    const versions = [
      { id: 1, doc: 'termos', effective_date: '2026-01-01', created_at: 'a' },
      { id: 2, doc: 'termos', effective_date: '2026-06-01', created_at: 'b' },
      { id: 3, doc: 'termos', effective_date: '2026-06-01', created_at: 'c' },
      { id: 4, doc: 'outro', effective_date: '2027-01-01', created_at: 'd' },
    ];
    const cur = currentVersions(versions);
    expect(cur.termos.id).toBe(3);
    expect(cur.privacidade).toBeNull();
    expect(Object.keys(cur)).toEqual(['termos', 'privacidade']);
  });

  it('legalUrl aponta para /legal do app, uma pasta acima do painel', () => {
    expect(legalUrl('termos.html', '/EAFIT/admin/')).toBe('/EAFIT/legal/termos.html');
    expect(legalUrl('termos.html', '/')).toBe('/legal/termos.html');
  });

  it('publishLegalVersion apara os textos', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await publishLegalVersion({ doc: 'termos', version: ' 2026-10 ', effectiveDate: '2026-10-08', summary: ' mudou x ' });
    expect(mockRpc).toHaveBeenCalledWith('admin_publish_legal_version', {
      p_doc: 'termos', p_version: '2026-10', p_effective: '2026-10-08', p_summary: 'mudou x',
    });
    mockRpc.mockResolvedValue({ error: new Error('version_exists') });
    await expect(publishLegalVersion({ doc: 'termos', version: 'v', effectiveDate: 'd' })).rejects.toThrow('version_exists');
  });

  it('fetchLegalVersions e fetchTermsAcceptance', async () => {
    const order2 = vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null });
    mockFrom.mockReturnValue({ select: () => ({ order: () => ({ order: order2 }) }) });
    expect(await fetchLegalVersions()).toEqual([{ id: 1 }]);

    mockRpc.mockResolvedValue({ data: [{ ta_users: '10', ta_accepted: '8', ta_before: '3', ta_never: '2' }], error: null });
    expect(await fetchTermsAcceptance('2026-06-01')).toEqual({ users: 10, accepted: 8, before: 3, never: 2 });
    expect(mockRpc).toHaveBeenLastCalledWith('admin_terms_acceptance', { p_since: '2026-06-01' });
  });
});

describe('storage', () => {
  it('mapStorage converte e tolera ausência de dados', () => {
    expect(mapStorage([{ su_bucket: 'progress-photos', su_public: false, su_objects: '12', su_bytes: '2048' }]))
      .toEqual([{ bucket: 'progress-photos', isPublic: false, objects: 12, bytes: 2048 }]);
    expect(mapStorage(undefined)).toEqual([]);
  });
});

describe('personais', () => {
  it('confirmRate ignora as aulas canceladas pelo personal', () => {
    expect(confirmRate({ appts: 10, cancelled: 2, confirmed: 6 })).toBe(75);
    expect(confirmRate({ appts: 2, cancelled: 2, confirmed: 0 })).toBeNull();
    expect(confirmRate(undefined)).toBeNull();
  });

  it('fetchTrainerActivity indexa por personal', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { ta_user: 't1', ta_appts: '4', ta_confirmed: '3', ta_declined: '1', ta_cancelled: '0', ta_pending: '0', ta_upcoming: '2', ta_messages: '9', ta_read: '7', ta_last_message: 'x' },
        { tc_user: 'linha de outra consulta' },
      ],
      error: null,
    });
    expect(await fetchTrainerActivity(30)).toEqual({
      t1: { appts: 4, confirmed: 3, declined: 1, cancelled: 0, pending: 0, upcoming: 2, messages: 9, read: 7, lastMessage: 'x' },
    });
  });

  it('fetchUpcomingAppointments mapeia as colunas ua_*', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ua_id: 'a1', ua_trainer: 't1', ua_trainer_name: 'Carlos', ua_client: 'u1', ua_client_name: 'Ana', ua_starts: 's', ua_duration: 60, ua_status: 'pending' }],
      error: null,
    });
    expect(await fetchUpcomingAppointments()).toEqual([{
      id: 'a1', trainerId: 't1', trainerName: 'Carlos', clientId: 'u1', clientName: 'Ana', starts: 's', duration: 60, status: 'pending',
    }]);
    expect(mockRpc).toHaveBeenCalledWith('admin_upcoming_appointments', { max_rows: 30 });
  });
});
