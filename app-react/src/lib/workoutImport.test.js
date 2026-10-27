import { describe, it, expect, vi } from 'vitest';
vi.mock('./supabase', () => ({ db: {} }));
import { parseCSV, parseImportDate, parseImportDuration, parseWorkoutCSV, summarizeImport } from './workoutImport';

describe('parseCSV', () => {
  it('lida com aspas, vírgula no campo e ponto e vírgula', () => {
    expect(parseCSV('a,b\n"x, y","z ""q"""\n')).toEqual([['a', 'b'], ['x, y', 'z "q"']]);
    expect(parseCSV('a;b\r\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('datas e durações', () => {
  it('entende os formatos do Strong, Hevy e BR', () => {
    expect(parseImportDate('2024-01-15 10:30:00')).toBe('2024-01-15');
    expect(parseImportDate('15 Jan 2024, 10:30')).toBe('2024-01-15');
    expect(parseImportDate('15/01/2024')).toBe('2024-01-15');
    expect(parseImportDate('31/02/2024')).toBeNull();
    expect(parseImportDate('lixo')).toBeNull();
  });
  it('converte durações', () => {
    expect(parseImportDuration('1h 5m')).toBe(3900);
    expect(parseImportDuration('45m')).toBe(2700);
    expect(parseImportDuration('1:05:00')).toBe(3900);
    expect(parseImportDuration('')).toBeNull();
  });
});

describe('parseWorkoutCSV', () => {
  const strong = [
    'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
    '2024-01-15 10:30:00,Push,1h 5m,Supino,1,60,10,0,0,,,',
    '2024-01-15 10:30:00,Push,1h 5m,Supino,2,62.5,8,0,0,,,',
    '2024-01-15 10:30:00,Push,1h 5m,Prancha,1,0,0,0,60,,,',
    '2024-01-15 10:30:00,Push,1h 5m,Esteira,1,0,0,5,1800,,,',
    '2024-01-17 08:00:00,Pull,45m,Remada,1,40,12,0,0,,,',
  ].join('\n');

  it('agrupa por dia e classifica força, isométrico e cardio', () => {
    const { sessions, error } = parseWorkoutCSV(strong);
    expect(error).toBeNull();
    expect(sessions.map(s => s.date)).toEqual(['2024-01-17', '2024-01-15']);
    const push = sessions[1];
    expect(push.dayOfWeek).toBe('Segunda');
    expect(push.durationSeconds).toBe(3900);
    const [sup, pran, est] = push.exercises;
    expect(sup.sets).toEqual([
      expect.objectContaining({ n: 1, carga: 60, reps: 10 }),
      expect.objectContaining({ n: 2, carga: 62.5, reps: 8 }),
    ]);
    expect(pran.sets[0]).toEqual(expect.objectContaining({ duracaoS: 60, reps: null }));
    expect(est.sets[0]).toEqual(expect.objectContaining({ distanciaKm: 5, duracaoMin: 30 }));
    expect(summarizeImport(sessions)).toEqual({ treinos: 2, exercicios: 4, series: 5 });
  });

  it('lê o formato do Hevy e ignora aquecimento', () => {
    const hevy = [
      'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
      'Leg day,"15 Jan 2024, 10:30","15 Jan 2024, 11:30",,Agachamento,,,0,warmup,20,10,,,',
      'Leg day,"15 Jan 2024, 10:30","15 Jan 2024, 11:30",,Agachamento,,,1,normal,80,8,,,',
    ].join('\n');
    const { sessions, skipped } = parseWorkoutCSV(hevy);
    expect(skipped).toBe(1);
    expect(sessions[0].exercises[0].sets).toHaveLength(1);
    expect(sessions[0].exercises[0].sets[0]).toEqual(expect.objectContaining({ carga: 80, reps: 8 }));
  });

  it('avisa quando o arquivo não é de treino', () => {
    expect(parseWorkoutCSV('a,b\n1,2').error).toBe('columns');
    expect(parseWorkoutCSV('').error).toBe('empty');
  });
});
