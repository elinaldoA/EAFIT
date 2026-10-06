import { describe, it, expect } from 'vitest';
import { addDays, pausedDaySet, activePause, startPauseFields, endPauseFields } from './pause';

describe('addDays', () => {
  it('soma dias atravessando mês e ano', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('pausedDaySet', () => {
  it('lista todos os dias das pausas e ignora entradas inválidas', () => {
    const set = pausedDaySet([{ from: '2026-10-01', to: '2026-10-03' }, { from: 'x', to: 'y' }, null, { from: '2026-10-09', to: '2026-10-08' }]);
    expect([...set].sort()).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });

  it('limita pausas gigantes', () => {
    expect(pausedDaySet([{ from: '2020-01-01', to: '2026-01-01' }]).size).toBe(60);
  });

  it('aceita nada', () => {
    expect(pausedDaySet(undefined).size).toBe(0);
  });
});

describe('activePause', () => {
  const today = '2026-10-10';

  it('null sem pausa ou com pausa vencida', () => {
    expect(activePause({}, today)).toBeNull();
    expect(activePause({ pausedUntil: '2026-10-09' }, today)).toBeNull();
    expect(activePause({ pausedUntil: 'lixo' }, today)).toBeNull();
  });

  it('ativa até a data (inclusive), com o início do histórico', () => {
    expect(activePause({ pausedUntil: '2026-10-10', pauses: [{ from: '2026-10-05', to: '2026-10-10' }] }, today))
      .toEqual({ from: '2026-10-05', to: '2026-10-10' });
  });

  it('sem histórico correspondente, começa hoje', () => {
    expect(activePause({ pausedUntil: '2026-10-15' }, today)).toEqual({ from: today, to: '2026-10-15' });
  });
});

describe('startPauseFields', () => {
  const today = '2026-10-10';

  it('cria pausa de N dias contando hoje e guarda no histórico', () => {
    expect(startPauseFields({}, today, 7)).toEqual({
      pausedUntil: '2026-10-16', pauses: [{ from: today, to: '2026-10-16' }],
    });
  });

  it('prolongar mantém o início; encurtar não reduz a pausa atual', () => {
    const meta = { pausedUntil: '2026-10-20', pauses: [{ from: '2026-10-08', to: '2026-10-20' }] };
    expect(startPauseFields(meta, today, 14)).toEqual({ pausedUntil: '2026-10-23', pauses: [{ from: '2026-10-08', to: '2026-10-23' }] });
    expect(startPauseFields(meta, today, 7).pausedUntil).toBe('2026-10-20');
  });

  it('preserva pausas antigas e limita o histórico', () => {
    const old = Array.from({ length: 12 }, (_, i) => ({ from: `2025-01-${String(i + 1).padStart(2, '0')}`, to: `2025-01-${String(i + 1).padStart(2, '0')}` }));
    const out = startPauseFields({ pauses: old }, today, 7);
    expect(out.pauses).toHaveLength(12);
    expect(out.pauses.at(-1)).toEqual({ from: today, to: '2026-10-16' });
  });
});

describe('endPauseFields', () => {
  const today = '2026-10-10';

  it('retomar encerra a pausa ontem', () => {
    const meta = { pausedUntil: '2026-10-16', pauses: [{ from: '2026-10-05', to: '2026-10-16' }] };
    expect(endPauseFields(meta, today)).toEqual({ pausedUntil: null, pauses: [{ from: '2026-10-05', to: '2026-10-09' }] });
  });

  it('pausa que começou hoje some do histórico', () => {
    const meta = { pausedUntil: '2026-10-16', pauses: [{ from: today, to: '2026-10-16' }] };
    expect(endPauseFields(meta, today)).toEqual({ pausedUntil: null, pauses: [] });
  });

  it('sem pausa ativa só garante pausedUntil nulo', () => {
    expect(endPauseFields({ pauses: [{ from: '2026-09-01', to: '2026-09-05' }] }, today))
      .toEqual({ pausedUntil: null, pauses: [{ from: '2026-09-01', to: '2026-09-05' }] });
  });
});
