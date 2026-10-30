import { describe, it, expect, vi } from 'vitest';
vi.mock('./supabase', () => ({ db: {} }));
import {
  parseCSV, parseImportDate, parseImportDuration, parseImportSource, parseSetsInText, parseWorkoutCSV, parseWorkoutText,
  summarizeImport, workoutJSONToRows,
} from './workoutImport';

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

describe('outros formatos', () => {
  it('lê TSV e tabela com título acima do cabeçalho', () => {
    const tsv = 'Meus treinos\n\nData\tExercício\tCarga\tReps\n15/01/2024\tSupino\t40\t10\n15/01/2024\tSupino\t42,5\t8\n';
    const { sessions, error } = parseImportSource({ text: tsv });
    expect(error).toBeNull();
    expect(sessions[0].exercises[0].sets.map(s => s.carga)).toEqual([40, 42.5]);
  });

  it('aceita data serial do Excel nas linhas da planilha', () => {
    expect(parseImportDate('45306')).toBe('2024-01-15');
    const { sessions } = parseImportSource({ rows: [['Ficha'], ['data', 'exercicio', 'peso', 'reps'], ['45306', 'Remada', '30', '12']] });
    expect(sessions[0].date).toBe('2024-01-15');
  });

  it('lê JSON aninhado (treino > exercícios > séries) e JSON em linhas', () => {
    const nested = JSON.stringify({ workouts: [{
      title: 'Push', start_time: '2024-01-15T10:00:00Z', end_time: '2024-01-15T11:00:00Z',
      exercises: [{ title: 'Supino', sets: [{ type: 'warmup', weight_kg: 20, reps: 10 }, { type: 'normal', weight_kg: 60, reps: 8 }] }],
    }] });
    const out = parseImportSource({ rows: workoutJSONToRows(nested) });
    expect(out.sessions[0]).toEqual(expect.objectContaining({ date: '2024-01-15', durationSeconds: 3600, notes: 'Push' }));
    expect(out.sessions[0].exercises[0].sets).toEqual([expect.objectContaining({ carga: 60, reps: 8 })]);

    const flat = JSON.stringify([{ date: '2024-01-16', exercise: 'Agachamento', weight: 80, reps: 5 }]);
    expect(parseImportSource({ rows: workoutJSONToRows(flat) }).sessions[0].exercises[0].nome).toBe('Agachamento');
  });
});

describe('texto livre (PDF, foto, txt)', () => {
  it('entende séries escritas de vários jeitos', () => {
    expect(parseSetsInText('Supino reto 4x10 40kg')).toEqual(Array(4).fill({ weight: 40, reps: 10, distance: null, seconds: null }));
    expect(parseSetsInText('Rosca 3 séries de 12')).toHaveLength(3);
    expect(parseSetsInText('Leg press 100 kg x 10, 120kg × 8').map(s => [s.weight, s.reps])).toEqual([[100, 10], [120, 8]]);
    expect(parseSetsInText('Prancha 3x30s')).toEqual(Array(3).fill({ weight: null, reps: null, distance: null, seconds: 30 }));
    expect(parseSetsInText('Esteira 30 min 5 km')).toEqual([{ weight: null, reps: null, distance: 5, seconds: 1800 }]);
    expect(parseSetsInText('Supino 4 x 10 100 lbs')[0].weight).toBe(45.4);
    expect(parseSetsInText('Treino A')).toEqual([]);
  });

  it('monta treinos por data, com nome em linha própria e linhas de série', () => {
    const text = [
      'Treino A - 15/01/2024',
      '1. Supino reto 4x10 40kg',
      'Agachamento livre',
      'Série 1: 60 kg x 10',
      'Série 2: 70 kg x 8',
      '',
      '17 de janeiro de 2024',
      '• Esteira 20 min 3 km',
      '18/01/24 Remada curvada 3x12 30kg',
    ].join('\n');
    const { sessions, error, undated } = parseWorkoutText(text);
    expect(error).toBeNull();
    expect(undated).toBe(false);
    expect(sessions.map(s => s.date)).toEqual(['2024-01-18', '2024-01-17', '2024-01-15']);
    const a = sessions[2];
    expect(a.notes).toBe('Treino A');
    expect(a.exercises.map(e => e.nome)).toEqual(['Supino reto', 'Agachamento livre']);
    expect(a.exercises[1].sets.map(s => [s.carga, s.reps])).toEqual([[60, 10], [70, 8]]);
    expect(sessions[1].exercises[0].sets[0]).toEqual(expect.objectContaining({ distanciaKm: 3, duracaoMin: 20 }));
    expect(sessions[0].exercises[0]).toEqual(expect.objectContaining({ nome: 'Remada curvada' }));
  });

  it('sem data no texto, usa o dia escolhido', () => {
    const out = parseImportSource({ text: 'Ficha de treino\nPuxada frontal 3x12 35kg\nCrucifixo 3x15' }, '2024-02-01');
    expect(out.undated).toBe(true);
    expect(out.sessions[0].date).toBe('2024-02-01');
    expect(out.sessions[0].exercises.map(e => e.nome)).toEqual(['Puxada frontal', 'Crucifixo']);
    expect(parseImportSource({ text: 'nada aqui' }, '2024-02-01').error).toBe('none');
  });
});
