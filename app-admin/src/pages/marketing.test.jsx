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
    fetchMetrics: vi.fn(), refreshMetrics: vi.fn(), fetchConversion: vi.fn(), fetchContentConversion: vi.fn(),
    uploadMedia: vi.fn(), editPost: vi.fn(), deleteExternalPost: vi.fn(), editExternalPost: vi.fn(),
    updateQueueCaption: vi.fn(), moveQueueItem: vi.fn(), removeQueueItem: vi.fn(), restoreQueueItem: vi.fn(), addQueueItem: vi.fn(),
  },
}));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'admin-1' } }) }));
const { reelVideo } = vi.hoisted(() => ({ reelVideo: { renderReel: vi.fn(), renderStory: vi.fn(), canRenderReels: vi.fn(() => true) } }));
vi.mock('../lib/reelVideo', () => reelVideo);
vi.mock('../lib/marketing', async orig => ({ ...(await orig()), ...lib }));

import MarketingPublish from './MarketingPublish';
import MarketingAccounts from './MarketingAccounts';
import MarketingComments from './MarketingComments';
import MarketingResults from './MarketingResults';
import MarketingMedia from './MarketingMedia';
import { synthTrack } from '../lib/reelAudio';
import { DURATION, FPS, STORY_DROP, STORY_DURATION, STORY_VARIANTS, drawReelFrame, drawStoryFrame } from '../lib/reelRender';
import {
  EMPTY_TIKTOK, countHashtags, exerciseVideoList, fillReply, finalCaption, firstName, tiktokLabel, tiktokPayload, validatePost, wrapLines, nextAutopostSlots, autopostSchedule, laneKey, splitCaption, brtDay, averageByKind, conversionRate, postScore, queuePosition, seasonOnDay, laneLabel,
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
    wrap(<MarketingPublish />, '/?aba=novo');
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
    wrap(<MarketingPublish />, '/?aba=novo');
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
    wrap(<MarketingPublish />, '/?aba=novo');
    expect((await screen.findByLabelText(/Threads · @eafit/)).checked).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: 'Story' }));
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
    wrap(<MarketingPublish />, '/?aba=novo');
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
    wrap(<MarketingPublish />, '/?aba=historico');
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
    wrap(<MarketingPublish />, '/?aba=historico');
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('apagado em 2 rede(s)'));
    await waitFor(() => expect(lib.deletePost).toHaveBeenCalledWith('p7'));
    expect(await screen.findByText('Post excluído.')).toBeTruthy();
    expect(lib.fetchPosts).toHaveBeenCalledTimes(2);
  });

  it('mostra quando alguma rede não excluiu', async () => {
    lib.fetchPosts.mockResolvedValue([POST]);
    lib.deletePost.mockResolvedValue({ removed: false, results: [{ ok: true }, { ok: false, error: 'Não deu para excluir: sem permissão' }] });
    wrap(<MarketingPublish />, '/?aba=historico');
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText(/1 rede\(s\) não excluíram \(Não deu para excluir: sem permissão\)/)).toBeTruthy();
  });

  it('não exclui se o admin desistir', async () => {
    lib.fetchPosts.mockResolvedValue([POST]);
    window.confirm.mockReturnValue(false);
    wrap(<MarketingPublish />, '/?aba=historico');
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
    expect(await screen.findByText(/faltam 1 no feed, 0 em Reels, 2 em stories e 0 de nutrição/)).toBeTruthy();
    expect(screen.getByText('já publicados').previousSibling.textContent).toBe('4');
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

  it('antes das 13h de Brasília: story e feed saem hoje', () => {
    const slots = nextAutopostSlots(pending, new Date('2026-11-05T13:00:00Z')); // 10h BRT
    expect(slots.map(s => [s.format, s.today])).toEqual([['story', true], ['feed', true]]);
  });

  it('depois do story das 13h: só o feed sai hoje, o story fica para amanhã', () => {
    const slots = nextAutopostSlots(pending, new Date('2026-11-05T18:00:00Z')); // 15h BRT
    expect(slots.map(s => [s.format, s.today])).toEqual([['feed', true], ['story', false]]);
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
      's1@2026-11-05T16', 'f1@2026-11-05T21', 'f2@2026-11-06T21', 'f3@2026-11-07T21',
    ]);
  });

  const SEASON = { enabled: true, periods: [
    { theme: 'novembro_azul', startsOn: '2026-11-03', endsOn: '2026-11-30' },
    { theme: 'natal', startsOn: '2026-12-01', endsOn: '2026-12-26' },
  ] };

  it('item de temporada só sai com o tema no ar no app e, nele, passa na frente', () => {
    const pending = [
      { id: 'f1', format: 'feed' }, { id: 'natal', format: 'feed', season: 'natal' },
      { id: 'azul', format: 'feed', season: 'novembro_azul' }, { id: 'f2', format: 'feed' },
    ];
    const sched = autopostSchedule(pending, new Date('2026-11-29T13:00:00Z'), SEASON);
    expect(sched.map(s => `${s.item.id}@${s.at.toISOString().slice(0, 10)}`)).toEqual([
      'azul@2026-11-29', 'f1@2026-11-30', 'natal@2026-12-01', 'f2@2026-12-02',
    ]);
  });

  it('sem a temporada programada no app, o item de temporada fica fora da agenda', () => {
    const pending = [{ id: 'f1', format: 'feed' }, { id: 'carnaval', format: 'feed', season: 'carnaval' }];
    expect(autopostSchedule(pending, new Date('2026-11-05T13:00:00Z'), SEASON).map(s => s.item.id)).toEqual(['f1']);
    expect(autopostSchedule(pending, new Date('2026-11-05T13:00:00Z')).map(s => s.item.id)).toEqual(['f1']);
  });

  it('acha o tema do dia e marca o item de temporada', () => {
    expect(seasonOnDay(SEASON, '2026-12-01')).toBe('natal');
    expect(seasonOnDay(SEASON, '2026-12-27')).toBeNull();
    expect(seasonOnDay({ ...SEASON, enabled: false }, '2026-12-01')).toBeNull();
    expect(seasonOnDay({ enabled: true, theme: 'natal', startsOn: '2026-12-01', endsOn: '2026-12-26' }, '2026-12-10')).toBe('natal');
    expect(laneLabel({ format: 'story', season: 'natal' })).toBe('Story · 🎄 Natal');
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
    expect(await screen.findByText(/1 pulado\(s\) por repetição/)).toBeTruthy();
    expect(screen.getAllByText(/Primeira linha/).length).toBeGreaterThan(0);
    expect(screen.getByText('Hashtags: #treino #app')).toBeTruthy();
    expect(screen.getAllByText('Hoje').length + screen.getAllByText(/^Amanhã/).length).toBeGreaterThan(0);
  });
});

