import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { profileFormFromMetadata, profileFieldsToSave, computeImc, describeAppData } from './userDetailHelpers';

const row = (rows, label) => rows.find(([l]) => l === label)?.[1];

describe('formulário do perfil', () => {
  it('traz todos os campos que o app grava, números como texto', () => {
    expect(profileFormFromMetadata({ nome: 'Ana', idade: 30, peso: 0, weeklyGoal: '4', macroAgua: '2.8' })).toEqual({
      nome: 'Ana', sobrenome: '', apelido: '', sexo: '', idade: '30', peso: '0', altura: '',
      meta: 'massa', nivel: 'intermediario', pesoAlvo: '', weeklyGoal: '4', macroAgua: '2.8',
    });
  });

  it('não grava metas em branco (o app usa o padrão)', () => {
    expect(profileFieldsToSave({ nome: 'Ana', weeklyGoal: ' ', macroAgua: '' })).toEqual({ nome: 'Ana' });
    expect(profileFieldsToSave({ weeklyGoal: '3', macroAgua: '2' })).toEqual({ weeklyGoal: '3', macroAgua: '2' });
  });
});

describe('dados do app', () => {
  it('IMC só com peso e altura válidos', () => {
    expect(computeImc(80, 180)).toBe(24.7);
    expect(computeImc('', 180)).toBeNull();
  });

  it('padrões quando nada foi gravado', () => {
    const rows = describeAppData({}, {});
    expect(row(rows, 'E-mail confirmado')).toBe('não');
    expect(row(rows, 'Idioma do app')).toBe('Português (padrão)');
    expect(row(rows, 'Treinos por semana (meta)')).toBe('5 (padrão)');
    expect(row(rows, 'Meta de água')).toBe('—');
    expect(row(rows, 'Horário de treino')).toBe('não informado');
    expect(row(rows, 'Notificações')).toBe('todas ligadas');
    expect(row(rows, 'E-mails de resumo e novidades')).toBe('ligados');
    expect(row(rows, 'Treinador por voz')).toBe('desligado');
    expect(row(rows, 'Pausas')).toBe('nenhuma');
  });

  it('descreve o que foi gravado', () => {
    const rows = describeAppData({
      peso: 70, macroAgua: '3.2', trainingHour: 7, notifyEmail: false, notifyStreakRisk: false,
      coachEnabled: true, coachTone: 'zoeira', coachFrequency: 'light', coachRate: 1.2,
      pauses: [1, 2, 3, 4].map(i => ({ from: `2026-0${i}-01`, to: `2026-0${i}-03` })),
    }, { email_confirmed_at: '2026-10-01T12:00:00Z' });
    expect(row(rows, 'E-mail confirmado')).toMatch(/^sim, em /);
    expect(row(rows, 'Meta de água')).toBe('3,2 L por dia (definida pelo usuário)');
    expect(row(rows, 'Horário de treino')).toBe('por volta das 07h');
    expect(row(rows, 'Notificações')).toBe('desligadas: Sequência em risco');
    expect(row(rows, 'E-mails de resumo e novidades')).toBe('desligados');
    expect(row(rows, 'Treinador por voz')).toBe('ligado · tom zoeira · só o essencial · velocidade 1,2x');
    expect(row(rows, 'Pausas')).toBe('01/04/2026 a 03/04/2026 · 01/03/2026 a 03/03/2026 · 01/02/2026 a 03/02/2026 (+1 anteriores)');
  });

  it('meta de água calculada pelo peso quando o usuário não definiu', () => {
    expect(row(describeAppData({ peso: 80 }), 'Meta de água')).toBe('2,8 L por dia (calculada pelo peso)');
  });
});
