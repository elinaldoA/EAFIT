// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const { lib } = vi.hoisted(() => ({ lib: { saveAccess: vi.fn(), setRole: vi.fn() } }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/adminAccess', async orig => ({ ...(await orig()), ...lib }));

import AdminAccessEditor from './AdminAccessEditor';
import { NAV_GROUPS } from './Layout/nav';
import { SCREENS, effectiveAreas, isHidden, visibleNav } from '../lib/adminAccess';

const ADMIN = { id: 'u1', email: 'ana@x.com', role: 'suporte', extraAreas: [], hiddenScreens: ['/lgpd'] };

beforeEach(() => { vi.clearAllMocks(); lib.saveAccess.mockResolvedValue(); lib.setRole.mockResolvedValue(); });
afterEach(cleanup);

describe('adminAccess', () => {
  it('esconde telas, seções vazias e detalhes da tela oculta', () => {
    expect(isHidden(['/users'], '/users/123')).toBe(true);
    expect(isHidden(['/users'], '/usersx')).toBe(false);
    expect(isHidden([], '/users')).toBe(false);
    const dash = NAV_GROUPS[0].sections[0];
    expect(visibleNav(NAV_GROUPS, [])).toBe(NAV_GROUPS);
    const nav = visibleNav(NAV_GROUPS, ['/desafios', '/ligas', '/amigos', '/moderacao']);
    const sections = nav.flatMap(g => g.sections.map(s => s.key));
    expect(sections).not.toContain('comunidade');
    expect(sections).toContain(dash.key);
    expect(SCREENS.flatMap(s => s.tabs.map(t => t.to))).not.toContain('/admins');
    expect(effectiveAreas('suporte', ['content', 'users']).sort()).toEqual(['content', 'notifications', 'segments', 'users']);
  });
});

describe('AdminAccessEditor', () => {
  it('superadmin troca o papel, dá área extra e oculta tela', async () => {
    const onSaved = vi.fn();
    render(<AdminAccessEditor admin={ADMIN} adminId="adm1" canEdit onSaved={onSaved} />);
    const users = screen.getByLabelText(/Pode alterar: Usuários/);
    expect(users.checked).toBe(true);
    expect(users.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Pode alterar: Configurações do app'));
    fireEvent.click(screen.getByLabelText('Ocultar Pessoas / Comissões'));
    fireEvent.change(screen.getByLabelText('Papel de ana@x.com'), { target: { value: 'conteudo' } });
    fireEvent.click(screen.getByText('Salvar permissões'));
    await waitFor(() => expect(lib.saveAccess).toHaveBeenCalled());
    expect(lib.setRole).toHaveBeenCalledWith('u1', 'conteudo', 'adm1');
    // 'settings' já vem do papel conteúdo: não fica como extra.
    expect(lib.saveAccess).toHaveBeenCalledWith('u1', { extraAreas: [], hiddenScreens: ['/lgpd', '/comissoes'] }, 'adm1');
    expect(onSaved).toHaveBeenCalled();
  });

  it('quem não é superadmin só vê', () => {
    render(<AdminAccessEditor admin={ADMIN} adminId="adm1" canEdit={false} onSaved={() => {}} />);
    expect(screen.queryByText('Salvar permissões')).toBeNull();
    expect(screen.getByLabelText('Papel de ana@x.com').disabled).toBe(true);
  });
});
