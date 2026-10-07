// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Banco falso compartilhado pelas libs de acesso a dados deste arquivo.
const state = vi.hoisted(() => ({
  tables: {}, errors: new Set(), calls: [], count: 0, single: null,
  storage: { signed: [], uploadError: null, removed: [], signedOne: { signedUrl: 'https://signed/one' } },
  invoke: { error: null, calls: [] },
}));

function chain(table) {
  const call = { table, ops: [] };
  state.calls.push(call);
  const c = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') {
        return (resolve, reject) => Promise.resolve(
          state.errors.has(table)
            ? { data: null, count: null, error: new Error('falha ' + table) }
            : { data: state.single !== null ? state.single : (state.tables[table] ?? []), count: state.count, error: null },
        ).then(resolve, reject);
      }
      return (...args) => { call.ops.push([prop, ...args]); return c; };
    },
  });
  return c;
}

vi.mock('./supabase', () => ({
  db: {
    from: table => chain(table),
    storage: {
      from: () => ({
        createSignedUrls: () => Promise.resolve({ data: state.storage.signed, error: null }),
        createSignedUrl: () => Promise.resolve({ data: state.storage.signedOne, error: null }),
        upload: () => Promise.resolve({ error: state.storage.uploadError }),
        remove: paths => { state.storage.removed.push(paths); return Promise.resolve({ error: null }); },
      }),
    },
    functions: { invoke: (...a) => { state.invoke.calls.push(a); return Promise.resolve({ error: state.invoke.error }); } },
  },
}));
vi.mock('./imageUtils', async (importActual) => ({
  ...(await importActual()),
  compressImageBlob: () => Promise.resolve(new Blob(['x'], { type: 'image/jpeg' })),
}));

import { BADGES, fetchUnlockedAchievements, syncAchievements } from './achievements';
import { isNotificationSupported, isIosSafariNotInstalled, requestNotificationPermission, isNotifyEnabled, sendNotification } from './notifications';
import { isPushSupported, sendPushToSelf, subscribeToPush, unsubscribeFromPush } from './pushSubscriptions';
import { fetchPhotos, addPhoto, countPhotos, deletePhoto } from './progressPhotos';
import { fetchWeightLogs, upsertWeightLog } from './weightLog';
import { fetchWaterLog, upsertWaterLog, fetchWaterLogsRange } from './waterLog';
import { imcInfo, metaProgress } from './profileCalc';
import { readMode, writeMode, readCachedIsTrainer, writeCachedIsTrainer } from './appMode';
import { isChunkLoadError, reloadOnceForChunkError, clearChunkReloadFlag } from './chunkReload';
import { isKnownUser, markKnownUser } from './knownUser';
import { assertValidImage, MAX_DIMENSION } from './imageUtils';
import { RATING_OPTIONS } from './ratingOptions';
import { LANDING_URL, SHARE_CARD_URL, INVITE_URL } from './links';
import { getModalRoot } from './modalRoot';

const lastCall = () => state.calls[state.calls.length - 1];
const ops = (call, name) => call.ops.filter(o => o[0] === name);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  state.tables = {};
  state.errors.clear();
  state.calls.length = 0;
  state.count = 0;
  state.single = null;
  state.storage = { signed: [], uploadError: null, removed: [], signedOne: { signedUrl: 'https://signed/one' } };
  state.invoke = { error: null, calls: [] };
});
afterEach(() => vi.restoreAllMocks());

