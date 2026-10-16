// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { insert, getSession } = vi.hoisted(() => ({ insert: vi.fn(), getSession: vi.fn() }));
vi.mock('./supabase', () => ({
  db: { auth: { getSession }, from: () => ({ insert }) },
}));

let reportError, addBreadcrumb, installErrorReporter;
beforeEach(async () => {
  vi.resetModules();
  insert.mockReset().mockResolvedValue({ error: null });
  getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  ({ reportError, addBreadcrumb, installErrorReporter } = await import('./errorReporter'));
});

describe('reportError', () => {
  it('grava o erro com o usuário e limita o tamanho', async () => {
    await reportError('error', { message: 'x'.repeat(900), stack: 's'.repeat(5000) });
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row.user_id).toBe('u1');
    expect(row.message).toHaveLength(500);
    expect(row.stack).toHaveLength(2000);
  });

  it('não reenvia o mesmo erro', async () => {
    await reportError('error', new Error('boom'));
    await reportError('error', new Error('boom'));
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('para depois de 10 erros distintos na sessão', async () => {
    for (let i = 0; i < 15; i++) await reportError('error', new Error(`e${i}`));
    expect(insert).toHaveBeenCalledTimes(10);
  });

  it('sem login não grava e nunca lança', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(reportError('error', new Error('anon'))).resolves.toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
    insert.mockRejectedValue(new Error('rede'));
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    await expect(reportError('error', new Error('falha'))).resolves.toBeUndefined();
  });
});

describe('contexto do erro', () => {
  it('leva versão, aparelho, onde estourou e o rastro de ações', async () => {
    addBreadcrumb('toque: Salvar');
    addBreadcrumb('rede:   caiu  ');
    await reportError('error', 'Script error.', { where: 'https://x/app.js:10:5' });
    const row = insert.mock.calls[0][0];
    expect(row.app_version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(row.context).toMatchObject({ where: 'https://x/app.js:10:5', online: true, visibility: 'visible' });
    expect(row.context.user_agent).toBeTruthy();
    expect(row.context.trail.map(t => t.e)).toEqual(['toque: Salvar', 'rede: caiu']);
  });

  it('guarda só as 15 últimas ações', async () => {
    for (let i = 0; i < 20; i++) addBreadcrumb(`a${i}`);
    await reportError('error', new Error('x'));
    const { trail } = insert.mock.calls[0][0].context;
    expect(trail).toHaveLength(15);
    expect(trail[0].e).toBe('a5');
  });

  it('tela de erro do React manda a árvore de componentes', async () => {
    await reportError('boundary', new Error('render'), { componentStack: '\n    at Perfil\n    at App' });
    expect(insert.mock.calls[0][0].context.component_stack).toBe('at Perfil\n    at App');
  });

  it('banco sem a coluna context: grava o erro sem ela', async () => {
    insert.mockResolvedValueOnce({ error: { code: '42703' } }).mockResolvedValueOnce({ error: null });
    await reportError('error', new Error('x'));
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[1][0].context).toBeUndefined();
    expect(insert.mock.calls[1][0].message).toBe('x');
  });

  it('o rastro registra toques em botões e marcações, mas não o que foi digitado', async () => {
    const original = console.error;
    try {
      installErrorReporter();
      document.body.innerHTML = `
        <button type="button"><span>💾 Salvar</span></button>
        <label for="c">Lembretes</label><input type="checkbox" id="c" />
        <input type="text" id="nome" value="segredo" />`;
      document.querySelector('span').click();
      document.querySelector('#c').click();
      document.querySelector('#nome').click();
      window.dispatchEvent(new Event('offline'));
      await reportError('error', new Error('depois'));
      const trail = insert.mock.calls[0][0].context.trail.map(t => t.e);
      expect(trail).toEqual(['toque: 💾 Salvar', 'toque: Lembretes → marcado', 'rede: caiu']);
      expect(JSON.stringify(trail)).not.toContain('segredo');
    } finally {
      console.error = original;
      document.body.innerHTML = '';
    }
  });

  it('console.error entra no rastro e continua indo para o console', async () => {
    const original = console.error;
    const spy = vi.fn();
    console.error = spy;
    try {
      installErrorReporter();
      console.error('sync:', new Error('rede indisponível'));
      expect(spy).toHaveBeenCalledTimes(1);
      await reportError('error', new Error('depois'));
      expect(insert.mock.calls[0][0].context.trail.map(t => t.e)).toEqual(['console.error: sync: rede indisponível']);
    } finally {
      console.error = original;
    }
  });
});
