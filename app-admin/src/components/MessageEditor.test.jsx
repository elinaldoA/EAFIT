// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const { lib } = vi.hoisted(() => ({ lib: { fetchUserVars: vi.fn() } }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/messageVars', async orig => ({ ...(await orig()), ...lib }));

import MessageEditor from './MessageEditor';
import { insertAt, renderMessage, unknownVars, usesVars } from '../lib/messageVars';

function Harness({ initialTitle = '', initialBody = '' }) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  return <MessageEditor title={title} body={body} onTitle={setTitle} onBody={setBody} users={[{ id: 'u1', email: 'ana@x.com' }]} />;
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('messageVars', () => {
  it('troca as variáveis como o servidor, mantendo parágrafos', () => {
    expect(renderMessage('Oi {nome}, {treinos_mes} treinos!', { nome: 'Ana', treinos_mes: 4 })).toBe('Oi Ana, 4 treinos!');
    expect(renderMessage('Oi {nome}, bora?', {})).toBe('Oi, bora?');
    expect(renderMessage('Oi {nome}!\n\nBora?', { nome: 'Ana' })).toBe('Oi Ana!\n\nBora?');
    expect(unknownVars('Oi {apelido}', '{nome} {xx}')).toEqual(['apelido', 'xx']);
    expect(usesVars('sem', 'com {dias_sem_treinar}')).toBe(true);
    expect(usesVars('sem')).toBe(false);
    expect(insertAt('Oi !', 3, 3, '{nome}')).toEqual({ value: 'Oi {nome}!', caret: 9 });
    expect(insertAt('abc', undefined, undefined, 'X')).toEqual({ value: 'abcX', caret: 4 });
  });
});

describe('MessageEditor', () => {
  it('insere variável no campo focado e mostra a prévia com exemplo e com uma pessoa', async () => {
    lib.fetchUserVars.mockResolvedValue({ nome: 'Bia', treinos_mes: 2, dias_sem_treinar: null });
    render(<Harness initialBody="Bora " />);
    const bodyEl = screen.getByLabelText('Mensagem');
    fireEvent.focus(bodyEl);
    bodyEl.setSelectionRange(5, 5);
    fireEvent.click(screen.getByText('{Nome}'));
    expect(bodyEl.value).toBe('Bora {nome}');
    expect(screen.getByTestId('preview-push').textContent).toContain('Bora Ana');

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Oi {apelido}' } });
    expect(screen.getByText(/\{apelido\} não é variável/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Prévia como'), { target: { value: 'u1' } });
    await waitFor(() => expect(lib.fetchUserVars).toHaveBeenCalledWith('u1'));
    await waitFor(() => expect(screen.getByTestId('preview-push').textContent).toContain('Bora Bia'));

    fireEvent.click(screen.getByText('E-mail'));
    expect(screen.getByTestId('preview-email').textContent).toContain('Abrir o app');
    fireEvent.click(screen.getByText('Caixa do app'));
    expect(screen.getByTestId('preview-inbox').textContent).toContain('Bora Bia');
  });
});
