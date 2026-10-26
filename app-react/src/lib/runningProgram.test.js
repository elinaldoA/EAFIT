import { describe, it, expect } from 'vitest';
import { buildRunningProgram, buildRunningMaintenance, effectiveGoal, goalWeeks, RUN_GOALS } from './runningProgram';
import { isCardioItem, parsePlannedMinutes } from './cardio';

const allItems = p => p.weeks.flatMap(w => w.days.flatMap(d => d.exercicios));
const runsOf = week => week.days.filter(d => !/Descanso/.test(d.foco));

describe('buildRunningProgram — estrutura', () => {
  it('semanas por objetivo', () => {
    expect(buildRunningProgram({ goal: '5k', nivel: 'intermediario' }).weeks).toHaveLength(8);
    expect(buildRunningProgram({ goal: '10k', nivel: 'intermediario' }).weeks).toHaveLength(10);
    expect(buildRunningProgram({ goal: 'meia', nivel: 'intermediario' }).weeks).toHaveLength(12);
  });

  it('toda semana tem 7 dias na ordem Segunda..Domingo', () => {
    for (const goal of RUN_GOALS) {
      for (const nivel of ['iniciante', 'intermediario', 'avancado']) {
        for (const w of buildRunningProgram({ goal, nivel }).weeks) {
          expect(w.days.map(d => d.dia)).toEqual(['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']);
          w.days.forEach(d => expect(Array.isArray(d.exercicios) && Array.isArray(d.pos)).toBe(true));
        }
      }
    }
  });

  it('dias de corrida por nível: 3, 4 e 5 (sem contar cross-training)', () => {
    const count = nivel => {
      const w = buildRunningProgram({ goal: '10k', nivel }).weeks[2];
      return runsOf(w).filter(d => d.foco !== 'Cross-training').length;
    };
    expect(count('iniciante')).toBe(3);
    expect(count('intermediario')).toBe(4);
    expect(count('avancado')).toBe(5);
  });

  it('nomes das semanas e nível desconhecido vira intermediário', () => {
    const p = buildRunningProgram({ goal: '5k', nivel: 'xyz' });
    expect(p.nivel).toBe('intermediario');
    expect(p.weeks[0].name).toBe('Corrida 5K · semana 1 de 8');
    expect(buildRunningProgram({ goal: 'inexistente', nivel: 'avancado' }).goal).toBe('5k');
  });
});

describe('iniciante', () => {
  it('meia maratona cai no 10K', () => {
    expect(effectiveGoal('meia', 'iniciante')).toBe('10k');
    expect(effectiveGoal('meia', 'intermediario')).toBe('meia');
    expect(goalWeeks('meia', 'iniciante')).toBe(10);
    expect(buildRunningProgram({ goal: 'meia', nivel: 'iniciante' }).goal).toBe('10k');
  });

  it('começa alternando corre/caminha e vira corrida contínua', () => {
    const p = buildRunningProgram({ goal: '5k', nivel: 'iniciante' });
    const first = p.weeks[0].days[0].exercicios[0];
    expect(first.nome).toBe('Caminhada e Corrida Alternadas');
    expect(first.reps).toMatch(/1min corre \/ 2min caminha/);
    const w8easy = p.weeks[7].days[0].exercicios[0];
    expect(w8easy.nome).toBe('Corrida Leve (Trote)');
  });

  it('o tempo corrido só sobe aos poucos', () => {
    const p = buildRunningProgram({ goal: '10k', nivel: 'iniciante' });
    const longs = p.weeks.slice(0, -1).map(w => parsePlannedMinutes(w.days[5].exercicios[0].reps));
    for (let i = 1; i < longs.length; i++) expect(longs[i] - longs[i - 1]).toBeLessThanOrEqual(5);
  });
});

describe('progressão do longão', () => {
  it('nunca salta mais de 10 min de uma semana para a outra (sem contar o taper)', () => {
    for (const goal of RUN_GOALS) {
      for (const nivel of ['intermediario', 'avancado']) {
        const p = buildRunningProgram({ goal, nivel });
        const longs = p.weeks.slice(0, -2).map(w => parsePlannedMinutes(w.days[5].exercicios[0].reps));
        for (let i = 1; i < longs.length; i++) {
          expect(longs[i]).toBeGreaterThanOrEqual(longs[i - 1]);
          expect(longs[i] - longs[i - 1]).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  it('a penúltima semana alivia antes da prova', () => {
    const p = buildRunningProgram({ goal: 'meia', nivel: 'intermediario' });
    const peak = parsePlannedMinutes(p.weeks[9].days[5].exercicios[0].reps);
    const taper = parsePlannedMinutes(p.weeks[10].days[5].exercicios[0].reps);
    expect(taper).toBeLessThan(peak);
  });
});

describe('semana da prova', () => {
  it('a última semana termina na prova com a distância do objetivo', () => {
    const expected = { '5k': '5km', '10k': '10km', 'meia': '21.1km' };
    for (const goal of RUN_GOALS) {
      const p = buildRunningProgram({ goal, nivel: 'avancado' });
      const sat = p.weeks[p.weeks.length - 1].days[5].exercicios[0];
      expect(sat.reps).toBe(`${expected[goal]} · ritmo de prova`);
    }
  });

  it('só há uma prova no programa e nenhum treino forte na semana dela', () => {
    const p = buildRunningProgram({ goal: '10k', nivel: 'avancado' });
    expect(allItems(p).filter(i => /prova/.test(i.reps))).toHaveLength(1);
    const last = p.weeks[p.weeks.length - 1];
    expect(last.days.flatMap(d => d.exercicios).some(i => /HIIT|Ritmo$/.test(i.nome))).toBe(false);
  });
});

describe('compatibilidade com o registro de cardio', () => {
  it('todo item de corrida é cardio sem séries e tem minutos ou km no texto', () => {
    const p = buildRunningProgram({ goal: '10k', nivel: 'avancado' });
    allItems(p).filter(i => i.nome !== 'Sem treino').forEach(i => {
      expect(i.series).toBe('-');
      expect(isCardioItem(i)).toBe(true);
      expect(/\d+min|\d+(\.\d+)?km|x400m/.test(i.reps)).toBe(true);
    });
  });
});

describe('buildRunningMaintenance', () => {
  it('semana de 7 dias com 2 rodagens e 1 longão', () => {
    const w = buildRunningMaintenance({ nivel: 'intermediario' });
    expect(w).toHaveLength(7);
    expect(w.filter(d => d.foco === 'Cardio Leve / Recuperação')).toHaveLength(2);
    expect(w.filter(d => d.foco === 'Corrida Longa')).toHaveLength(1);
  });
});
