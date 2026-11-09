// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({ db: {} }));

import ChatThread from './ChatThread';

const MSGS = [
  { id: 1, from: 'trainer', body: 'Bom treino!', at: '2026-10-05T12:30:00Z', kind: 'recado' },
  { id: 2, from: 'client', body: 'Obrigada!', at: '2026-10-05T13:00:00Z', kind: 'recado' },
  { id: 3, from: 'trainer', body: 'Novo plano', at: '2026-10-06T09:00:00Z', kind: 'treino' },
];

let load; let send;
beforeEach(() => {
  load = vi.fn().mockResolvedValue(MSGS);
  send = vi.fn().mockResolvedValue(undefined);
});
afterEach(cleanup);

const box = () => screen.getByLabelText('Resposta');
const future = () => {
  const d = new Date(Date.now() + 26 * 3600000);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

describe('ChatThread (como já era)', () => {
  it('mostra as mensagens, marca o 📋 do treino e chama onLoaded', async () => {
    const onLoaded = vi.fn();
    render(<ChatThread me="client" load={load} send={send} onLoaded={onLoaded} />);
    expect(await screen.findByText('Bom treino!')).toBeTruthy();
    expect(screen.getByText('📋 Novo plano')).toBeTruthy();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(MSGS));
  });

  it('sem mensagens mostra o aviso', async () => {
    load.mockResolvedValue([]);
    render(<ChatThread me="client" load={load} send={send} />);
    expect(await screen.findByText('Nenhuma mensagem ainda.')).toBeTruthy();
  });

  it('envia o texto sem espaços, limpa a caixa e recarrega', async () => {
    render(<ChatThread me="client" load={load} send={send} sendLabel="Responder" />);
    await screen.findByText('Bom treino!');
    fireEvent.change(box(), { target: { value: '  Valeu!  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('Valeu!'));
    await waitFor(() => expect(box().value).toBe(''));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('erro ao enviar mostra a mensagem do onError e mantém o texto', async () => {
    send.mockRejectedValue(new Error('x'));
    render(<ChatThread me="client" load={load} send={send} onError={() => 'Falhou feio'} />);
    await screen.findByText('Bom treino!');
    fireEvent.change(box(), { target: { value: 'Oi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Falhou feio');
    expect(box().value).toBe('Oi');
  });

  it('o lado do aluno não ganha respostas prontas nem agendamento', async () => {
    render(<ChatThread me="client" load={load} send={send} />);
    await screen.findByText('Bom treino!');
    expect(screen.queryByRole('button', { name: /Agendar/ })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Respostas prontas' })).toBeNull();
  });

  it('falha ao carregar não quebra a tela', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    load.mockRejectedValue(new Error('x'));
    render(<ChatThread me="client" load={load} send={send} />);
    expect(await screen.findByText('Nenhuma mensagem ainda.')).toBeTruthy();
  });
});

describe('ChatThread do personal (tools e schedule)', () => {
  const tools = ({ setText }) => <button type="button" onClick={() => setText('Texto pronto')}>ferramenta</button>;

  it('tools recebe text/setText e altera a caixa', async () => {
    render(<ChatThread me="trainer" load={load} send={send} tools={tools} />);
    await screen.findByText('Bom treino!');
    fireEvent.click(screen.getByRole('button', { name: 'ferramenta' }));
    expect(box().value).toBe('Texto pronto');
  });

  it('com schedule: abre o campo, troca o botão e só habilita com horário', async () => {
    const schedule = { send: vi.fn().mockResolvedValue(undefined), onDone: vi.fn() };
    render(<ChatThread me="trainer" load={load} send={send} schedule={schedule} sendLabel="Enviar recado" />);
    await screen.findByText('Bom treino!');
    fireEvent.change(box(), { target: { value: 'Oi' } });
    fireEvent.click(screen.getByRole('button', { name: '🕒 Agendar para depois' }));
    const go = () => screen.getByRole('button', { name: 'Agendar recado' });
    expect(go().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Enviar em'), { target: { value: future() } });
    expect(go().disabled).toBe(false);
  });

  it('agenda sem enviar agora, avisa e limpa', async () => {
    const schedule = { send: vi.fn().mockResolvedValue(undefined), onDone: vi.fn() };
    render(<ChatThread me="trainer" load={load} send={send} schedule={schedule} />);
    await screen.findByText('Bom treino!');
    const when = future();
    fireEvent.change(box(), { target: { value: ' Bom treino amanhã ' } });
    fireEvent.click(screen.getByRole('button', { name: '🕒 Agendar para depois' }));
    fireEvent.change(screen.getByLabelText('Enviar em'), { target: { value: when } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar recado' }));
    await waitFor(() => expect(schedule.send).toHaveBeenCalledWith('Bom treino amanhã', new Date(when).toISOString()));
    expect(send).not.toHaveBeenCalled();
    await waitFor(() => expect(schedule.onDone).toHaveBeenCalledWith(new Date(when).toISOString()));
    expect(box().value).toBe('');
    expect(screen.queryByLabelText('Enviar em')).toBeNull();
  });

  it('horário no passado não chega ao banco', async () => {
    const schedule = { send: vi.fn(), onDone: vi.fn() };
    render(<ChatThread me="trainer" load={load} send={send} schedule={schedule} />);
    await screen.findByText('Bom treino!');
    fireEvent.change(box(), { target: { value: 'Oi' } });
    fireEvent.click(screen.getByRole('button', { name: '🕒 Agendar para depois' }));
    fireEvent.change(screen.getByLabelText('Enviar em'), { target: { value: '2020-01-01T08:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar recado' }));
    expect(screen.getByRole('alert').textContent).toContain('Escolha um horário');
    expect(schedule.send).not.toHaveBeenCalled();
  });

  it('erro do banco ao agendar mostra o motivo e mantém o texto', async () => {
    const schedule = { send: vi.fn().mockRejectedValue(new Error('too_many')), onDone: vi.fn() };
    render(<ChatThread me="trainer" load={load} send={send} schedule={schedule} />);
    await screen.findByText('Bom treino!');
    fireEvent.change(box(), { target: { value: 'Oi' } });
    fireEvent.click(screen.getByRole('button', { name: '🕒 Agendar para depois' }));
    fireEvent.change(screen.getByLabelText('Enviar em'), { target: { value: future() } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar recado' }));
    expect((await screen.findByRole('alert')).textContent).toContain('20 recados agendados');
    expect(box().value).toBe('Oi');
    expect(schedule.onDone).not.toHaveBeenCalled();
  });

  it('voltar para "Enviar agora" envia pelo caminho normal', async () => {
    const schedule = { send: vi.fn(), onDone: vi.fn() };
    render(<ChatThread me="trainer" load={load} send={send} schedule={schedule} sendLabel="Enviar recado" />);
    await screen.findByText('Bom treino!');
    fireEvent.click(screen.getByRole('button', { name: '🕒 Agendar para depois' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar agora' }));
    fireEvent.change(box(), { target: { value: 'Oi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar recado' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('Oi'));
    expect(schedule.send).not.toHaveBeenCalled();
  });
});
