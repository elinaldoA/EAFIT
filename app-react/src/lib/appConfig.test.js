import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { normalizeConfig, isFlagOn, safeLink, movedTarget, DEFAULT_CONFIG } from './appConfig';

describe('normalizeConfig', () => {
  it('sem linhas devolve o padrão (tudo liberado)', () => {
    expect(normalizeConfig([])).toEqual(DEFAULT_CONFIG);
    expect(normalizeConfig(null)).toEqual(DEFAULT_CONFIG);
  });

  it('lê manutenção, banner e flags', () => {
    const cfg = normalizeConfig([
      { key: 'maintenance', value: { enabled: true, message: '  Voltamos já  ' } },
      { key: 'banner', value: { enabled: true, message: 'Novidade!', level: 'success', linkUrl: 'https://eafit.app', linkLabel: 'Ver', version: 3 } },
      { key: 'flags', value: { fotos_progresso: false, convite_amigos: true } },
    ]);
    expect(cfg.maintenance).toEqual({ enabled: true, message: 'Voltamos já' });
    expect(cfg.banner).toMatchObject({ enabled: true, message: 'Novidade!', level: 'success', linkUrl: 'https://eafit.app', version: 3 });
    expect(cfg.flags).toEqual({ fotos_progresso: false, convite_amigos: true });
  });

  it('banner sem mensagem não aparece, mesmo ligado', () => {
    const cfg = normalizeConfig([{ key: 'banner', value: { enabled: true, message: '   ' } }]);
    expect(cfg.banner.enabled).toBe(false);
  });

  it('só considera "true" literal como ligado e descarta flags não booleanas', () => {
    const cfg = normalizeConfig([
      { key: 'maintenance', value: { enabled: 'true' } },
      { key: 'flags', value: { a: 'false', b: false } },
    ]);
    expect(cfg.maintenance.enabled).toBe(false);
    expect(cfg.flags).toEqual({ b: false });
  });

  it('nível inválido volta para info', () => {
    expect(normalizeConfig([{ key: 'banner', value: { enabled: true, message: 'x', level: 'neon' } }]).banner.level).toBe('info');
  });
});

describe('mudança de endereço', () => {
  const moved = (value) => normalizeConfig([{ key: 'moved', value }]).moved;

  it('só liga com "true" literal e endereço https', () => {
    expect(moved({ enabled: true, url: ' https://eafit.com.br/app/ ' })).toEqual({ enabled: true, url: 'https://eafit.com.br/app/' });
    expect(moved({ enabled: true, url: '/app/' }).enabled).toBe(false);
    expect(moved({ enabled: true, url: 'javascript:alert(1)' }).enabled).toBe(false);
    expect(moved({ enabled: 'true', url: 'https://eafit.com.br/' }).enabled).toBe(false);
  });

  it('movedTarget só devolve o endereço novo pra quem está no antigo', () => {
    const on = { enabled: true, url: 'https://eafit.com.br/app/' };
    expect(movedTarget(on, 'elinaldoa.github.io')).toBe('https://eafit.com.br/app/');
    expect(movedTarget(on, 'eafit.com.br')).toBe('');
    expect(movedTarget(on, 'localhost')).toBe('');
    expect(movedTarget({ enabled: false, url: on.url }, 'elinaldoa.github.io')).toBe('');
    expect(movedTarget(undefined, 'elinaldoa.github.io')).toBe('');
  });
});

describe('isFlagOn', () => {
  it('ausente = ligado; só false desliga', () => {
    expect(isFlagOn({}, 'x')).toBe(true);
    expect(isFlagOn(undefined, 'x')).toBe(true);
    expect(isFlagOn({ x: true }, 'x')).toBe(true);
    expect(isFlagOn({ x: false }, 'x')).toBe(false);
  });
});

describe('safeLink', () => {
  it('aceita http(s) e caminho relativo, recusa o resto', () => {
    expect(safeLink('https://a.com/x')).toBe('https://a.com/x');
    expect(safeLink('/EAFIT/')).toBe('/EAFIT/');
    expect(safeLink('javascript:alert(1)')).toBe('');
    expect(safeLink('data:text/html,x')).toBe('');
    expect(safeLink(null)).toBe('');
  });
});
