import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), insert: vi.fn(), del: vi.fn(), audit: vi.fn() }));
vi.mock('./supabase', () => ({
  db: {
    storage: { from: () => ({ upload: h.upload, remove: h.remove }) },
    from: table => (table === 'admin_audit_log'
      ? { insert: h.audit }
      : { insert: h.insert, delete: () => ({ eq: h.del }) }),
  },
}));

import { storagePathFor, validatePromoFile, formatSize, uploadPromoMaterial, removePromoMaterial } from './promoMaterials';

const file = (name, type, size = 1000) => ({ name, type, size });

beforeEach(() => {
  Object.values(h).forEach(fn => fn.mockReset().mockResolvedValue({ error: null }));
});

describe('promoMaterials (admin)', () => {
  it('caminho sem acento nem espaço, com data na frente', () => {
    expect(storagePathFor(file('Logo EAFIT (fundo escuro).PNG', 'image/png'), 123)).toBe('123-logo-eafit-fundo-escuro.png');
    expect(storagePathFor(file('Vídeo', 'video/mp4'), 5)).toBe('5-video');
  });

  it('valida formato e tamanho iguais aos do bucket', () => {
    expect(validatePromoFile(null)).toBe('Escolha um arquivo.');
    expect(validatePromoFile(file('a.exe', 'application/x-msdownload'))).toMatch(/Formato não aceito/);
    expect(validatePromoFile(file('a.mp4', 'video/mp4', 51 * 1024 * 1024))).toMatch(/50 MB/);
    expect(validatePromoFile(file('a.pdf', 'application/pdf'))).toBe('');
  });

  it('formata o tamanho', () => {
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(3.5 * 1024 * 1024)).toBe('3,5 MB');
  });

  it('sobe o arquivo, grava a linha e registra na auditoria', async () => {
    await uploadPromoMaterial({ title: ' Logo ', description: ' PNG ', file: file('logo.png', 'image/png'), adminId: 'adm' });
    expect(h.upload).toHaveBeenCalled();
    expect(h.insert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Logo', description: 'PNG', file_name: 'logo.png', created_by: 'adm' }));
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'promoMaterialUpload' }));
  });

  it('se a linha falhar, apaga o arquivo enviado', async () => {
    h.insert.mockResolvedValue({ error: new Error('rls') });
    await expect(uploadPromoMaterial({ title: 'x', description: '', file: file('a.png', 'image/png'), adminId: 'adm' })).rejects.toThrow('rls');
    expect(h.remove).toHaveBeenCalled();
  });

  it('remove a linha e o arquivo', async () => {
    await removePromoMaterial({ item: { id: 'm1', title: 'Logo', storage_path: 'p.png' }, adminId: 'adm' });
    expect(h.del).toHaveBeenCalledWith('id', 'm1');
    expect(h.remove).toHaveBeenCalledWith(['p.png']);
  });
});
