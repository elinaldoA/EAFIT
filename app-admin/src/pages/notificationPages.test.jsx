// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockFrom, mockInvoke, an, users, seg } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockInvoke: vi.fn(),
  an: { fetchRules: vi.fn(), saveRule: vi.fn(), fetchLog: vi.fn(), fetchPreview: vi.fn() },
  users: { fetchUsers: vi.fn() },
  seg: { fetchSegments: vi.fn(), resolveSegment: vi.fn() },
}));

vi.mock('../lib/supabase', () => ({ db: { from: mockFrom, functions: { invoke: mockInvoke } } }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));
vi.mock('../lib/autoNotifications', async orig => ({ ...(await orig()), ...an }));
vi.mock('../lib/users', () => users);
vi.mock('../lib/segments', () => seg);

import AutoNotifications from './AutoNotifications';
import Broadcast from './Broadcast';

// Query builder encadeável e "thenable": qualquer método devolve o próprio objeto.
function q(result) {
  const obj = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return (res, rej) => Promise.resolve(result).then(res, rej);
      return () => obj;
    },
  });
  return obj;
}

const wrap = (ui, url = '/') => render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AutoNotifications', () => {
  const rule = {
    kind: 'streak', label: 'Sequência em risco', description: 'Avisa quem vai perder a sequência.', enabled: true,
    send_hour: 9, cooldown_days: 3, weekdays: null, title: 'Oi {nome}', body: 'Faltam {faltam} dias', variables: '{nome}, {faltam}',
    per_user_hour: true, updated_at: 't1',
  };
  const logRows = [{ kind: 'streak', created_at: new Date().toISOString() }];
  const recent = [{ id: 1, user_id: 'u1', kind: 'streak', title: 'Oi Ana', created_at: '2026-03-01T12:00:00Z' }];

  beforeEach(() => {
    an.fetchRules.mockResolvedValue([rule]);
    an.fetchLog.mockResolvedValue({ rows: logRows, recent });
    an.saveRule.mockResolvedValue();
    an.fetchPreview.mockResolvedValue([]);
  });

  it('mostra regras, contagem de envios e últimos envios', async () => {
    wrap(<AutoNotifications />);
    expect(await screen.findByRole('heading', { name: /Sequência em risco/ })).toBeTruthy();
    expect(screen.getByText('1 enviadas em 7 dias')).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Oi Ana' })).toBeTruthy();
    expect(screen.getByText('ativa', { selector: '.badge' })).toBeTruthy();
    expect(screen.getByLabelText('Pré-visualização').textContent).toContain('Oi Ana');
  });

  it('mostra erro de carregamento', async () => {
    an.fetchRules.mockRejectedValue(new Error('rls'));
    wrap(<AutoNotifications />);
    expect(await screen.findByText('rls')).toBeTruthy();
  });

  it('mostra vazio quando não há envios', async () => {
    an.fetchLog.mockResolvedValue({ rows: [], recent: [] });
    wrap(<AutoNotifications />);
    expect(await screen.findByText('Nenhum envio automático registrado ainda.')).toBeTruthy();
  });

  it('só habilita Salvar após alterar e valida título/mensagem/intervalo', async () => {
    wrap(<AutoNotifications />);
    await screen.findByRole('heading', { name: /Sequência em risco/ });
    const save = screen.getByRole('button', { name: 'Salvar' });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: '' } });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Novo' } });
    expect(save.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText(/Intervalo mínimo/), { target: { value: '0' } });
    expect(save.disabled).toBe(true);
  });

  it('salva campos normalizados (números, textos aparados, dias ordenados)', async () => {
    wrap(<AutoNotifications />);
    await screen.findByRole('heading', { name: /Sequência em risco/ });
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: '  Novo  ' } });
    fireEvent.change(screen.getByLabelText(/Horário de envio/), { target: { value: '18' } });
    const days = screen.getByRole('group', { name: 'Dias da semana' });
    fireEvent.click(within(days).getByText('Qua'));
    fireEvent.click(within(days).getByText('Seg'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(an.saveRule).toHaveBeenCalledWith('streak', {
      enabled: true, send_hour: 18, weekdays: [1, 3], cooldown_days: 3, title: 'Novo', body: 'Faltam {faltam} dias',
    }));
    expect(await screen.findByText('Salvo.')).toBeTruthy();
  });

  it('desmarcar o último dia volta para "todos" (null)', async () => {
    wrap(<AutoNotifications />);
    await screen.findByRole('heading', { name: /Sequência em risco/ });
    const days = screen.getByRole('group', { name: 'Dias da semana' });
    fireEvent.click(within(days).getByText('Ter'));
    fireEvent.click(within(days).getByText('Ter'));
    // voltou ao estado salvo (null) => nada para salvar
    expect(screen.getByRole('button', { name: 'Salvar' }).disabled).toBe(true);
  });

  it('mostra erro ao salvar e Desfazer restaura', async () => {
    an.saveRule.mockRejectedValue(new Error('falhou'));
    wrap(<AutoNotifications />);
    await screen.findByRole('heading', { name: /Sequência em risco/ });
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Erro: falhou')).toBeTruthy();
    fireEvent.click(screen.getByText('Desfazer'));
    expect(screen.getByLabelText('Título').value).toBe('Oi {nome}');
  });

  it('prévia de destinatários lista a mensagem personalizada', async () => {
    an.fetchPreview.mockResolvedValue([{ user_id: 'u1', email: 'ana@x.com', nome: 'Ana', vars: { faltam: 2 } }]);
    wrap(<AutoNotifications />);
    await screen.findByRole('heading', { name: /Sequência em risco/ });
    fireEvent.click(screen.getByText('Ver quem receberia agora'));
    expect(await screen.findByText('ana@x.com')).toBeTruthy();
    expect(screen.getByText('Oi Ana — Faltam 2 dias')).toBeTruthy();
    expect(an.fetchPreview).toHaveBeenCalledWith('streak');
  });

  it('prévia vazia, pausada e com erro', async () => {
    an.fetchRules.mockResolvedValue([{ ...rule, enabled: false }]);
    wrap(<AutoNotifications />);
    await screen.findByRole('heading', { name: /Sequência em risco/ });
    fireEvent.click(screen.getByText('Ver quem receberia agora'));
    expect(await screen.findByText(/Ninguém se encaixa agora/)).toBeTruthy();
    expect(screen.getByText(/Esta regra está pausada/)).toBeTruthy();
    an.fetchPreview.mockRejectedValue(new Error('rpc'));
    fireEvent.click(screen.getByText('Ver quem receberia agora'));
    expect(await screen.findByText('Erro: rpc')).toBeTruthy();
  });
});

