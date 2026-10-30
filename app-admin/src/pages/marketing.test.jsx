// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { lib } = vi.hoisted(() => ({
  lib: {
    fetchAccounts: vi.fn(), fetchMedia: vi.fn(), fetchPosts: vi.fn(), createPost: vi.fn(), runPost: vi.fn(), deletePost: vi.fn(),
    cancelPost: vi.fn(), retryTarget: vi.fn(), startConnect: vi.fn(), disconnectAccount: vi.fn(),
    fetchComments: vi.fn(), syncComments: vi.fn(), replyComment: vi.fn(), hideComment: vi.fn(),
  },
}));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/marketing', async orig => ({ ...(await orig()), ...lib }));

import MarketingPublish from './MarketingPublish';
import MarketingAccounts from './MarketingAccounts';
import MarketingComments from './MarketingComments';
import {
  countHashtags, exerciseVideoList, fillReply, finalCaption, firstName, validatePost, wrapLines,
} from '../lib/marketing';

const wrap = (ui, path = '/') => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

const FB = { id: 'a1', platform: 'facebook', name: 'EAFIT', username: null, status: 'ok', parent_id: null, connected_at: '2026-10-30T10:00:00Z' };
const IG = { id: 'a2', platform: 'instagram', name: 'EAFIT', username: 'eafit', status: 'ok', parent_id: 'a1', connected_at: '2026-10-30T10:00:00Z' };
const TH = { id: 'a3', platform: 'threads', name: 'EAFIT', username: 'eafit', status: 'reconnect', status_detail: 'expirou', parent_id: null, connected_at: '2026-10-30T10:00:00Z' };
const ART = { id: 'm1', kind: 'image', url: 'https://cdn/arte.jpg', title: 'Arte treino', credit: null, storage_path: 'arte.jpg' };

