// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { lib, music } = vi.hoisted(() => ({
  lib: {
    fetchAccounts: vi.fn(), fetchMedia: vi.fn(), fetchPosts: vi.fn(), createPost: vi.fn(), runPost: vi.fn(), deletePost: vi.fn(),
    cancelPost: vi.fn(), retryTarget: vi.fn(), startConnect: vi.fn(), disconnectAccount: vi.fn(),
    fetchComments: vi.fn(), syncComments: vi.fn(), replyComment: vi.fn(), hideComment: vi.fn(), fetchTikTokCreator: vi.fn(),
    uploadMedia: vi.fn(), fetchScheduledStories: vi.fn(), setStoryMedia: vi.fn(),
  },
  music: { renderStoryWithMusic: vi.fn(), mediaDuration: vi.fn() },
}));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/marketing', async orig => ({ ...(await orig()), ...lib }));
vi.mock('../lib/storyMusic', async orig => ({ ...(await orig()), ...music }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));

import MarketingPublish from './MarketingPublish';
import MarketingAccounts from './MarketingAccounts';
import MarketingComments from './MarketingComments';
import { autoMusicStart, containRect, formatSec, planAutoMusic, validateStoryMusic } from '../lib/storyMusic';
import {
  EMPTY_TIKTOK, countHashtags, exerciseVideoList, fillReply, finalCaption, firstName, tiktokLabel, tiktokPayload, validatePost, wrapLines,
} from '../lib/marketing';

const wrap = (ui, path = '/') => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

const FB = { id: 'a1', platform: 'facebook', name: 'EAFIT', username: null, status: 'ok', parent_id: null, connected_at: '2026-10-30T10:00:00Z' };
const IG = { id: 'a2', platform: 'instagram', name: 'EAFIT', username: 'eafit', status: 'ok', parent_id: 'a1', connected_at: '2026-10-30T10:00:00Z' };
const TH = { id: 'a3', platform: 'threads', name: 'EAFIT', username: 'eafit', status: 'reconnect', status_detail: 'expirou', parent_id: null, connected_at: '2026-10-30T10:00:00Z' };
const ART = { id: 'm1', kind: 'image', url: 'https://cdn/arte.jpg', title: 'Arte treino', credit: null, storage_path: 'arte.jpg' };
const SONG = { id: 'm9', kind: 'audio', url: 'https://cdn/batida.mp3', title: 'Batida forte', credit: null, storage_path: 'batida.mp3' };

