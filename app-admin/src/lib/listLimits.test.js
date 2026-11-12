import { describe, it, expect } from 'vitest';
import { API_ROW_CAP, capNotice, exportCutNotice } from './listLimits';

describe('exportCutNotice', () => {
  it('não avisa quando veio tudo (ou mais)', () => {
    expect(exportCutNotice(34, 34)).toBe('');
    expect(exportCutNotice(1000, 900)).toBe('');
    expect(exportCutNotice(0, 0)).toBe('');
  });

  it('avisa com os dois números quando veio menos do que existe', () => {
    const msg = exportCutNotice(1000, 2500);
    expect(msg).toContain('1.000 de 2.500');
    expect(msg).toContain('exporte em partes');
  });

  it('valores inválidos não avisam', () => {
    expect(exportCutNotice(undefined, 10)).toBe('');
    expect(exportCutNotice(5, null)).toBe('');
  });
});

describe('capNotice', () => {
  it('só avisa ao chegar no limite do servidor', () => {
    expect(capNotice(API_ROW_CAP - 1)).toBe('');
    expect(capNotice(0)).toBe('');
    expect(capNotice(API_ROW_CAP, 'pessoas')).toMatch(/1\.000 pessoas do servidor/);
    expect(capNotice(API_ROW_CAP + 5)).toMatch(/pode haver mais/);
  });
});