describe('achievements', () => {
  const stats = (o = {}) => ({ streakDays: 0, totalTreinos: 0, totalPhotos: 0, totalWeightLogs: 0, ...o });

  it('cada conquista tem id único e regra coerente', () => {
    const ids = BADGES.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(BADGES.find(b => b.id === 'streak_3').check(stats({ streakDays: 3 }))).toBe(true);
    expect(BADGES.find(b => b.id === 'streak_3').check(stats({ streakDays: 2 }))).toBe(false);
    expect(BADGES.find(b => b.id === 'workouts_100').check(stats({ totalTreinos: 100 }))).toBe(true);
    expect(BADGES.find(b => b.id === 'photo_5').check(stats({ totalPhotos: 4 }))).toBe(false);
    expect(BADGES.find(b => b.id === 'weight_30').check(stats({ totalWeightLogs: 30 }))).toBe(true);
  });

  it('syncAchievements grava só as novas e devolve todas', async () => {
    state.tables.achievements = [{ badge_id: 'streak_3' }];
    const res = await syncAchievements('u1', stats({ streakDays: 7, totalTreinos: 10 }));
    expect([...res.newlyEarned.map(b => b.id)].sort()).toEqual(['streak_7', 'workouts_10']);
    expect(res.unlockedIds.has('streak_3')).toBe(true);
    expect(res.unlockedIds.has('streak_7')).toBe(true);
    const upsert = ops(lastCall(), 'upsert')[0];
    expect(upsert[1]).toEqual([{ user_id: 'u1', badge_id: 'streak_7' }, { user_id: 'u1', badge_id: 'workouts_10' }]);
    expect(upsert[2]).toEqual({ onConflict: 'user_id,badge_id' });
  });

  it('sem conquistas novas não grava nada', async () => {
    state.tables.achievements = [{ badge_id: 'streak_3' }];
    const res = await syncAchievements('u1', stats({ streakDays: 3 }));
    expect(res.newlyEarned).toEqual([]);
    expect(state.calls.some(c => ops(c, 'upsert').length)).toBe(false);
  });

  it('erro do banco propaga', async () => {
    state.errors.add('achievements');
    await expect(fetchUnlockedAchievements('u1')).rejects.toThrow('falha achievements');
  });
});

describe('notifications', () => {
  it('isNotifyEnabled: ausente conta como ligado; só false desliga', () => {
    expect(isNotifyEnabled({}, 'notifyRecords')).toBe(true);
    expect(isNotifyEnabled(undefined, 'notifyRecords')).toBe(true);
    expect(isNotifyEnabled({ notifyRecords: false }, 'notifyRecords')).toBe(false);
    expect(isNotifyEnabled({ notifyRecords: true }, 'notifyRecords')).toBe(true);
  });

  it('suporte e permissão', async () => {
    delete window.Notification;
    expect(isNotificationSupported()).toBe(false);
    expect(await requestNotificationPermission()).toBe('unsupported');

    window.Notification = { permission: 'granted', requestPermission: vi.fn() };
    expect(await requestNotificationPermission()).toBe('granted');
    window.Notification.permission = 'denied';
    expect(await requestNotificationPermission()).toBe('denied');
    window.Notification.permission = 'default';
    window.Notification.requestPermission.mockResolvedValue('granted');
    expect(await requestNotificationPermission()).toBe('granted');
    delete window.Notification;
  });

  it('sendNotification usa o service worker quando existe, senão o construtor', async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const Ctor = vi.fn();
    Ctor.permission = 'granted';
    window.Notification = Ctor;
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: () => Promise.resolve({ showNotification }) } });
    await sendNotification('Oi', { body: 'x' });
    expect(showNotification).toHaveBeenCalledWith('Oi', { body: 'x' });

    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: () => Promise.resolve(undefined) } });
    await sendNotification('Oi', {});
    expect(Ctor).toHaveBeenCalledWith('Oi', {});

    Ctor.permission = 'denied';
    await expect(sendNotification('Oi')).rejects.toThrow(/denied/);
    delete window.Notification;
    await expect(sendNotification('Oi')).rejects.toThrow(/não suportadas/);
    delete navigator.serviceWorker;
  });

  it('iOS Safari fora da tela de início é detectado', () => {
    const ua = vi.spyOn(navigator, 'userAgent', 'get');
    window.matchMedia = () => ({ matches: false });
    ua.mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(isIosSafariNotInstalled()).toBe(true);
    window.matchMedia = () => ({ matches: true });
    expect(isIosSafariNotInstalled()).toBe(false);
    ua.mockReturnValue('Mozilla/5.0 (Linux; Android 14)');
    window.matchMedia = () => ({ matches: false });
    expect(isIosSafariNotInstalled()).toBe(false);
  });
});