beforeEach(() => {
  vi.clearAllMocks();
  lib.fetchAccounts.mockResolvedValue([FB, IG, TH]);
  lib.fetchMedia.mockResolvedValue([ART]);
  lib.fetchPosts.mockResolvedValue([]);
  lib.createPost.mockResolvedValue('p1');
  lib.runPost.mockResolvedValue({ results: [{ id: 't1', status: 'published' }, { id: 't2', status: 'processing' }] });
  lib.fetchComments.mockResolvedValue([]);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  music.mediaDuration.mockResolvedValue(120);
  music.renderStoryWithMusic.mockResolvedValue({ blob: new Blob(['mp4'], { type: 'video/mp4' }), width: 1080, height: 1920 });
  lib.uploadMedia.mockResolvedValue({ path: 'story.mp4', url: 'https://cdn/story.mp4' });
  lib.fetchScheduledStories.mockResolvedValue([]);
  lib.setStoryMedia.mockResolvedValue();
  URL.createObjectURL = vi.fn(() => 'blob:prévia');
  URL.revokeObjectURL = vi.fn();
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

  it('valida a música do story: duração entre 3 e 60 s e trecho dentro da música', () => {
    const base = { mediaType: 'image', imageSec: 15, start: 0, musicSec: 120 };
    expect(validateStoryMusic(base)).toEqual([]);
    expect(validateStoryMusic({ ...base, imageSec: 2 })).toContain('O story com música precisa ter de 3 a 60 segundos.');
    expect(validateStoryMusic({ ...base, start: 110 })).toContain('A música acaba antes do story: comece em até 1:45.');
    expect(validateStoryMusic({ ...base, musicSec: null })).toEqual(['Aguarde: lendo a duração da música.']);
    // Vídeo longo é cortado em 60 s; a música precisa cobrir isso.
    expect(validateStoryMusic({ mediaType: 'video', videoSec: 90, start: 0, musicSec: 50 }))
      .toContain('A música acaba antes do story: comece em até 0:00.');
    expect(validateStoryMusic({ mediaType: 'video', videoSec: 90, start: 30, musicSec: 120 })).toEqual([]);
    expect(formatSec(75.6)).toBe('1:15');
  });

  it('música automática: só stories de imagem, músicas se revezando, um vídeo por par arte + música', () => {
    const img = (id, url) => ({ id, media: [{ type: 'image', url }] });
    const stories = [img('s1', 'agua.png'), img('s2', 'bomdia.png'), { id: 'v1', media: [{ type: 'video', url: 'r.mp4' }] }, img('s3', 'agua.png'), img('s4', 'agua.png')];
    const plan = planAutoMusic(stories, [{ id: 'A' }, { id: 'B' }]);
    expect(plan.map(g => [g.imageUrl, g.track.id, g.postIds])).toEqual([
      ['agua.png', 'A', ['s1', 's3']], ['bomdia.png', 'B', ['s2']], ['agua.png', 'B', ['s4']],
    ]);
    expect(planAutoMusic(stories, [])).toEqual([]);
    expect(autoMusicStart(120, 15)).toBe(24);
    expect(autoMusicStart(16, 15)).toBe(1);
  });

  it('encaixa a mídia inteira no story 9:16, centralizada', () => {
    expect(containRect(1080, 1350)).toEqual({ x: 0, y: 285, w: 1080, h: 1350 });
    expect(containRect(540, 960)).toEqual({ x: 0, y: 0, w: 1080, h: 1920 });
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

  it('story com música: monta o vídeo, salva na biblioteca e publica o vídeo', async () => {
    lib.fetchMedia.mockResolvedValue([SONG, ART]);
    wrap(<MarketingPublish />);
    fireEvent.click(await screen.findByLabelText('Story'));
    // Música não aparece entre as mídias do post.
    expect(await screen.findByRole('button', { name: /Arte treino/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Batida forte/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Arte treino/ }));
    fireEvent.change(screen.getByLabelText('Música'), { target: { value: 'm9' } });
    expect(await screen.findByText(/a música tem 2:00/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Duração do story (segundos)'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar agora' }));

    await waitFor(() => expect(lib.createPost).toHaveBeenCalledWith(expect.objectContaining({
      format: 'story', media: [expect.objectContaining({ type: 'video', url: 'https://cdn/story.mp4' })],
    })));
    expect(music.renderStoryWithMusic).toHaveBeenCalledWith(expect.objectContaining({
      mediaUrl: 'https://cdn/arte.jpg', mediaType: 'image', musicUrl: 'https://cdn/batida.mp3', start: 0, duration: 20,
    }));
    expect(lib.uploadMedia).toHaveBeenCalledWith(expect.objectContaining({ title: 'Story com música · Arte treino', adminId: 'adm1' }));
  });

  it('story com música: avisa quando a música acaba antes do story', async () => {
    lib.fetchMedia.mockResolvedValue([SONG, ART]);
    music.mediaDuration.mockResolvedValue(10);
    wrap(<MarketingPublish />);
    fireEvent.click(await screen.findByLabelText('Story'));
    fireEvent.click(await screen.findByRole('button', { name: /Arte treino/ }));
    fireEvent.change(screen.getByLabelText('Música'), { target: { value: 'm9' } });
    expect(await screen.findByText('A música acaba antes do story: comece em até 0:00.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publicar agora' }).disabled).toBe(true);
  });

  it('música automática: monta os vídeos e troca a mídia dos stories de imagem da fila', async () => {
    lib.fetchMedia.mockResolvedValue([SONG, ART]);
    lib.fetchScheduledStories.mockResolvedValueOnce([
      { id: 's1', media: [{ type: 'image', url: 'https://cdn/arte.jpg' }] },
      { id: 's2', media: [{ type: 'image', url: 'https://cdn/arte.jpg' }] },
      { id: 'v1', media: [{ type: 'video', url: 'https://cdn/reels.mp4' }] },
    ]);
    wrap(<MarketingPublish />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pôr música em 2 story(s)' }));
    expect(await screen.findByText('2 story(s) agendado(s) agora saem com música.')).toBeTruthy();
    // Um vídeo só para a mesma arte com a mesma música; começa a 20% (24 s de 120 s).
    expect(music.renderStoryWithMusic).toHaveBeenCalledTimes(1);
    expect(music.renderStoryWithMusic).toHaveBeenCalledWith(expect.objectContaining({ mediaUrl: 'https://cdn/arte.jpg', start: 24, duration: 15 }));
    const media = [{ type: 'video', url: 'https://cdn/story.mp4', music: 'Batida forte', source: 'https://cdn/arte.jpg' }];
    expect(lib.setStoryMedia.mock.calls).toEqual([['s1', media], ['s2', media]]);
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
