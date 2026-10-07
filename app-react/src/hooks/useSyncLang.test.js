// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const updateUser = vi.fn(() => Promise.resolve({}));
vi.mock('../lib/supabase', () => ({ db: { auth: { updateUser: (...a) => updateUser(...a) } } }));

import { useSyncLang } from './useSyncLang';

describe('useSyncLang', () => {
  beforeEach(() => updateUser.mockClear());

  it('grava o idioma quando o usuário ainda não tem', () => {
    renderHook(() => useSyncLang({ id: 'u1', user_metadata: {} }));
    expect(updateUser).toHaveBeenCalledWith({ data: { lang: 'pt' } });
  });

  it('não grava de novo quando já está igual', () => {
    renderHook(() => useSyncLang({ id: 'u1', user_metadata: { lang: 'pt' } }));
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('sem usuário não faz nada', () => {
    renderHook(() => useSyncLang(null));
    expect(updateUser).not.toHaveBeenCalled();
  });
});