beforeEach(() => {
  vi.clearAllMocks();
  lib.fetchAccounts.mockResolvedValue([FB, IG, TH]);
  lib.fetchMedia.mockResolvedValue([ART]);
  lib.fetchPosts.mockResolvedValue([]);
  lib.createPost.mockResolvedValue('p1');
  lib.runPost.mockResolvedValue({ results: [{ id: 't1', status: 'published' }, { id: 't2', status: 'processing' }] });
  lib.fetchComments.mockResolvedValue([]);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(cleanup);

describe('lib/marketing', () => {
  it('põe os créditos (sem repetir) no fim da legenda', () => {
    const media = [{ type: 'image', url: 'https://a', credit: 'Vídeo: X · CC BY' }, { type: 'image', url: 'https://b', credit: 'Vídeo: X · CC BY' }];
    expect(finalCaption(' Bora ', media)).toBe('Bora\n\nVídeo: X · CC BY');
    expect(finalCaption('Só texto', [])).toBe('Só texto');
    expect(finalCaption('', [{ type: 'video', url: 'https://v', credit: 'C' }])).toBe('C');
  });

  it('valida o post como as redes', () => {
    const img = { type: 'image', url: 'https://a' };
    const video = { type: 'video', url: 'https://v' };
    expect(validatePost({ caption: 'oi', media: [], accounts: [] })).toContain('Escolha ao menos uma conta.');
    expect(validatePost({ caption: 'oi', media: [], accounts: [IG] })).toContain('Instagram exige ao menos uma imagem ou vídeo.');
    expect(validatePost({ caption: 'oi', media: [video, img], accounts: [FB] })).toContain('Vídeo vai sozinho no post (sem outras mídias).');
    expect(validatePost({ caption: 'a'.repeat(501), media: [], accounts: [{ platform: 'threads' }] }))
      .toContain('Threads: a legenda (com créditos) passa de 500 caracteres.');
    expect(validatePost({ caption: 'oi', media: [], accounts: [FB], scheduledAt: '2026-01-01T10:00', now: new Date('2026-06-01') }))
      .toContain('O horário agendado já passou.');
    expect(validatePost({ caption: 'oi', media: [img], accounts: [FB, IG] })).toEqual([]);
  });

  it('conta hashtags', () => {
    expect(countHashtags('#treino #açaí e #2026 # nada')).toBe(3);
  });

  it('preenche a resposta pronta com o primeiro nome (ou sem ele)', () => {
    expect(firstName('@bia')).toBe('bia');
    expect(firstName('Ana Souza')).toBe('Ana');
    expect(fillReply('Valeu, {nome}! 💪', 'Ana Souza')).toBe('Valeu, Ana! 💪');
    expect(fillReply('Valeu, {nome}! 💪', '')).toBe('Valeu! 💪');
  });

  it('quebra o título em linhas que cabem', () => {
    const measure = t => t.length * 10;
    expect(wrapLines(measure, 'Treino do dia no seu bolso', 120)).toEqual(['Treino do', 'dia no seu', 'bolso']);
    expect(wrapLines(measure, 'Treino do dia no seu bolso', 120, 2)).toEqual(['Treino do', 'dia no seu']);
  });

  it('lista cada vídeo de exercício uma vez, com crédito e alerta de CC BY-SA', () => {
    const list = exerciseVideoList();
    expect(new Set(list.map(v => v.slug)).size).toBe(list.length);
    const burpee = list.find(v => v.slug === 'burpee');
    expect(burpee).toEqual(expect.objectContaining({ url: 'https://eafit.com.br/app/videos/burpee.mp4', shareAlike: true }));
    expect(burpee.credit).toMatch(/Wikimedia/);
  });
});

describe('MarketingPublish', () => {
  it('publica na hora nas contas ativas com a arte escolhida', async () => {
    wrap(<MarketingPublish />);
    expect(await screen.findByText('Facebook · EAFIT')).toBeTruthy();
    // Threads precisa reconectar: fica desmarcado e travado.
    expect(screen.getByLabelText(/Threads · @eafit/).disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText(/Conte a novidade/), { target: { value: 'Treino novo no app!' } });
    fireEvent.click(await screen.findByRole('button', { name: /Arte treino/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Publicar agora' }));

    await waitFor(() => expect(lib.createPost).toHaveBeenCalledWith({
      caption: 'Treino novo no app!',
      media: [expect.objectContaining({ type: 'image', url: 'https://cdn/arte.jpg' })],
      accountIds: ['a1', 'a2'],
      scheduledAt: null,
    }));
    expect(lib.runPost).toHaveBeenCalledWith('p1');
    expect(await screen.findByText(/Publicado em 1 conta\(s\)\. 1 ainda processando/)).toBeTruthy();
  });

  it('não deixa publicar no Instagram sem mídia', async () => {
    wrap(<MarketingPublish />);
    fireEvent.change(await screen.findByPlaceholderText(/Conte a novidade/), { target: { value: 'Só texto' } });
    expect(screen.getByText('Instagram exige ao menos uma imagem ou vídeo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publicar agora' }).disabled).toBe(true);
  });

  it('mostra falha por conta com opção de tentar de novo', async () => {
    lib.fetchPosts.mockResolvedValue([{
      id: 'p9', caption: 'Post antigo', media: [], scheduled_at: null, created_at: '2026-10-30T10:00:00Z',
      targets: [{ id: 't9', account_id: 'a2', status: 'failed', error: 'Imagem fora da proporção' }],
    }]);
    lib.retryTarget.mockResolvedValue();
    lib.runPost.mockResolvedValue({ results: [] });
    wrap(<MarketingPublish />);
    expect(await screen.findByText('Imagem fora da proporção')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(lib.retryTarget).toHaveBeenCalledWith('t9'));
    expect(lib.runPost).toHaveBeenCalledWith('p9');
  });
});

describe('MarketingPublish: excluir', () => {
  const POST = {
    id: 'p7', caption: 'Carrossel', media: [], scheduled_at: null, created_at: '2026-10-30T10:00:00Z',
    targets: [
      { id: 't1', account_id: 'a1', status: 'published', permalink: 'https://fb/p' },
      { id: 't2', account_id: 'a2', status: 'published', permalink: 'https://ig/p' },
    ],
  };

  it('pergunta antes, avisa quantas redes e recarrega a lista', async () => {
    lib.fetchPosts.mockResolvedValue([POST]);
    lib.deletePost.mockResolvedValue({ removed: true, results: [{ ok: true }, { ok: true }] });
    wrap(<MarketingPublish />);
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('apagado em 2 rede(s)'));
    await waitFor(() => expect(lib.deletePost).toHaveBeenCalledWith('p7'));
    expect(await screen.findByText('Post excluído.')).toBeTruthy();
    expect(lib.fetchPosts).toHaveBeenCalledTimes(2);
  });

  it('mostra quando alguma rede não excluiu', async () => {
    lib.fetchPosts.mockResolvedValue([POST]);
    lib.deletePost.mockResolvedValue({ removed: false, results: [{ ok: true }, { ok: false, error: 'Não deu para excluir: sem permissão' }] });
    wrap(<MarketingPublish />);
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText(/1 rede\(s\) não excluíram \(Não deu para excluir: sem permissão\)/)).toBeTruthy();
  });

  it('não exclui se o admin desistir', async () => {
    lib.fetchPosts.mockResolvedValue([POST]);
    window.confirm.mockReturnValue(false);
    wrap(<MarketingPublish />);
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(lib.deletePost).not.toHaveBeenCalled();
  });
});

describe('MarketingAccounts', () => {
  it('lista as contas, avisa a que precisa reconectar e mostra a volta do OAuth', async () => {
    wrap(<MarketingAccounts />, '/?conectado=Facebook:%20EAFIT');
    expect(screen.getByText('Conectado: Facebook: EAFIT')).toBeTruthy();
    expect(await screen.findAllByText('Ativa')).toHaveLength(2);
    expect(screen.getByText('Reconectar', { selector: '.badge' })).toBeTruthy();
    // Instagram sai junto com a Página: não tem botão próprio.
    expect(screen.getAllByRole('button', { name: 'Desconectar' })).toHaveLength(2);
  });

  it('conectar leva ao login da Meta e mostra erro de configuração', async () => {
    lib.startConnect.mockRejectedValue(new Error('Falta configurar nas Edge Functions: META_APP_ID.'));
    wrap(<MarketingAccounts />);
    fireEvent.click(screen.getByRole('button', { name: 'Conectar Facebook e Instagram' }));
    await waitFor(() => expect(lib.startConnect).toHaveBeenCalledWith('meta'));
    expect(await screen.findByText(/META_APP_ID/)).toBeTruthy();
  });
});

describe('MarketingComments', () => {
  const COMMENT = {
    id: 'c1', author: '@bia', text: 'Como baixo o app?', commented_at: '2026-10-30T10:00:00Z', hidden: false, answered: false,
    post_caption: 'Treino novo', post_permalink: 'https://ig/p', account: { platform: 'instagram', username: 'eafit' },
  };

  it('responde com resposta pronta e atualiza a lista', async () => {
    lib.fetchComments.mockResolvedValue([COMMENT]);
    lib.replyComment.mockResolvedValue({ ok: true });
    wrap(<MarketingComments />);
    expect(await screen.findByText('Como baixo o app?')).toBeTruthy();
    expect(lib.fetchComments).toHaveBeenCalledWith({ filter: 'open', platform: '' });
    fireEvent.click(screen.getByRole('button', { name: /^Valeu, bia!/ }));
    expect(screen.getByLabelText('Resposta para @bia').value).toBe('Valeu, bia! 💪 O app é gratuito: eafit.com.br/app');
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    await waitFor(() => expect(lib.replyComment).toHaveBeenCalledWith('c1', 'Valeu, bia! 💪 O app é gratuito: eafit.com.br/app'));
    expect(await screen.findByText('Resposta publicada para @bia.')).toBeTruthy();
  });

  it('oculta comentário e sincroniza sob demanda', async () => {
    lib.fetchComments.mockResolvedValue([COMMENT]);
    lib.hideComment.mockResolvedValue({ ok: true });
    lib.syncComments.mockResolvedValue({ results: [{ account: 'a2', comments: 3 }] });
    wrap(<MarketingComments />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ocultar' }));
    await waitFor(() => expect(lib.hideComment).toHaveBeenCalledWith('c1', true));
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar agora' }));
    expect(await screen.findByText('Comentários atualizados.')).toBeTruthy();
  });
});