describe('Reels na agenda', () => {
  it('o Reel sai às 20h30, depois do story das 13h e do feed das 18h', () => {
    const pending = [{ id: 'f', format: 'feed' }, { id: 'r', format: 'reel' }, { id: 's', format: 'story' }];
    const sched = autopostSchedule(pending, new Date('2026-11-05T13:00:00Z'));
    expect(sched.map(s => `${s.format}@${s.at.toISOString().slice(11, 13)}`)).toEqual(['story@16', 'feed@21', 'reel@23']);
  });
});

describe('Publicar em abas', () => {
  it('abre na agenda, troca para o novo post e para o histórico', async () => {
    wrap(<MarketingPublish />);
    expect(await screen.findByRole('tab', { name: 'Agenda', selected: true })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Fila' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publicar agora' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Novo post' }));
    expect(await screen.findByText('Onde e como publicar')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publicar agora' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Histórico/ }));
    expect(await screen.findByText('Histórico de posts')).toBeTruthy();
  });

  it('o histórico filtra por situação e conta cada grupo', async () => {
    lib.fetchPosts.mockResolvedValue([
      { id: 'p1', caption: 'ok', media: [], format: 'feed', scheduled_at: null, created_at: '2026-11-01T10:00:00Z', targets: [{ id: 't1', account_id: 'a1', status: 'published' }] },
      { id: 'p2', caption: 'falhou', media: [], format: 'feed', scheduled_at: null, created_at: '2026-11-01T11:00:00Z', targets: [{ id: 't2', account_id: 'a1', status: 'failed', error: 'x' }] },
    ]);
    wrap(<MarketingPublish />, '/?aba=historico');
    expect(await screen.findByRole('button', { name: 'Todos (2)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Com problema (1)' }));
    expect(screen.getByText('falhou')).toBeTruthy();
    expect(screen.queryByText('ok')).toBeNull();
  });
});

describe('Resultados', () => {
  const METRICS = [
    { account_id: 'a2', external_id: 'm1', permalink: 'https://ig/1', caption: 'Reel de treino\nresto', kind: 'reel', thumb_url: null, posted_at: new Date().toISOString(), likes: 12, comments: 3, shares: 4, saves: 9, reach: 300, views: 800, insights_ok: true },
    { account_id: 'a2', external_id: 'm2', permalink: 'https://ig/2', caption: 'Foto simples', kind: 'image', thumb_url: null, posted_at: new Date().toISOString(), likes: 5, comments: 0, shares: null, saves: 1, reach: 90, views: null, insights_ok: true },
    { account_id: 'a1', external_id: 'f1', permalink: 'https://fb/1', caption: 'Post no Facebook', kind: 'image', thumb_url: null, posted_at: new Date().toISOString(), likes: 2, comments: 0, shares: 0, saves: null, reach: null, views: null, insights_ok: false },
  ];

  beforeEach(() => {
    lib.fetchMetrics.mockResolvedValue(METRICS);
    lib.refreshMetrics.mockResolvedValue({ results: [{ account: 'a2', posts: 2 }] });
    lib.fetchContentConversion.mockResolvedValue([
      { source: 'facebook', content: 'ab12cd34', caption: 'Erros que travam o ganho de massa', visits: 30, signups: 4, activated: 2, mature: 3, retained: 1 },
    ]);
    lib.fetchConversion.mockResolvedValue([
      { source: 'instagram', medium: 'bio', visits: 100, signups: 8, confirmed: 6, activated: 3, mature: 6, retained: 2 },
      { source: 'instagram', medium: 'story', visits: 40, signups: 1, confirmed: 1, activated: 0, mature: 0, retained: 0 },
    ]);
  });

  it('mostra cadastros por tipo de link e o desempenho, do melhor para o pior', async () => {
    wrap(<MarketingResults />);
    expect(await screen.findByText('Link da bio')).toBeTruthy();
    expect(screen.getByText('8%')).toBeTruthy(); // 8 cadastros em 100 visitas
    expect(screen.getByText('2,5%')).toBeTruthy(); // 1 em 40
    expect(screen.getByText('2 de 6')).toBeTruthy(); // seguiram treinando entre os dias 8 e 30
    expect(screen.getByText('Erros que travam o ganho de massa')).toBeTruthy(); // cadastros por post
    expect(screen.getByText('1 de 3')).toBeTruthy();
    const posts = await screen.findAllByText(/ver post/);
    expect(posts.length).toBe(3);
    expect(screen.getAllByText('Reel de treino').length).toBeGreaterThan(0);
    expect(screen.getByText(/Melhor post do período/)).toBeTruthy();
  });

  it('filtra por rede e atualiza as métricas na hora', async () => {
    wrap(<MarketingResults />);
    await screen.findAllByText('Reel de treino');
    fireEvent.click(screen.getByRole('button', { name: 'Facebook' }));
    expect(screen.queryByText('Reel de treino')).toBeNull();
    expect(screen.getAllByText('Post no Facebook').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar métricas' }));
    await waitFor(() => expect(lib.refreshMetrics).toHaveBeenCalled());
    expect(await screen.findByText('Métricas atualizadas.')).toBeTruthy();
  });

  it('sem insights, avisa que falta a permissão', async () => {
    lib.fetchMetrics.mockResolvedValue([{ ...METRICS[2] }]);
    wrap(<MarketingResults />);
    expect(await screen.findByText(/permissão de insights/)).toBeTruthy();
  });
});

describe('lib: resultados', () => {
  it('pontua pelo alcance, depois visualizações, depois interações', () => {
    expect(postScore({ reach: 300, views: 800, likes: 1 })).toBe(300);
    expect(postScore({ reach: null, views: 800, likes: 1 })).toBe(800);
    expect(postScore({ reach: null, views: null, likes: 5, comments: 2, shares: 1, saves: 2 })).toBe(10);
  });

  it('média por formato, do que mais rende para o que menos', () => {
    const avg = averageByKind([
      { kind: 'reel', reach: 300 }, { kind: 'reel', reach: 100 }, { kind: 'image', reach: 90 },
    ]);
    expect(avg.map(g => [g.kind, g.average, g.posts])).toEqual([['reel', 200, 2], ['image', 90, 1]]);
  });

  it('cadastros por visita', () => {
    expect(conversionRate(100, 8)).toBe(8);
    expect(conversionRate(0, 3)).toBeNull();
    expect(conversionRate(40, 1)).toBe(2.5);
  });
});

describe('Fila: editor', () => {
  const QUEUE = [
    { id: 'q1', format: 'feed', position: 1, caption: 'Primeiro post\n\n#treino', media: [{ type: 'image', url: 'https://x/1.jpg' }] },
    { id: 'q2', format: 'feed', position: 2, caption: 'Segundo post', media: [{ type: 'image', url: 'https://x/2.jpg' }] },
    { id: 'q3', format: 'story', position: 3, caption: '', media: [{ type: 'image', url: 'https://x/3.jpg' }] },
  ];
  const skipped = { id: 'q9', format: 'feed', position: 9, caption: 'Repetido', media: [{ type: 'image', url: 'https://x/9.jpg' }], skipped_at: '2026-11-04T10:00:00Z' };

  beforeEach(() => {
    lib.fetchAutopost.mockResolvedValue({ enabled: true, items: QUEUE, pending: QUEUE, skipped: [skipped], posted: 0 });
    for (const fn of ['updateQueueCaption', 'moveQueueItem', 'removeQueueItem', 'restoreQueueItem', 'addQueueItem']) lib[fn].mockResolvedValue(undefined);
  });

  it('lista a fila por formato e desliga subir no primeiro e descer no último', async () => {
    wrap(<MarketingPublish />, '/?aba=fila');
    expect(await screen.findByText(/Feed · todo dia às 18h \(2 na fila\)/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Subir item 1 de feed' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Descer item 2 de feed' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Descer item 1 de feed' }).disabled).toBe(false);
  });

  it('reordena, edita a legenda e remove só depois de confirmar', async () => {
    wrap(<MarketingPublish />, '/?aba=fila');
    fireEvent.click(await screen.findByRole('button', { name: 'Descer item 1 de feed' }));
    await waitFor(() => expect(lib.moveQueueItem).toHaveBeenCalledWith('q1', 'down'));

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar legenda' })[0]);
    fireEvent.change(screen.getByLabelText('Legenda'), { target: { value: 'Legenda nova' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(lib.updateQueueCaption).toHaveBeenCalledWith('q1', 'Legenda nova'));
    expect(await screen.findByText('Legenda salva.')).toBeTruthy();

    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover' })[0]);
    expect(lib.removeQueueItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover' })[0]);
    await waitFor(() => expect(lib.removeQueueItem).toHaveBeenCalledWith('q3')); // a faixa do story (13h) vem antes do feed (18h)
  });

  it('repõe um item pulado por repetição', async () => {
    wrap(<MarketingPublish />, '/?aba=fila');
    fireEvent.click(await screen.findByRole('button', { name: 'Repor na fila' }));
    await waitFor(() => expect(lib.restoreQueueItem).toHaveBeenCalledWith('q9'));
  });

  it('adiciona um item novo com a mídia da biblioteca', async () => {
    wrap(<MarketingPublish />, '/?aba=fila');
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar à fila' }));
    fireEvent.change(screen.getByLabelText('Legenda'), { target: { value: 'Post novo #treino' } });
    fireEvent.click(screen.getByRole('button', { name: /Arte treino/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao fim da fila' }));
    await waitFor(() => expect(lib.addQueueItem).toHaveBeenCalledWith({
      format: 'feed', slot: '', caption: 'Post novo #treino', media: [{ type: 'image', url: 'https://cdn/arte.jpg', title: 'Arte treino' }],
    }));
    expect(await screen.findByText('Item adicionado ao fim da fila.')).toBeTruthy();
  });

  it('numera a posição dentro do formato', () => {
    expect(queuePosition(QUEUE, QUEUE[1])).toEqual({ first: false, last: true, number: 2, total: 2 });
    expect(queuePosition(QUEUE, QUEUE[2])).toEqual({ first: true, last: true, number: 1, total: 1 });
  });
});

describe('Gerador de Reel', () => {
  beforeEach(() => {
    reelVideo.canRenderReels.mockReturnValue(true);
    reelVideo.renderReel.mockImplementation(async ({ onProgress }) => {
      onProgress(0.5);
      return { blob: new Blob(['mp4'], { type: 'video/mp4' }), width: 1080, height: 1920, seconds: 12 };
    });
    lib.uploadMedia.mockResolvedValue(undefined);
    URL.createObjectURL = vi.fn(() => 'blob:reel');
    URL.revokeObjectURL = vi.fn();
  });

  it('gera o Reel com o texto sugerido, mostra a prévia e salva na biblioteca como MP4', async () => {
    wrap(<MarketingMedia />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Criar Reel' }))[0]);
    expect(screen.getByLabelText('Gancho (abre o vídeo)').value).toBe('Ainda monta treino em planilha?');
    fireEvent.change(screen.getByLabelText('Título (junto do print)'), { target: { value: 'Treino em segundos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Reel' }));
    await waitFor(() => expect(reelVideo.renderReel).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: 'https://eafit.com.br/img/app/treino.webp', hook: 'Ainda monta treino em planilha?', title: 'Treino em segundos',
    })));
    expect(await screen.findByLabelText('Prévia do Reel')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar na biblioteca' }));
    await waitFor(() => expect(lib.uploadMedia).toHaveBeenCalled());
    const arg = lib.uploadMedia.mock.calls[0][0];
    expect([arg.file.type, arg.title, arg.width, arg.height, arg.adminId]).toEqual(['video/mp4', 'Reel · Treino em segundos', 1080, 1920, 'admin-1']);
    const link = await screen.findByRole('link', { name: /adicione à fila/ });
    expect(link.getAttribute('href')).toBe('/marketing?aba=fila');
  });

  it('avisa quando o navegador não gera vídeo e trava o botão', async () => {
    reelVideo.canRenderReels.mockReturnValue(false);
    wrap(<MarketingMedia />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Criar Reel' }))[0]);
    expect(screen.getByText(/Este navegador não gera vídeo/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gerar Reel' }).disabled).toBe(true);
  });

  it('mostra o erro do codificador sem travar a tela', async () => {
    reelVideo.renderReel.mockRejectedValue(new Error('Este navegador não codifica áudio AAC'));
    wrap(<MarketingMedia />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Criar Reel' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Reel' }));
    expect(await screen.findByText(/Erro: Este navegador não codifica áudio AAC/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gerar Reel' }).disabled).toBe(false);
  });
});

describe('Gerador de story em vídeo', () => {
  beforeEach(() => {
    reelVideo.canRenderReels.mockReturnValue(true);
    reelVideo.renderStory.mockImplementation(async ({ onProgress }) => {
      onProgress(0.5);
      return { blob: new Blob(['mp4'], { type: 'video/mp4' }), width: 1080, height: 1920, seconds: 8 };
    });
    lib.uploadMedia.mockResolvedValue(undefined);
    URL.createObjectURL = vi.fn(() => 'blob:story');
    URL.revokeObjectURL = vi.fn();
  });

  it('gera o story com etiqueta, título e música escolhidos e salva na biblioteca como MP4', async () => {
    wrap(<MarketingMedia />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Criar story' }))[0]);
    expect(screen.getByLabelText('Título').value).toBe('Treino pronto em segundos');
    fireEvent.change(screen.getByLabelText(/Etiqueta/), { target: { value: 'DICA' } });
    fireEvent.change(screen.getByLabelText('Visual'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Música'), { target: { value: 'calm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar story' }));
    await waitFor(() => expect(reelVideo.renderStory).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: 'https://eafit.com.br/img/app/treino.webp', pill: 'DICA', title: 'Treino pronto em segundos', style: 'calm', variant: 2,
    })));
    expect(await screen.findByLabelText('Prévia do story')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar na biblioteca' }));
    await waitFor(() => expect(lib.uploadMedia).toHaveBeenCalled());
    const arg = lib.uploadMedia.mock.calls[0][0];
    expect([arg.file.type, arg.title, arg.width, arg.height]).toEqual(['video/mp4', 'Story · Treino pronto em segundos', 1080, 1920]);
  });

  it('trava o botão quando o navegador não gera vídeo', async () => {
    reelVideo.canRenderReels.mockReturnValue(false);
    wrap(<MarketingMedia />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Criar story' }))[0]);
    expect(screen.getByRole('button', { name: 'Gerar story' }).disabled).toBe(true);
  });
});

describe('quadros e trilha do Reel', () => {
  it('trilha: 12 s em estéreo, pico em 0,7 e sempre igual', () => {
    const a = synthTrack(DURATION);
    const b = synthTrack(DURATION);
    expect(a.left.length).toBe(DURATION * a.sampleRate);
    const peak = a.left.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(0.7);
    expect(a.left[1000]).toBe(b.left[1000]);
    expect(a.left[a.left.length - 1]).toBeCloseTo(0, 3); // termina em silêncio
  });

  it('desenha as 3 cenas sem erro em qualquer instante', () => {
    const calls = [];
    const ctx = new Proxy({}, {
      get: (_, name) => (name === 'measureText' ? () => ({ width: 100 }) : name === 'createLinearGradient' || name === 'createRadialGradient'
        ? () => ({ addColorStop() {} }) : (...args) => calls.push([name, args])),
      set: () => true,
    });
    const img = { width: 100, height: 200 };
    for (const t of [0, 1, 3.5, 6, 9.7, 11.9]) drawReelFrame(ctx, { hook: 'Gancho', title: 'Título', sub: 'Sub' }, img, t);
    expect(calls.some(([n]) => n === 'drawImage')).toBe(true); // o print aparece na cena 2
    expect(FPS * DURATION).toBe(288);
  });
});

describe('story em vídeo: quadros e trilha eletrônica', () => {
  it('trilha eletrônica: 8 s em estéreo, pico em 0,7, sempre igual e cada transposição soa diferente', () => {
    const opts = { style: 'electric', sweeps: [STORY_DROP] };
    const a = synthTrack(STORY_DURATION, opts);
    const b = synthTrack(STORY_DURATION, opts);
    const c = synthTrack(STORY_DURATION, { ...opts, shift: 3 });
    expect(a.left.length).toBe(STORY_DURATION * a.sampleRate);
    expect(a.left.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeGreaterThan(0.6);
    expect(a.left.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeLessThanOrEqual(0.7);
    expect(a.left[44100]).toBe(b.left[44100]);
    expect(a.left.some((v, i) => v !== c.left[i])).toBe(true);
    expect(a.left[a.left.length - 1]).toBeCloseTo(0, 3);
  });

  it('desenha todas as variantes sem erro, com o print entrando e o flash do drop', () => {
    const img = { width: 100, height: 200 };
    for (let variant = 0; variant < STORY_VARIANTS.length; variant += 1) {
      const calls = [];
      const ctx = new Proxy({}, {
        get: (_, name) => (name === 'measureText' ? () => ({ width: 100 }) : name === 'createLinearGradient' || name === 'createRadialGradient'
          ? () => ({ addColorStop() {} }) : (...args) => calls.push([name, args])),
        set: () => true,
      });
      for (const t of [0, 0.5, 1.5, STORY_DROP, 2.2, 5, 7.9]) drawStoryFrame(ctx, { pill: 'DICA', title: 'Treino pronto em segundos', sub: 'Sub', variant }, img, t);
      expect(calls.some(([n]) => n === 'drawImage')).toBe(true);
      // chamada para o app em todo story
      expect(calls.some(([n, args]) => n === 'fillText' && /LINK NA BIO/.test(args[0]))).toBe(true);
    }
  });
});

describe('editar e excluir o que já foi publicado', () => {
  const POST = {
    id: 'p8', caption: 'Legenda antiga', format: 'feed', media: [{ type: 'image', url: 'https://x/1.jpg' }], scheduled_at: null, created_at: '2026-10-30T10:00:00Z',
    targets: [
      { id: 't1', account_id: 'a1', status: 'published', permalink: 'https://fb/p' },
      { id: 't2', account_id: 'a2', status: 'published', permalink: 'https://ig/p' },
    ],
  };

  beforeEach(() => { lib.fetchPosts.mockResolvedValue([POST]); });

  it('edita a legenda no Facebook e avisa que o Instagram não deixa', async () => {
    lib.editPost.mockResolvedValue({ changed: false, results: [{ target: 't1', ok: true }, { target: 't2', ok: false, error: 'O Instagram não permite editar a legenda pela API.' }] });
    wrap(<MarketingPublish />, '/?aba=historico');
    fireEvent.click(await screen.findByRole('button', { name: 'Editar legenda' }));
    fireEvent.change(screen.getByLabelText('Nova legenda'), { target: { value: 'Legenda nova' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nas redes que permitem' }));
    await waitFor(() => expect(lib.editPost).toHaveBeenCalledWith('p8', 'Legenda nova'));
    expect(await screen.findByText(/Mudou em Facebook\. Não mudou: Instagram: O Instagram não permite editar/)).toBeTruthy();
  });

  it('legenda mudou em todas as redes: fecha o editor', async () => {
    lib.editPost.mockResolvedValue({ changed: true, results: [{ target: 't1', ok: true }, { target: 't2', ok: true }] });
    wrap(<MarketingPublish />, '/?aba=historico');
    fireEvent.click(await screen.findByRole('button', { name: 'Editar legenda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nas redes que permitem' }));
    expect(await screen.findByText('Legenda atualizada em Facebook, Instagram.')).toBeTruthy();
    expect(screen.queryByLabelText('Nova legenda')).toBeNull();
  });

  it('excluir e republicar: apaga nas redes, cria o post de novo com a legenda nova e publica', async () => {
    lib.deletePost.mockResolvedValue({ removed: true, results: [{ ok: true }, { ok: true }] });
    lib.createPost.mockResolvedValue('p9');
    lib.runPost.mockResolvedValue({ results: [{ id: 'n1', status: 'published' }] });
    wrap(<MarketingPublish />, '/?aba=historico');
    fireEvent.click(await screen.findByRole('button', { name: 'Editar legenda' }));
    fireEvent.change(screen.getByLabelText('Nova legenda'), { target: { value: 'Legenda nova' } });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir e republicar' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Curtidas, comentários e visualizações'));
    await waitFor(() => expect(lib.createPost).toHaveBeenCalledWith({
      caption: 'Legenda nova', media: POST.media, accountIds: ['a1', 'a2'], format: 'feed',
    }));
    expect(lib.deletePost).toHaveBeenCalledWith('p8');
    expect(lib.runPost).toHaveBeenCalledWith('p9');
    expect(await screen.findByText('Excluído e republicado com a legenda nova.')).toBeTruthy();
  });

  it('não republica se alguma rede não conseguiu excluir', async () => {
    lib.deletePost.mockResolvedValue({ removed: false, results: [{ ok: true }, { ok: false, error: 'sem permissão' }] });
    wrap(<MarketingPublish />, '/?aba=historico');
    fireEvent.click(await screen.findByRole('button', { name: 'Editar legenda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir e republicar' }));
    expect(await screen.findByText(/Nada foi republicado/)).toBeTruthy();
    expect(lib.createPost).not.toHaveBeenCalled();
  });

  it('Resultados: edita só posts do Facebook e exclui posts feitos direto na rede', async () => {
    lib.fetchMetrics.mockResolvedValue([
      { account_id: 'a2', external_id: 'm1', permalink: 'https://ig/1', caption: 'Post do Instagram', kind: 'image', thumb_url: null, posted_at: new Date().toISOString(), likes: 1, comments: 0, shares: null, saves: null, reach: null, views: null, insights_ok: false },
      { account_id: 'a1', external_id: 'f1', permalink: 'https://fb/1', caption: 'Post do Facebook', kind: 'image', thumb_url: null, posted_at: new Date().toISOString(), likes: 2, comments: 0, shares: 0, saves: null, reach: null, views: null, insights_ok: false },
    ]);
    lib.fetchConversion.mockResolvedValue([]);
    lib.deleteExternalPost.mockResolvedValue({ removed: true });
    lib.editExternalPost.mockResolvedValue({ changed: true });
    wrap(<MarketingResults />);
    const edits = await screen.findAllByRole('button', { name: 'Editar legenda' });
    expect(edits.length).toBe(1); // só o do Facebook

    fireEvent.click(edits[0]);
    fireEvent.change(screen.getByLabelText('Nova legenda'), { target: { value: 'Texto novo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(lib.editExternalPost).toHaveBeenCalledWith('a1', 'f1', 'Texto novo'));

    fireEvent.click(screen.getAllByRole('button', { name: 'Excluir' })[0]);
    await waitFor(() => expect(lib.deleteExternalPost).toHaveBeenCalled());
    expect(await screen.findByText('Post excluído.')).toBeTruthy();
  });
});

describe('Agenda: editar e excluir o que já saiu', () => {
  const sent = { id: 'q1', format: 'feed', position: 1, caption: 'Legenda publicada', media: [{ type: 'image', url: 'https://x/1.jpg' }], post_id: 'p20', posted_at: new Date().toISOString() };
  const POST = {
    id: 'p20', caption: 'Legenda publicada', format: 'feed', media: sent.media, scheduled_at: null, created_at: new Date().toISOString(),
    targets: [{ id: 't1', account_id: 'a1', status: 'published', permalink: 'https://fb/p' }],
  };

  beforeEach(() => {
    lib.fetchAutopost.mockResolvedValue({ enabled: true, items: [sent], pending: [], skipped: [], posted: 1 });
    lib.fetchPosts.mockResolvedValue([POST]);
  });

  it('o item já publicado traz Editar legenda e Excluir direto na Agenda', async () => {
    lib.deletePost.mockResolvedValue({ removed: true, results: [{ ok: true }] });
    wrap(<MarketingPublish />);
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('apagado em 1 rede(s)'));
    await waitFor(() => expect(lib.deletePost).toHaveBeenCalledWith('p20'));
    expect(await screen.findByText('Post excluído.')).toBeTruthy();
  });

  it('edita a legenda sem sair da Agenda', async () => {
    lib.editPost.mockResolvedValue({ changed: true, results: [{ target: 't1', ok: true }] });
    wrap(<MarketingPublish />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar legenda' }));
    fireEvent.change(screen.getByLabelText('Nova legenda'), { target: { value: 'Texto novo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nas redes que permitem' }));
    await waitFor(() => expect(lib.editPost).toHaveBeenCalledWith('p20', 'Texto novo'));
    expect(await screen.findByText('Legenda atualizada em Facebook.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Agenda', selected: true })).toBeTruthy();
  });

  it('item cujo post já foi excluído só mostra o aviso', async () => {
    lib.fetchAutopost.mockResolvedValue({ enabled: true, items: [{ ...sent, post_id: null }], pending: [], skipped: [], posted: 1 });
    wrap(<MarketingPublish />);
    expect(await screen.findByText('Post excluído.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull();
  });
});

describe('stories de nutrição por refeição', () => {
  it('cada refeição tem o seu horário em Brasília: 7h, 12h, 15h (água) e 19h30', () => {
    const pending = [
      { id: 'c', format: 'story', slot: 'cafe' }, { id: 'a', format: 'story', slot: 'almoco' }, { id: 'w', format: 'story', slot: 'agua' },
      { id: 'j', format: 'story', slot: 'jantar' },
    ];
    const sched = autopostSchedule(pending, new Date('2026-11-05T05:00:00Z')); // 2h BRT
    expect(sched.map(x => `${x.item.id}@${x.at.toISOString().slice(0, 16)}`)).toEqual([
      'c@2026-11-05T10:00', 'a@2026-11-05T15:00', 'w@2026-11-05T18:00', 'j@2026-11-05T22:30'
    ]);
  });

  it('o story de nutrição não atrapalha a faixa do story geral', () => {
    expect(laneKey({ format: 'story', slot: 'cafe' })).toBe('story:cafe');
    expect(laneKey({ format: 'story', slot: null })).toBe('story');
    expect(laneKey({ format: 'reel' })).toBe('reel');
    const sched = autopostSchedule([{ id: 'g', format: 'story' }, { id: 'c', format: 'story', slot: 'cafe' }], new Date('2026-11-05T05:00:00Z'));
    expect(sched.map(x => x.lane).sort()).toEqual(['story', 'story:cafe']);
  });

  it('na Fila, o story de nutrição é adicionado com o horário escolhido', async () => {
    lib.fetchAutopost.mockResolvedValue({ enabled: true, items: [], pending: [], skipped: [], posted: 0 });
    lib.addQueueItem.mockResolvedValue(undefined);
    wrap(<MarketingPublish />, '/?aba=fila');
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar à fila' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Story' }));
    fireEvent.change(screen.getByLabelText('Horário do story'), { target: { value: 'almoco' } });
    fireEvent.click(screen.getByRole('button', { name: /Arte treino/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao fim da fila' }));
    await waitFor(() => expect(lib.addQueueItem).toHaveBeenCalledWith({
      format: 'story', slot: 'almoco', caption: '', media: [{ type: 'image', url: 'https://cdn/arte.jpg', title: 'Arte treino' }],
    }));
  });

  it('a Fila mostra uma seção para cada refeição', async () => {
    lib.fetchAutopost.mockResolvedValue({
      enabled: true, items: [], skipped: [], posted: 0,
      pending: [{ id: 's1', format: 'story', slot: 'jantar', position: 1, caption: '', media: [{ type: 'video', url: 'https://x/s.mp4' }] }],
    });
    wrap(<MarketingPublish />, '/?aba=fila');
    expect(await screen.findByText(/Story · Jantar · todo dia às 19h30 \(1 na fila\)/)).toBeTruthy();
    expect(screen.getByText(/Story · Café da manhã · todo dia às 7h \(0 na fila\)/)).toBeTruthy();
  });
});