describe('pushSubscriptions', () => {
  it('sem service worker/PushManager não há suporte e inscrever falha com mensagem', async () => {
    delete navigator.serviceWorker;
    expect(isPushSupported()).toBe(false);
    await expect(subscribeToPush('u1')).rejects.toThrow(/não suportadas/);
    await expect(unsubscribeFromPush()).resolves.toBeUndefined();
  });

  it('sem chave VAPID configurada falha dizendo o motivo', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({}) } });
    window.PushManager = function PushManager() {};
    // A chave é lida na importação (e o CI define o secret), então reimporta sem ela.
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    vi.resetModules();
    const { subscribeToPush: subscribeWithoutKey } = await import('./pushSubscriptions');
    await expect(subscribeWithoutKey('u1')).rejects.toThrow(/VITE_VAPID_PUBLIC_KEY/);
    vi.unstubAllEnvs();
    delete navigator.serviceWorker;
    delete window.PushManager;
  });

  it('cancelar a inscrição apaga do banco e do navegador', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const reg = { pushManager: { getSubscription: () => Promise.resolve({ endpoint: 'https://push/1', unsubscribe }) } };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(reg) } });
    window.PushManager = function PushManager() {};
    await unsubscribeFromPush();
    expect(ops(lastCall(), 'delete')).toHaveLength(1);
    expect(ops(lastCall(), 'eq')[0]).toEqual(['eq', 'endpoint', 'https://push/1']);
    expect(unsubscribe).toHaveBeenCalled();
    delete navigator.serviceWorker;
    delete window.PushManager;
  });

  it('sem inscrição ativa não faz nada', async () => {
    const reg = { pushManager: { getSubscription: () => Promise.resolve(null) } };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(reg) } });
    window.PushManager = function PushManager() {};
    await unsubscribeFromPush();
    expect(state.calls).toHaveLength(0);
    delete navigator.serviceWorker;
    delete window.PushManager;
  });

  it('sendPushToSelf chama a Edge Function sem user_id e propaga erro', async () => {
    await sendPushToSelf({ title: 'T', body: 'B', tag: 'x' });
    expect(state.invoke.calls[0]).toEqual(['send-push', { body: { title: 'T', body: 'B', tag: 'x' } }]);
    state.invoke.error = new Error('401');
    await expect(sendPushToSelf({ title: 'T', body: 'B', tag: 'x' })).rejects.toThrow('401');
  });
});

describe('progressPhotos', () => {
  it('fetchPhotos usa o link assinado das novas e o base64 das antigas', async () => {
    state.tables.progress_photos = [
      { id: 'p1', photo_date: '2026-10-01', note: 'a', storage_path: 'u1/a.jpg', image_data: null },
      { id: 'p2', photo_date: '2026-09-01', note: null, storage_path: null, image_data: 'data:AAA' },
    ];
    state.storage.signed = [{ path: 'u1/a.jpg', signedUrl: 'https://signed/a' }];
    expect(await fetchPhotos('u1')).toEqual([
      { id: 'p1', photo_date: '2026-10-01', note: 'a', image_data: 'https://signed/a' },
      { id: 'p2', photo_date: '2026-09-01', note: null, image_data: 'data:AAA' },
    ]);
  });

  it('countPhotos devolve o total (0 quando vazio)', async () => {
    state.count = 7;
    expect(await countPhotos('u1')).toBe(7);
    state.count = null;
    expect(await countPhotos('u1')).toBe(0);
  });

  it('addPhoto valida o arquivo, envia, grava e devolve o link', async () => {
    state.single = { id: 'new', photo_date: '2026-10-07', note: 'nota' };
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    const res = await addPhoto('u1', { file, date: '2026-10-07', note: '  nota  ' });
    expect(res).toEqual({ id: 'new', photo_date: '2026-10-07', note: 'nota', image_data: 'https://signed/one' });
    const insert = ops(lastCall(), 'insert')[0][1];
    expect(insert).toMatchObject({ user_id: 'u1', photo_date: '2026-10-07', note: 'nota' });
    expect(insert.storage_path).toMatch(/^u1\/.+\.jpg$/);
  });

  it('addPhoto rejeita não-imagem e arquivo grande', async () => {
    await expect(addPhoto('u1', { file: new File(['x'], 'a.txt', { type: 'text/plain' }), date: 'd' })).rejects.toThrow('Selecione um arquivo de imagem.');
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'b.jpg', { type: 'image/jpeg' });
    await expect(addPhoto('u1', { file: big, date: 'd' })).rejects.toThrow(/muito grande/);
  });

  it('falha ao gravar no banco remove o arquivo já enviado', async () => {
    state.errors.add('progress_photos');
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    await expect(addPhoto('u1', { file, date: 'd' })).rejects.toThrow();
    expect(state.storage.removed).toHaveLength(1);
    expect(state.storage.removed[0][0]).toMatch(/^u1\//);
  });

  it('deletePhoto apaga o registro e o arquivo do Storage', async () => {
    state.single = { storage_path: 'u1/a.jpg' };
    await deletePhoto('p1', 'u1');
    expect(state.storage.removed).toEqual([['u1/a.jpg']]);
  });

  it('deletePhoto de foto antiga (sem arquivo) não mexe no Storage', async () => {
    state.single = { storage_path: null };
    await deletePhoto('p2', 'u1');
    expect(state.storage.removed).toEqual([]);
  });
});

