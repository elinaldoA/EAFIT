// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), setTags: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/trainerRoster', async (importActual) => ({
  ...(await importActual()),
  setClientTags: (...a) => h.setTags(...a),
}));

import ClientTags from './ClientTags';
import { MAX_TAGS, TAG_MAX_LEN } from '../lib/trainerRoster';

beforeEach(() => {
  h.toast.mockReset();
  // o servidor devolve a lista já normalizada
  h.setTags = vi.fn(async (_id, tags) => tags);
});
afterEach(cleanup);

const input = () => screen.getByLabelText('Nova etiqueta');
const add = text => {
  fireEvent.change(input(), { target: { value: text } });
  fireEvent.submit(input().closest('form'));
};

describe('ClientTags', () => {
  it('mostra as etiquetas atuais', () => {
    render(<ClientTags clientId="c1" initial={['Online', 'VIP']} />);
    expect(screen.getByText('Online')).toBeTruthy();
    expect(screen.getByText('VIP')).toBeTruthy();
  });

  it('sem etiquetas mostra só o campo de adicionar', () => {
    render(<ClientTags clientId="c1" />);
    expect(input()).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Remover etiqueta/ })).toBeNull();
  });

  it('adiciona pela tecla Enter (envio do formulário), salva na hora e limpa o campo', async () => {
    render(<ClientTags clientId="c1" initial={['Online']} />);
    add('  Plano anual  ');
    await waitFor(() => expect(h.setTags).toHaveBeenCalledWith('c1', ['Online', 'Plano anual']));
    expect(await screen.findByText('Plano anual')).toBeTruthy();
    expect(input().value).toBe('');
  });

  it('texto em branco não salva nada', () => {
    render(<ClientTags clientId="c1" />);
    add('   ');
    expect(h.setTags).not.toHaveBeenCalled();
  });

  it('etiqueta repetida (sem diferenciar maiúsculas) não duplica', async () => {
    render(<ClientTags clientId="c1" initial={['Online']} />);
    add('online');
    await waitFor(() => expect(h.setTags).toHaveBeenCalledWith('c1', ['Online']));
  });

  it('remove uma etiqueta e salva a lista sem ela', async () => {
    render(<ClientTags clientId="c1" initial={['Online', 'VIP']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover etiqueta Online' }));
    await waitFor(() => expect(h.setTags).toHaveBeenCalledWith('c1', ['VIP']));
    await waitFor(() => expect(screen.queryByText('Online')).toBeNull());
    expect(screen.getByText('VIP')).toBeTruthy();
  });

  it('o campo respeita o tamanho máximo da etiqueta', () => {
    render(<ClientTags clientId="c1" />);
    expect(input().maxLength).toBe(TAG_MAX_LEN);
  });

  it('no limite de etiquetas o campo de adicionar some', () => {
    const full = Array.from({ length: MAX_TAGS }, (_, i) => `T${i}`);
    render(<ClientTags clientId="c1" initial={full} />);
    expect(screen.queryByLabelText('Nova etiqueta')).toBeNull();
    expect(screen.getAllByRole('button', { name: /Remover etiqueta/ })).toHaveLength(MAX_TAGS);
  });

  it('erro ao salvar volta para a lista anterior e avisa', async () => {
    h.setTags.mockRejectedValue(new Error('not_authorized'));
    render(<ClientTags clientId="c1" initial={['Online']} />);
    add('Nova');
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.stringContaining('❌')));
    expect(screen.queryByText('Nova')).toBeNull();
    expect(screen.getByText('Online')).toBeTruthy();
  });

  it('enquanto salva, o botão de remover e o campo ficam desabilitados', async () => {
    let finish;
    h.setTags.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<ClientTags clientId="c1" initial={['Online']} />);
    add('Nova');
    await waitFor(() => expect(input().disabled).toBe(true));
    expect(screen.getByRole('button', { name: 'Remover etiqueta Online' }).disabled).toBe(true);
    finish(['Online', 'Nova']);
    await waitFor(() => expect(input().disabled).toBe(false));
  });
});
