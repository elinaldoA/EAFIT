// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./barcodeZxing', () => ({
  createZxingDetector: vi.fn(() => ({ detect: async () => 'zxing', kind: 'zxing' })),
}));

import { canUseCamera, createBarcodeDetector } from './barcodeScan';
import { createZxingDetector } from './barcodeZxing';

describe('barcodeScan', () => {
  afterEach(() => {
    delete window.BarcodeDetector;
    vi.clearAllMocks();
  });

  it('usa o BarcodeDetector do navegador quando ele lê EAN', async () => {
    window.BarcodeDetector = class {
      static async getSupportedFormats() { return ['qr_code', 'ean_13']; }
      async detect() { return [{ rawValue: '7891000100103' }]; }
    };
    const det = await createBarcodeDetector();
    expect(await det.detect({})).toBe('7891000100103');
    expect(createZxingDetector).not.toHaveBeenCalled();
  });

  it('cai para o zxing sem BarcodeDetector (Safari/iPhone)', async () => {
    const det = await createBarcodeDetector();
    expect(det.kind).toBe('zxing');
  });

  it('cai para o zxing quando o BarcodeDetector não lê EAN/UPC', async () => {
    window.BarcodeDetector = class {
      static async getSupportedFormats() { return ['qr_code']; }
    };
    expect((await createBarcodeDetector()).kind).toBe('zxing');
  });

  it('quadro sem código no leitor nativo devolve null', async () => {
    window.BarcodeDetector = class {
      static async getSupportedFormats() { return ['ean_13']; }
      async detect() { return []; }
    };
    expect(await (await createBarcodeDetector()).detect({})).toBeNull();
  });

  it('canUseCamera depende só do getUserMedia', () => {
    const orig = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => {} }, configurable: true });
    expect(canUseCamera()).toBe(true);
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    expect(canUseCamera()).toBe(false);
    Object.defineProperty(navigator, 'mediaDevices', { value: orig, configurable: true });
  });
});