describe('weightLog e waterLog', () => {
  it('fetchWeightLogs renomeia weight para peso', async () => {
    state.tables.weight_logs = [{ log_date: '2026-10-01', weight: 80 }];
    expect(await fetchWeightLogs('u1')).toEqual([{ log_date: '2026-10-01', peso: 80 }]);
  });

  it('upsertWeightLog e upsertWaterLog gravam por usuário e dia', async () => {
    await upsertWeightLog('u1', '2026-10-01', 80);
    expect(ops(lastCall(), 'upsert')[0].slice(1)).toEqual([{ user_id: 'u1', log_date: '2026-10-01', weight: 80 }, { onConflict: 'user_id,log_date' }]);
    await upsertWaterLog('u1', '2026-10-01', 1500);
    expect(ops(lastCall(), 'upsert')[0].slice(1)).toEqual([{ user_id: 'u1', log_date: '2026-10-01', amount_ml: 1500 }, { onConflict: 'user_id,log_date' }]);
  });

  it('fetchWaterLog devolve a quantidade ou null; o período devolve as linhas', async () => {
    state.single = { amount_ml: 2000 };
    expect(await fetchWaterLog('u1', '2026-10-01')).toBe(2000);
    state.single = null;
    state.tables.water_logs = [];
    expect(await fetchWaterLogsRange('u1', '2026-09-01')).toEqual([]);
  });

  it('erros do banco propagam', async () => {
    state.errors.add('weight_logs');
    await expect(fetchWeightLogs('u1')).rejects.toThrow();
    await expect(upsertWeightLog('u1', 'd', 1)).rejects.toThrow();
    state.errors.add('water_logs');
    await expect(fetchWaterLog('u1', 'd')).rejects.toThrow();
  });
});

describe('profileCalc', () => {
  it('IMC e classificação nas faixas', () => {
    expect(imcInfo(70, 175)).toEqual({ value: '22.9', cls: 'Peso normal' });
    expect(imcInfo(50, 180).cls).toBe('Abaixo do peso');
    expect(imcInfo(85, 175).cls).toBe('Sobrepeso');
    expect(imcInfo(100, 175).cls).toBe('Obesidade grau I');
    expect(imcInfo(130, 175).cls).toBe('Obesidade grau II+');
  });

  it('IMC sem dados válidos devolve null', () => {
    expect(imcInfo(0, 175)).toBeNull();
    expect(imcInfo(70, 0)).toBeNull();
    expect(imcInfo(20, 175)).toBeNull();
    expect(imcInfo(70, 90)).toBeNull();
  });

  it('meta de peso: alcançada, em andamento e sem dados', () => {
    expect(metaProgress(78, 78, [])).toEqual({ done: true, msg: '🎉 Meta de peso alcançada!' });
    const p = metaProgress(85, 80, [{ peso: 90 }]);
    expect(p.done).toBe(false);
    expect(p.pct).toBe(50);
    expect(p.msg).toBe('Faltam 5.0kg para a meta de 80kg');
    expect(metaProgress(null, 80, [])).toBeNull();
    expect(metaProgress(85, null, [])).toBeNull();
  });

  it('o progresso fica entre 0 e 100', () => {
    expect(metaProgress(95, 80, [{ peso: 90 }]).pct).toBe(0);
  });
});

