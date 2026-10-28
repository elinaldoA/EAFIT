// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
vi.mock('../lib/supabase', () => ({ db: {} }));
import RequireArea from './RequireArea';
import { AdminAccessContext } from '../context/useAdminAccess';

function renderWith(access) {
  return render(
    <AdminAccessContext.Provider value={{ extraAreas: [], hiddenScreens: [], loaded: true, ...access }}>
      <RequireArea area="settings"><button>Salvar</button></RequireArea>
    </AdminAccessContext.Provider>
  );
}

import { afterEach } from 'vitest';
afterEach(cleanup);

describe('RequireArea', () => {
  it('sem papel carregado, libera', () => {
    renderWith({ role: null });
    expect(screen.getByText('Salvar').disabled).toBe(false);
  });

  it('papel com a área, libera', () => {
    renderWith({ role: 'conteudo' });
    expect(screen.getByText('Salvar').disabled).toBe(false);
  });

  it('papel sem a área, mostra aviso e desabilita', () => {
    renderWith({ role: 'leitura' });
    expect(screen.getByRole('note').textContent).toMatch(/Somente leitura/);
    expect(screen.getByText('Salvar').closest('fieldset').disabled).toBe(true);
  });

  it('área extra concedida libera', () => {
    renderWith({ role: 'leitura', extraAreas: ['settings'] });
    expect(screen.queryByRole('note')).toBeNull();
  });
});