describe('Broadcast', () => {
  let tables;
  let inserts;

  beforeEach(() => {
    inserts = [];
    tables = {
      admin_audit_log: { data: [{ id: 1, created_at: '2026-03-01T12:00:00Z', details: { title: 'Antigo', body: 'msg', sent: 3, targetCount: 4 } }] },
      scheduled_broadcasts: { data: [{ id: 's1', title: 'Agendada', body: 'b', scheduled_at: '2030-01-01T12:00:00Z', target_user_ids: ['a', 'b'] }] },
      broadcast_templates: { data: [{ id: 't1', name: 'Boas-vindas', title: 'Oi!', body: 'Bem-vindo' }] },
    };
    mockFrom.mockImplementation(table => {
      const base = q(tables[table]);
      return new Proxy(base, {
        get(target, prop) {
          if (prop === 'insert') return payload => { inserts.push([table, payload]); return Promise.resolve({ error: null }); };
          return target[prop];
        },
      });
    });
    users.fetchUsers.mockResolvedValue([{ id: 'u1', email: 'a@x.com' }, { id: 'u2', email: 'b@x.com' }]);
    seg.fetchSegments.mockResolvedValue([]);
    seg.resolveSegment.mockResolvedValue(['u1', 'u2', 'u3']);
    mockInvoke.mockResolvedValue({ data: { sent: 5, targetCount: 6 }, error: null });
  });

  const fill = (title = 'Olá', body = 'Mundo') => {
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: title } });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: body } });
  };

  it('mostra agendadas e histórico', async () => {
    wrap(<Broadcast />);
    expect(await screen.findByText('Agendada')).toBeTruthy();
    expect(screen.getByText('2 selecionado(s)')).toBeTruthy();
    expect(screen.getByText('Antigo')).toBeTruthy();
    expect(screen.getByText('3 / 4')).toBeTruthy();
  });

  it('envia para todos e limpa o formulário', async () => {
    wrap(<Broadcast />);
    await screen.findByText('Antigo');
    fill();
    fireEvent.click(screen.getByText('Enviar notificação agora'));
    expect(await screen.findByText('Enviado: 5 de 6 dispositivo(s).')).toBeTruthy();
    expect(mockInvoke).toHaveBeenCalledWith('admin-broadcast', { body: { title: 'Olá', body: 'Mundo', targetUserIds: undefined } });
    expect(screen.getByLabelText('Título').value).toBe('');
  });

  it('não envia se o admin cancelar a confirmação', async () => {
    window.confirm.mockReturnValue(false);
    wrap(<Broadcast />);
    await screen.findByText('Antigo');
    fill();
    fireEvent.click(screen.getByText('Enviar notificação agora'));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('exige ao menos um usuário quando escolhe destinatários específicos', async () => {
    wrap(<Broadcast />);
    await screen.findByText('Antigo');
    fireEvent.click(screen.getByLabelText('Selecionar usuários'));
    fill();
    fireEvent.click(screen.getByText('Enviar notificação agora'));
    expect(await screen.findByText('Erro: selecione ao menos um usuário.')).toBeTruthy();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('envia só para os usuários marcados', async () => {
    wrap(<Broadcast />);
    await screen.findByText('Antigo');
    fireEvent.click(screen.getByLabelText('Selecionar usuários'));
    fireEvent.click(await screen.findByLabelText('b@x.com'));
    fill();
    fireEvent.click(screen.getByText('Enviar notificação agora'));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('admin-broadcast', { body: { title: 'Olá', body: 'Mundo', targetUserIds: ['u2'] } }));
  });

  it('mostra erro devolvido pela função', async () => {
    mockInvoke.mockResolvedValue({ data: { error: 'sem_push' }, error: null });
    wrap(<Broadcast />);
    await screen.findByText('Antigo');
    fill();
    fireEvent.click(screen.getByText('Enviar notificação agora'));
    expect(await screen.findByText('Erro: sem_push')).toBeTruthy();
  });

  it('recusa agendamento no passado', async () => {
    wrap(<Broadcast />);
    await screen.findByText('Antigo');
    fill();
    fireEvent.change(screen.getByLabelText(/Agendar para/), { target: { value: '2000-01-01T10:00' } });
    fireEvent.submit(screen.getByText('Agendar notificação').closest('form'));
    expect(await screen.findByText('Erro: o agendamento precisa ser num horário futuro.')).toBeTruthy();
  });

  it('agenda no futuro gravando em scheduled_broadcasts', async () => {
    wrap(<Broadcast />);
    await screen.findByText('Antigo');
    fill();
    fireEvent.change(screen.getByLabelText(/Agendar para/), { target: { value: '2099-01-01T10:00' } });
    fireEvent.click(screen.getByText('Agendar notificação'));
    expect(await screen.findByText('Notificação agendada.')).toBeTruthy();
    const [table, payload] = inserts[0];
    expect(table).toBe('scheduled_broadcasts');
    expect(payload).toMatchObject({ title: 'Olá', body: 'Mundo', target_user_ids: null, created_by: 'adm1' });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('teste "só para mim" mantém o formulário e avisa quando não há push', async () => {
    mockInvoke.mockResolvedValue({ data: { sent: 0, targetCount: 0 }, error: null });
    wrap(<Broadcast />);
    await screen.findByText('Antigo');
    fill();
    fireEvent.click(screen.getByText('Enviar só para mim (teste)'));
    expect(await screen.findByText(/você não tem push ativo/)).toBeTruthy();
    expect(mockInvoke).toHaveBeenCalledWith('admin-broadcast', { body: { title: 'Olá', body: 'Mundo', targetUserIds: ['adm1'] } });
    expect(screen.getByLabelText('Título').value).toBe('Olá');
  });

  it('teste exige título e mensagem', async () => {
    wrap(<Broadcast />);
    await screen.findByText('Antigo');
    fireEvent.click(screen.getByText('Enviar só para mim (teste)'));
    expect(await screen.findByText('Erro: preencha título e mensagem.')).toBeTruthy();
  });

  it('aplica um modelo ao formulário', async () => {
    wrap(<Broadcast />);
    await screen.findByText('Antigo');
    fireEvent.change(await screen.findByDisplayValue('Escolha um modelo…'), { target: { value: 't1' } });
    expect(screen.getByLabelText('Título').value).toBe('Oi!');
    expect(screen.getByLabelText('Mensagem').value).toBe('Bem-vindo');
  });

  it('salva um novo modelo pedindo o nome', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('  Meu modelo ');
    wrap(<Broadcast />);
    await screen.findByText('Antigo');
    fill();
    fireEvent.click(screen.getByText('Salvar como modelo'));
    expect(await screen.findByText('Modelo salvo.')).toBeTruthy();
    expect(inserts[0]).toEqual(['broadcast_templates', { name: 'Meu modelo', title: 'Olá', body: 'Mundo', created_by: 'adm1' }]);
  });

  it('salvar modelo sem texto mostra erro', async () => {
    wrap(<Broadcast />);
    await screen.findByText('Antigo');
    fireEvent.click(screen.getByText('Salvar como modelo'));
    expect(await screen.findByText('Erro: preencha título e mensagem para salvar o modelo.')).toBeTruthy();
  });

  it('esconde a seção de modelos se a tabela não existe', async () => {
    tables.broadcast_templates = { data: null, error: { message: 'relation does not exist' } };
    wrap(<Broadcast />);
    await screen.findByText('Antigo');
    expect(screen.queryByText('Modelo de mensagem')).toBeNull();
  });

  it('cancela notificação agendada após confirmar', async () => {
    wrap(<Broadcast />);
    await screen.findByText('Agendada');
    fireEvent.click(screen.getByText('Cancelar'));
    expect(window.confirm).toHaveBeenCalledWith('Cancelar esta notificação agendada?');
    await waitFor(() => expect(mockFrom.mock.calls.filter(c => c[0] === 'scheduled_broadcasts').length).toBeGreaterThan(2));
  });

  it('segmento vindo da URL é resolvido e usado como destinatários', async () => {
    seg.fetchSegments.mockResolvedValue([{ id: 'sg1', name: 'Iniciantes' }]);
    wrap(<Broadcast />, '/?segment=sg1');
    expect(await screen.findByText(/3 usuário\(s\) no segmento hoje/)).toBeTruthy();
    fill();
    fireEvent.click(screen.getByText('Enviar notificação agora'));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('admin-broadcast', { body: { title: 'Olá', body: 'Mundo', targetUserIds: ['u1', 'u2', 'u3'] } }));
  });

  it('segmento sem escolha não envia', async () => {
    seg.fetchSegments.mockResolvedValue([{ id: 'sg1', name: 'Iniciantes' }]);
    wrap(<Broadcast />);
    await screen.findByText('Antigo');
    fireEvent.click(await screen.findByLabelText('Segmento salvo'));
    fill();
    fireEvent.click(screen.getByText('Enviar notificação agora'));
    expect(await screen.findByText('Erro: o segmento está vazio ou não foi escolhido.')).toBeTruthy();
  });
});