describe('appMode, knownUser e chunkReload', () => {
  it('modo padrão é trainer; guarda aluno; lembra se o usuário é personal', () => {
    expect(readMode()).toBe('trainer');
    writeMode('aluno');
    expect(readMode()).toBe('aluno');
    expect(readCachedIsTrainer('u1')).toBe(false);
    writeCachedIsTrainer('u1', true);
    expect(readCachedIsTrainer('u1')).toBe(true);
    expect(readCachedIsTrainer('u2')).toBe(false);
    writeCachedIsTrainer('u1', false);
    expect(readCachedIsTrainer('u1')).toBe(false);
  });

  it('aparelho conhecido', () => {
    expect(isKnownUser()).toBe(false);
    markKnownUser();
    expect(isKnownUser()).toBe(true);
  });

  it('storage bloqueado não quebra nada', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readMode()).toBe('trainer');
    expect(readCachedIsTrainer('u1')).toBe(false);
    expect(isKnownUser()).toBe(false);
    expect(() => { writeMode('aluno'); markKnownUser(); writeCachedIsTrainer('u1', true); }).not.toThrow();
  });

  it('reconhece erros de chunk de deploy novo', () => {
    expect(isChunkLoadError({ name: 'ChunkLoadError' })).toBe(true);
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: x'))).toBe(true);
    expect(isChunkLoadError('error loading dynamically imported module')).toBe(true);
    expect(isChunkLoadError(new Error('outro erro'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it('recarrega só uma vez por sessão e libera depois de 15s', () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
    expect(reloadOnceForChunkError()).toBe(true);
    expect(reloadOnceForChunkError()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);

    clearChunkReloadFlag();
    vi.advanceTimersByTime(15_000);
    expect(reloadOnceForChunkError()).toBe(true);
    Object.defineProperty(window, 'location', { configurable: true, value: original });
    vi.useRealTimers();
  });
});

describe('imageUtils, ratingOptions, links e modalRoot', () => {
  it('assertValidImage', () => {
    expect(() => assertValidImage(new File(['x'], 'a.png', { type: 'image/png' }), 1024)).not.toThrow();
    expect(() => assertValidImage(new File(['x'], 'a.pdf', { type: 'application/pdf' }), 1024)).toThrow();
    expect(() => assertValidImage({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }, 5 * 1024 * 1024)).toThrow('Imagem muito grande (máx. 5MB).');
    expect(MAX_DIMENSION).toBe(1024);
  });

  it('a escala de avaliação vai de 1 a 5, em ordem', () => {
    expect(RATING_OPTIONS.map(o => o.value)).toEqual([1, 2, 3, 4, 5]);
    expect(RATING_OPTIONS.every(o => o.label)).toBe(true);
  });

  it('os links de compartilhamento identificam a origem', () => {
    expect(SHARE_CARD_URL).toBe(`${LANDING_URL}?origem=card`);
    expect(INVITE_URL).toBe(`${LANDING_URL}?origem=convite`);
  });

  it('o modal vai dentro do .shell quando existe, senão no body', () => {
    expect(getModalRoot()).toBe(document.body);
    const shell = document.createElement('div');
    shell.className = 'shell';
    document.body.appendChild(shell);
    expect(getModalRoot()).toBe(shell);
    shell.remove();
  });
});
