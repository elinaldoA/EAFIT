// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { lib } = vi.hoisted(() => ({
  lib: {
    fetchAccounts: vi.fn(), fetchMedia: vi.fn(), fetchPosts: vi.fn(), createPost: vi.fn(), runPost: vi.fn(), deletePost: vi.fn(),
    cancelPost: vi.fn(), retryTarget: vi.fn(), startConnect: vi.fn(), disconnectAccount: vi.fn(),
    fetchComments: vi.fn(), syncComments: vi.fn(), replyComment: vi.fn(), hideComment: vi.fn(), fetchTikTokCreator: vi.fn(),
    fetchAutopost: vi.fn(), setAutopostEnabled: vi.fn(),
  },
}));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/marketing', async orig => ({ ...(await orig()), ...lib }));

import MarketingPublish from './MarketingPublish';
import MarketingAccounts from './MarketingAccounts';
import MarketingComments from './MarketingComments';
import {
  EMPTY_TIKTOK, countHashtags, exerciseVideoList, fillReply, finalCaption, firstName, tiktokLabel, tiktokPayload, validatePost, wrapLines, nextAutopostSlots, autopostSchedule, splitCaption, brtDay,
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
  const pending = [
    { id: 'q1', format: 'feed', caption: 'Primeira linha\nresto\n\nLink na bio\n\n#treino #app', media: [{ url: 'https://x/a.jpg' }] },
    { id: 'q2', format: 'story', caption: '', media: [{ url: 'https://x/b.jpg' }] },
    { id: 'q3', format: 'story', caption: '', media: [{ url: 'https://x/c.jpg' }] },
  ];
  lib.fetchAutopost.mockResolvedValue({ enabled: true, items: pending, pending, skipped: [{ id: 'x' }], posted: 4 });
  lib.setAutopostEnabled.mockResolvedValue();
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

  it('TikTok: só um vídeo e nada de story', () => {
    const TK = { platform: 'tiktok' };
    const video = { type: 'video', url: 'https://v' };
    const tiktok = { ...EMPTY_TIKTOK, privacy_level: 'PUBLIC_TO_EVERYONE' };
    expect(validatePost({ caption: 'oi', media: [video], accounts: [TK], tiktok })).toEqual([]);
    expect(validatePost({ caption: 'oi', media: [{ type: 'image', url: 'https://a' }], accounts: [TK], tiktok }))
      .toContain('TikTok: o post precisa ser um único vídeo.');
    expect(validatePost({ caption: '', format: 'story', media: [video], accounts: [TK] }))
      .toContain('TikTok não tem stories pelo painel: desmarque o TikTok.');
  });

  it('TikTok: quem pode ver sem padrão, divulgação comercial e duração', () => {
    const TK = { platform: 'tiktok' };
    const video = { type: 'video', url: 'https://v' };
    const v = (tiktok, extra = {}) => validatePost({ caption: 'oi', media: [video], accounts: [TK], tiktok, ...extra });
    expect(v(EMPTY_TIKTOK)).toContain('TikTok: escolha quem pode ver o vídeo.');
    expect(v({ ...EMPTY_TIKTOK, privacy_level: 'SELF_ONLY', commercial: true }))
      .toContain('TikTok: diga se o conteúdo comercial é da sua marca ou de marca parceira.');
    expect(v({ ...EMPTY_TIKTOK, privacy_level: 'SELF_ONLY', commercial: true, brand_content: true }))
      .toContain('TikTok: conteúdo de marca não pode ficar como "Somente eu".');
    expect(v({ ...EMPTY_TIKTOK, privacy_level: 'SELF_ONLY' }, { tiktokCreator: { maxDurationSec: 60 }, videoDuration: 90 }))
      .toContain('TikTok: a conta aceita vídeos de até 60 segundos.');
    expect(tiktokPayload({ ...EMPTY_TIKTOK, privacy_level: 'SELF_ONLY', brand_organic: true, allow_comment: true }))
      .toEqual({ privacy_level: 'SELF_ONLY', allow_comment: true, allow_duet: false, allow_stitch: false, brand_organic: false, brand_content: false });
    expect(tiktokLabel({ commercial: true, brand_organic: true })).toBe('Seu vídeo será rotulado como "Conteúdo promocional".');
    expect(tiktokLabel({ commercial: true, brand_organic: true, brand_content: true })).toBe('Seu vídeo será rotulado como "Parceria paga".');
  });

  it('valida o story: uma mídia, sem Threads e sem crédito obrigatório', () => {
    const img = { type: 'image', url: 'https://a' };
    const story = args => validatePost({ caption: '', format: 'story', ...args });
    expect(story({ media: [img], accounts: [FB, IG] })).toEqual([]);
    expect(story({ media: [img, img], accounts: [IG] })).toContain('Story leva exatamente uma imagem ou um vídeo.');
    expect(story({ media: [img], accounts: [TH] })).toContain('Threads não tem stories: desmarque o Threads.');
    expect(story({ media: [{ ...img, credit: 'CC BY' }], accounts: [IG] }))
      .toContain('Mídia com crédito obrigatório não pode ir para story (não há legenda para o crédito).');
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
      format: 'feed',
      tiktok: null,
    }));
    expect(lib.runPost).toHaveBeenCalledWith('p1');
    expect(await screen.findByText(/Publicado em 1 conta\(s\)\. 1 ainda processando/)).toBeTruthy();
  });

  it('TikTok: mostra a conta, exige escolher quem vê e respeita o que a conta desligou', async () => {
    const TK = { ...TH, id: 'a4', platform: 'tiktok', username: 'eafitapp', status: 'ok' };
    lib.fetchAccounts.mockResolvedValue([TK]);
    lib.fetchMedia.mockResolvedValue([{ ...ART, id: 'm2', kind: 'video', url: 'https://cdn/v.mp4', title: 'Reels treino' }]);
    lib.fetchTikTokCreator.mockResolvedValue({
      publicPosts: false,
      creator: {
        nickname: 'EAFIT App', username: 'eafitapp', avatarUrl: '', privacyOptions: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
        commentDisabled: false, duetDisabled: true, stitchDisabled: false, maxDurationSec: 600,
      },
    });
    wrap(<MarketingPublish />);
    // Não vem marcado até a auditoria do app no TikTok.
    const chip = await screen.findByLabelText(/TikTok · @eafitapp/);
    expect(chip.checked).toBe(false);
    fireEvent.click(chip);
    expect(await screen.findByText('EAFIT App')).toBeTruthy();
    expect(lib.fetchTikTokCreator).toHaveBeenCalledWith('a4');
    expect(screen.getByLabelText('Dueto').disabled).toBe(true);
    expect(screen.getByLabelText('Comentários').checked).toBe(false);
    expect(screen.getByText(/sai como “Somente eu”/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/Conte a novidade/), { target: { value: 'Treino!' } });
    fireEvent.click(await screen.findByRole('button', { name: /Reels treino/ }));
    expect(screen.getByText('TikTok: escolha quem pode ver o vídeo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publicar agora' }).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Quem pode ver este vídeo'), { target: { value: 'PUBLIC_TO_EVERYONE' } });
    fireEvent.click(screen.getByLabelText('Comentários'));
    fireEvent.click(screen.getByLabelText(/Divulgar conteúdo comercial/));
    fireEvent.click(screen.getByLabelText(/Sua marca/));
    expect(screen.getByText('Seu vídeo será rotulado como "Conteúdo promocional".')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar agora' }));

    await waitFor(() => expect(lib.createPost).toHaveBeenCalledWith(expect.objectContaining({
      accountIds: ['a4'],
      tiktok: expect.objectContaining({ privacy_level: 'PUBLIC_TO_EVERYONE', allow_comment: true, commercial: true, brand_organic: true }),
    })));
  });

  it('agenda um story sem legenda e trava o Threads', async () => {
    lib.fetchAccounts.mockResolvedValue([FB, IG, { ...TH, status: 'ok' }]);
    wrap(<MarketingPublish />);
    expect((await screen.findByLabelText(/Threads · @eafit/)).checked).toBe(true);

    fireEvent.click(screen.getByLabelText('Story'));
    expect(screen.getByLabelText(/Threads · @eafit/).checked).toBe(false);
    expect(screen.getByLabelText(/Threads · @eafit/).disabled).toBe(true);
    expect(screen.queryByPlaceholderText(/Conte a novidade/)).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: /Arte treino/ }));
    fireEvent.click(screen.getByLabelText('Agendar'));
    fireEvent.change(screen.getByLabelText('Data e hora'), { target: { value: '2099-11-03T07:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar story' }));

    await waitFor(() => expect(lib.createPost).toHaveBeenCalledWith(expect.objectContaining({
      accountIds: ['a1', 'a2'], scheduledAt: '2099-11-03T07:00', format: 'story',
    })));
    expect(lib.runPost).not.toHaveBeenCalled();
    expect(await screen.findByText('Story agendado. Ele sai sozinho no horário.')).toBeTruthy();
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

  it('conecta e reconecta o TikTok pelo provedor próprio', async () => {
    lib.fetchAccounts.mockResolvedValue([{ ...TH, id: 'a4', platform: 'tiktok', username: 'eafitapp' }]);
    lib.startConnect.mockResolvedValue();
    wrap(<MarketingAccounts />);
    fireEvent.click(screen.getByRole('button', { name: 'Conectar TikTok' }));
    await waitFor(() => expect(lib.startConnect).toHaveBeenCalledWith('tiktok'));
    expect(await screen.findByText('TikTok')).toBeTruthy();
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

describe('Publicação automática', () => {
  it('mostra o que falta e pausa', async () => {
    wrap(<MarketingPublish />);
    expect(await screen.findByText(/4 já publicados · faltam 1 no feed, 0 em Reels e 2 em stories/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    await waitFor(() => expect(lib.setAutopostEnabled).toHaveBeenCalledWith(false));
    expect(await screen.findByRole('button', { name: 'Ligar' })).toBeTruthy();
  });

  it('some quando a fila não existe (migration pendente)', async () => {
    lib.fetchAutopost.mockRejectedValue(new Error('relation does not exist'));
    wrap(<MarketingPublish />);
    await waitFor(() => expect(lib.fetchAutopost).toHaveBeenCalled());
    expect(screen.queryByText('Publicação automática')).toBeNull();
  });
});

describe('nextAutopostSlots', () => {
  const pending = [{ id: 'f', format: 'feed' }, { id: 's', format: 'story' }];

  it('antes das 12h de Brasília: feed e story saem hoje', () => {
    const slots = nextAutopostSlots(pending, new Date('2026-11-05T13:00:00Z')); // 10h BRT
    expect(slots.map(s => [s.format, s.today])).toEqual([['feed', true], ['story', true]]);
  });

  it('depois do feed: só o story sai hoje, o feed fica para amanhã', () => {
    const slots = nextAutopostSlots(pending, new Date('2026-11-05T18:00:00Z')); // 15h BRT
    expect(slots.map(s => [s.format, s.today])).toEqual([['story', true], ['feed', false]]);
  });

  it('a meia-noite de Brasília já é outro dia', () => {
    expect(brtDay('2026-11-05T02:59:00Z')).toBe('2026-11-04');
    expect(brtDay('2026-11-05T03:00:00Z')).toBe('2026-11-05');
  });

  it('sem item pendente de um formato, ele não aparece', () => {
    expect(nextAutopostSlots([{ id: 'f', format: 'feed' }], new Date('2026-11-05T13:00:00Z')).map(s => s.format)).toEqual(['feed']);
  });
});

describe('agenda da fila automática', () => {
  it('um item por dia em cada formato, na ordem da fila', () => {
    const pending = [
      { id: 'f1', format: 'feed' }, { id: 's1', format: 'story' }, { id: 'f2', format: 'feed' }, { id: 'f3', format: 'feed' },
    ];
    const sched = autopostSchedule(pending, new Date('2026-11-05T13:00:00Z'));
    expect(sched.map(s => `${s.item.id}@${s.at.toISOString().slice(0, 13)}`)).toEqual([
      'f1@2026-11-05T15', 's1@2026-11-05T22', 'f2@2026-11-06T15', 'f3@2026-11-07T15',
    ]);
  });

  it('separa as hashtags da legenda', () => {
    expect(splitCaption('Texto aqui 📲\n\nLink na bio 👇\n\n#personaltrainer #treino')).toEqual({
      body: 'Texto aqui 📲\n\nLink na bio 👇', tags: ['#personaltrainer', '#treino'],
    });
  });
});

describe('cartão da publicação automática', () => {
  it('mostra a legenda, as hashtags e o dia de cada item da fila', async () => {
    wrap(<MarketingPublish />);
    expect(await screen.findByText(/Resumo da fila: 4 já publicados.*1 pulado\(s\) por repetição/)).toBeTruthy();
    expect(screen.getByText(/Primeira linha/)).toBeTruthy();
    expect(screen.getByText('Hashtags: #treino #app')).toBeTruthy();
    expect(screen.getAllByText('Hoje').length + screen.getAllByText(/^Amanhã/).length).toBeGreaterThan(0);
  });
});

describe('Reels na agenda', () => {
  it('o Reel sai às 17h entre o feed e o story', () => {
    const pending = [{ id: 'f', format: 'feed' }, { id: 'r', format: 'reel' }, { id: 's', format: 'story' }];
    const sched = autopostSchedule(pending, new Date('2026-11-05T13:00:00Z'));
    expect(sched.map(s => `${s.format}@${s.at.toISOString().slice(11, 13)}`)).toEqual(['feed@15', 'reel@20', 'story@22']);
  });
});
