import { describe, it, expect, vi } from 'vitest';
import { reportPushEvent } from './pushEvents';

const registration = (sub) => ({ pushManager: { getSubscription: vi.fn().mockResolvedValue(sub) } });

describe('reportPushEvent', () => {
  it('envia endpoint, campanha e evento', async () => {
    const fetchFn = vi.fn().mockResolvedValue({});
    await reportPushEvent(registration({ endpoint: 'https://push/abc' }), 'camp-1', 'received', fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toMatch(/\/functions\/v1\/push-event$/);
    expect(JSON.parse(init.body)).toEqual({ endpoint: 'https://push/abc', campaign: 'camp-1', event: 'received' });
  });

  it('sem campanha ou sem inscrição não envia nada', async () => {
    const fetchFn = vi.fn();
    await reportPushEvent(registration({ endpoint: 'x' }), undefined, 'clicked', fetchFn);
    await reportPushEvent(registration(null), 'camp-1', 'clicked', fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('falha de rede não propaga', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(reportPushEvent(registration({ endpoint: 'x' }), 'camp-1', 'received', fetchFn)).resolves.toBeUndefined();
  });
});
