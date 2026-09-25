import { describe, it, expect, vi } from 'vitest';

// generatePlan agora busca o template-base em public.workout_templates
// primeiro (editável via app-admin) e só cai pros arrays locais (testados
// aqui) se o fetch falhar — força a falha pra continuar testando a lógica
// local de IMC/nível sem depender de rede.
vi.mock('../lib/supabase', () => ({
  db: { from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'offline' } }) }) }) }) },
}));

const { computeImcBracket, applyImcAdjustment, applyLevelAdjustment, generatePlan } = await import('./workoutTemplates');

describe('computeImcBracket', () => {
  it('classifica cada faixa de IMC corretamente', () => {
    expect(computeImcBracket(50, 180)).toBe('abaixo');      // IMC ~15.4
    expect(computeImcBracket(70, 175)).toBe('normal');      // IMC ~22.9
    expect(computeImcBracket(85, 175)).toBe('sobrepeso');   // IMC ~27.8
    expect(computeImcBracket(100, 170)).toBe('obesidade');  // IMC ~34.6
  });

  it('cai para "normal" quando peso ou altura são inválidos', () => {
    expect(computeImcBracket(0, 180)).toBe('normal');
    expect(computeImcBracket(80, 0)).toBe('normal');
    expect(computeImcBracket(NaN, 180)).toBe('normal');
  });
});

function fixtureDays() {
  const treino = (dia, foco, pos = []) => ({
    dia, foco,
    exercicios: [{ nome: `Exercício ${dia}`, series: '4', reps: '8-10', descanso: '90s', tecnica: '' }],
    pos,
  });
  return [
    treino('Segunda', 'Peito', [{ nome: '🔷 Abdominal', series: '3', reps: '15', descanso: '45s', tecnica: '' }, { nome: '🏃 Cardio — Esteira', series: '-', reps: '20min', descanso: '-', tecnica: '' }]),
    treino('Terça', 'Costas'),
    treino('Quarta', 'Pernas'),
    treino('Quinta', 'Ombro'),
    treino('Sexta', 'Posterior'),
    { dia: 'Sábado', foco: 'Cardio Leve / Recuperação', exercicios: [{ nome: 'Caminhada', series: '-', reps: '30min', descanso: '-', tecnica: '' }], pos: [] },
    { dia: 'Domingo', foco: 'Descanso Total', exercicios: [{ nome: 'Sem treino', series: '-', reps: '-', descanso: '-', tecnica: '' }], pos: [] },
  ];
}

describe('applyImcAdjustment', () => {
  it('preserva as 7 entradas (uma por dia) em qualquer faixa', () => {
    for (const bracket of ['abaixo', 'normal', 'sobrepeso', 'obesidade']) {
      expect(applyImcAdjustment(fixtureDays(), bracket)).toHaveLength(7);
    }
  });

  it('"normal" não altera o conteúdo', () => {
    expect(applyImcAdjustment(fixtureDays(), 'normal')).toEqual(fixtureDays());
  });

  it('"abaixo" remove o cardio (🏃) dos dias de treino', () => {
    const result = applyImcAdjustment(fixtureDays(), 'abaixo');
    const segunda = result.find(d => d.dia === 'Segunda');
    expect(segunda.pos.some(p => p.nome.startsWith('🏃'))).toBe(false);
  });

  it('"sobrepeso" garante cardio (🏃) nos dias de treino que não têm', () => {
    const result = applyImcAdjustment(fixtureDays(), 'sobrepeso');
    const terca = result.find(d => d.dia === 'Terça');
    expect(terca.pos.some(p => p.nome.startsWith('🏃'))).toBe(true);
  });

  it('"obesidade" rebaixa os 2 últimos dias de treino para cardio leve e reduz volume dos demais', () => {
    const result = applyImcAdjustment(fixtureDays(), 'obesidade');
    const quinta = result.find(d => d.dia === 'Quinta');
    const sexta = result.find(d => d.dia === 'Sexta');
    const segunda = result.find(d => d.dia === 'Segunda');

    expect(quinta.foco).toBe('Cardio Leve / Recuperação');
    expect(sexta.foco).toBe('Cardio Leve / Recuperação');
    expect(segunda.exercicios[0].series).toBe('3'); // 4 - 1
  });
});

describe('applyLevelAdjustment', () => {
  function fixture() {
    return [
      {
        dia: 'Segunda', foco: 'Peito',
        exercicios: [{ nome: 'Supino Reto com Barra', series: '4', reps: '8-10', descanso: '90s', tecnica: 'x' }],
        pos: [{ nome: '🏃 Cardio', series: '-', reps: '20min', descanso: '-', tecnica: '' }],
      },
      { dia: 'Domingo', foco: 'Descanso Total', exercicios: [{ nome: 'Sem treino', series: '-', reps: '-', descanso: '-', tecnica: '' }], pos: [] },
    ];
  }

  it('não altera nada para "intermediario" (ou nível vazio)', () => {
    expect(applyLevelAdjustment(fixture(), 'intermediario')).toEqual(fixture());
    expect(applyLevelAdjustment(fixture(), undefined)).toEqual(fixture());
  });

  it('"iniciante" troca por variação guiada, reduz série e aumenta descanso', () => {
    const [segunda] = applyLevelAdjustment(fixture(), 'iniciante');
    const ex = segunda.exercicios[0];
    expect(ex.nome).toBe('Supino Reto na Máquina');
    expect(ex.series).toBe('3'); // 4 - 1
    expect(ex.descanso).toBe('105s'); // 90s + 15s
  });

  it('"avancado" troca por variação mais exigente, aumenta série e reduz descanso', () => {
    const [segunda] = applyLevelAdjustment(fixture(), 'avancado');
    const ex = segunda.exercicios[0];
    expect(ex.nome).toBe('Supino Reto com Barra (pausa no peito)');
    expect(ex.series).toBe('5'); // 4 + 1
    expect(ex.descanso).toBe('75s'); // 90s - 15s
  });

  it('não mexe em dias de descanso/cardio nem em itens de cardio (🏃) do pós-treino', () => {
    const [segunda, domingo] = applyLevelAdjustment(fixture(), 'avancado');
    expect(segunda.pos).toEqual(fixture()[0].pos);
    expect(domingo).toEqual(fixture()[1]);
  });
});

describe('generatePlan', () => {
  it('gera um plano de 7 dias para cada objetivo', async () => {
    for (const meta of ['massa', 'forca', 'emagrecer', 'definicao', 'saude', 'resistencia']) {
      const plan = await generatePlan({ peso: 80, altura: 178, meta, nivel: 'intermediario' });
      expect(plan).toHaveLength(7);
    }
  });

  // A semana de treino do app é Segunda–Sexta (TreinoPage) — a Sexta não
  // pode vir como descanso/cardio leve pra quem está com IMC normal.
  it('a Sexta é dia de treino em todos os objetivos', async () => {
    for (const meta of ['massa', 'forca', 'emagrecer', 'definicao', 'saude', 'resistencia']) {
      const plan = await generatePlan({ peso: 70, altura: 175, meta, nivel: 'intermediario' });
      const sexta = plan.find(d => d.dia === 'Sexta');
      expect(sexta.foco).not.toMatch(/Cardio Leve|Descanso/);
      expect(sexta.exercicios.length).toBeGreaterThan(0);
    }
  });

  it('cai no template de "saude" para um objetivo desconhecido', async () => {
    const plan = await generatePlan({ peso: 80, altura: 178, meta: 'inexistente', nivel: 'intermediario' });
    expect(plan).toHaveLength(7);
  });
});
