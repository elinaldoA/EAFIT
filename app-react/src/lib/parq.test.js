import { describe, it, expect } from 'vitest';
import { encodeAnswers, decodeAnswers, allAnswered, hasAlert, healthFields, skipFields, needsHealthScreen, yesQuestions, PARQ_COUNT } from './parq';

const now = new Date('2027-03-01T12:00:00Z');
const daysAgo = n => new Date(now.getTime() - n * 86400000).toISOString();

describe('parq', () => {
  it('codifica e decodifica as respostas', () => {
    const a = [false, true, false, false, false, false, true];
    expect(encodeAnswers(a)).toBe('0100001');
    expect(decodeAnswers('0100001')).toEqual(a);
    expect(decodeAnswers('abc')).toEqual(Array(PARQ_COUNT).fill(null));
    expect(decodeAnswers(undefined)).toEqual(Array(PARQ_COUNT).fill(null));
  });
  it('só vale com as 7 respondidas', () => {
    expect(allAnswered(Array(7).fill(false))).toBe(true);
    expect(allAnswered([false, null, false, false, false, false, false])).toBe(false);
    expect(allAnswered([false])).toBe(false);
  });
  it('alerta quando há algum sim', () => {
    expect(hasAlert(Array(7).fill(false))).toBe(false);
    expect(hasAlert([false, false, true, false, false, false, false])).toBe(true);
  });
  it('monta os campos do perfil e apaga texto vazio', () => {
    const f = healthFields({ answers: [true, false, false, false, false, false, false], lesoes: '  joelho ', restricoes: '', medicamentos: 'x'.repeat(300) }, now);
    expect(f).toMatchObject({ parqVersion: 1, parqAnswers: '1000000', parqAlert: true, parqSkippedAt: null, lesoes: 'joelho', restricoes: null });
    expect(f.medicamentos).toHaveLength(200);
    expect(f.healthConsentAt).toBe(now.toISOString());
  });
  it('pede a tela uma vez a quem nunca respondeu', () => {
    expect(needsHealthScreen({ peso: '80' }, now)).toBe(true);
    expect(needsHealthScreen({}, now)).toBe(false);
    expect(needsHealthScreen(null, now)).toBe(false);
  });
  it('quem pulou volta depois de 30 dias', () => {
    expect(needsHealthScreen({ peso: '80', ...skipFields(new Date(daysAgo(10))) }, now)).toBe(false);
    expect(needsHealthScreen({ peso: '80', parqSkippedAt: daysAgo(31) }, now)).toBe(true);
  });
  it('quem respondeu reconfirma em 12 meses', () => {
    expect(needsHealthScreen({ peso: '80', parqAt: daysAgo(100), parqVersion: 1 }, now)).toBe(false);
    expect(needsHealthScreen({ peso: '80', parqAt: daysAgo(400), parqVersion: 1 }, now)).toBe(true);
    expect(needsHealthScreen({ peso: '80', parqAt: daysAgo(10), parqVersion: 0 }, now)).toBe(true);
  });
  it('lista as perguntas com sim', () => {
    expect(yesQuestions('0100000')).toHaveLength(1);
    expect(yesQuestions('0000000')).toEqual([]);
  });
});
