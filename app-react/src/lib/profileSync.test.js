// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUpdateUser } = vi.hoisted(() => ({ mockUpdateUser: vi.fn() }));
vi.mock('./supabase', () => ({ db: { auth: { updateUser: mockUpdateUser } } }));

import { localOnlyProfileFields, syncLocalProfile } from './profileSync';

beforeEach(() => {
  localStorage.clear();
  mockUpdateUser.mockReset();
});

function device(owner, values) {
  localStorage.setItem('eafit_data_owner', owner);
  Object.entries(values).forEach(([k, v]) => localStorage.setItem(`profile_${k}`, v));
}

describe('localOnlyProfileFields', () => {
  it('pega só o que falta na conta, sem sobrescrever', () => {
    device('u1', { nome: 'Ana', sobrenome: 'Souza', apelido: 'Aninha', peso: '62', weeklyGoal: '4' });
    expect(localOnlyProfileFields('u1', { peso: 60, sobrenome: '' })).toEqual({
      nome: 'Ana', sobrenome: 'Souza', apelido: 'Aninha', weeklyGoal: '4',
    });
  });

  it('ignora o cache de outra conta ou sem dono', () => {
    device('outra', { nome: 'Ana' });
    expect(localOnlyProfileFields('u1', {})).toBeNull();
    localStorage.removeItem('eafit_data_owner');
    expect(localOnlyProfileFields('u1', {})).toBeNull();
  });

  it('nada a enviar quando a conta já está completa ou o cache está vazio', () => {
    device('u1', { nome: 'Ana', apelido: '  ' });
    expect(localOnlyProfileFields('u1', { nome: 'Ana Maria' })).toBeNull();
  });
});

describe('syncLocalProfile', () => {
  it('envia os campos e devolve o usuário atualizado', async () => {
    device('u1', { nome: 'Ana' });
    mockUpdateUser.mockResolvedValue({ data: { user: { id: 'u1', user_metadata: { nome: 'Ana' } } }, error: null });
    const updated = await syncLocalProfile({ id: 'u1', user_metadata: {} });
    expect(mockUpdateUser).toHaveBeenCalledWith({ data: { nome: 'Ana' } });
    expect(updated.user_metadata.nome).toBe('Ana');
  });

  it('sem nada a enviar não chama a rede; falha devolve null', async () => {
    expect(await syncLocalProfile({ id: 'u1', user_metadata: {} })).toBeNull();
    expect(mockUpdateUser).not.toHaveBeenCalled();
    device('u1', { nome: 'Ana' });
    mockUpdateUser.mockResolvedValue({ data: null, error: new Error('offline') });
    expect(await syncLocalProfile({ id: 'u1', user_metadata: {} })).toBeNull();
    mockUpdateUser.mockRejectedValue(new Error('rede'));
    expect(await syncLocalProfile({ id: 'u1', user_metadata: {} })).toBeNull();
  });
});
