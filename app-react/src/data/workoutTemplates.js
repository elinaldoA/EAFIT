import { db } from '../lib/supabase';
import { treinoData } from './treinoData';
import { computeImcBracket, applyImcAdjustment, applyLevelAdjustment, NIVEIS, getSaferAlternative } from './workoutAdjustments';

export { computeImcBracket, applyImcAdjustment, applyLevelAdjustment, NIVEIS, getSaferAlternative };

// 6 templates base — um por objetivo (`meta`). O de 'massa' reaproveita o
// plano estático padrão (treinoData) como está. Os focos usados aqui só
// usam tokens já presentes em MUSCLE_MAP (treinoData.js), senão o heatmap
// muscular no dashboard silenciosamente ignora o dia.
//
// Desde a introdução do backoffice administrativo, estes arrays deixaram de
// ser a fonte principal: generatePlan busca a versão atual em
// public.workout_templates (editável via app-admin) e só cai pra estes
// arrays locais se o fetch falhar (rede indisponível, etc.) — mesmo
// espírito de resiliência de lib/syncQueue.js, que já trata a rede como não
// garantida neste app.

const FORCA = [
    { dia: 'Segunda', foco: 'Peito / Tríceps', exercicios: [
        { nome: 'Supino Reto com Barra',         series: '5', reps: '3-5', descanso: '3min', tecnica: 'Carga alta, técnica travada' },
        { nome: 'Supino Inclinado com Halteres', series: '4', reps: '5-6', descanso: '2min', tecnica: 'Controle na descida' },
        { nome: 'Tríceps Testa com Barra W',      series: '3', reps: '6-8', descanso: '90s', tecnica: 'Cotovelos fixos' },
    ], pos: [
        { nome: '🔷 Prancha com Peso', series: '3', reps: '45s', descanso: '45s', tecnica: 'Isometria com carga' },
    ]},
    { dia: 'Terça', foco: 'Costas / Bíceps', exercicios: [
        { nome: 'Levantamento Terra',        series: '5', reps: '3-5', descanso: '3min', tecnica: 'Quadril e core travados' },
        { nome: 'Remada Curvada com Barra',  series: '4', reps: '5-6', descanso: '2min', tecnica: 'Escápula ativa' },
        { nome: 'Rosca Direta Barra W',       series: '3', reps: '6-8', descanso: '90s', tecnica: 'Sem balanço' },
    ], pos: []},
    { dia: 'Quarta', foco: 'Pernas / Quadríceps', exercicios: [
        { nome: 'Agachamento Livre',    series: '5', reps: '3-5', descanso: '3min', tecnica: 'Profundo (paralelo)' },
        { nome: 'Leg Press 45°',        series: '4', reps: '5-6', descanso: '2min', tecnica: 'Amplitude máxima' },
        { nome: 'Panturrilha em Pé',    series: '4', reps: '8-10', descanso: '60s', tecnica: '2s de estiramento' },
    ], pos: []},
    { dia: 'Quinta', foco: 'Ombro / Força', exercicios: [
        { nome: 'Desenvolvimento com Barra',     series: '5', reps: '3-5', descanso: '3min', tecnica: 'Lombar apoiada' },
        { nome: 'Elevação Lateral com Halteres', series: '3', reps: '8-10', descanso: '60s', tecnica: 'Leve inclinação' },
        { nome: 'Farmer Walk',                    series: '3', reps: '30s', descanso: '60s', tecnica: 'Grip + Core' },
    ], pos: []},
    { dia: 'Sexta', foco: 'Posterior / Glúteos', exercicios: [
        { nome: 'Romeno com Barra',       series: '5', reps: '3-5', descanso: '3min', tecnica: 'Estiramento máximo' },
        { nome: 'Cadeira Flexora (Deitado)', series: '4', reps: '6-8', descanso: '90s', tecnica: 'Pausa no pico' },
        { nome: 'Elevação Pélvica',        series: '4', reps: '8-10', descanso: '60s', tecnica: 'Pausa 3s no topo' },
    ], pos: []},
    { dia: 'Sábado', foco: 'Cardio Leve / Recuperação', exercicios: [
        { nome: 'Caminhada Rápida ou Bicicleta', series: '-', reps: '30-40min', descanso: '-', tecnica: '5-6km/h ou 130bpm' },
    ], pos: []},
    { dia: 'Domingo', foco: 'Descanso Total', exercicios: [
        { nome: 'Sem treino', series: '-', reps: '-', descanso: '-', tecnica: 'Recuperação ativa' },
    ], pos: []},
];

const EMAGRECER = [
    { dia: 'Segunda', foco: 'Superiores', exercicios: [
        { nome: 'Supino Reto com Halteres', series: '3', reps: '15-20', descanso: '30s', tecnica: 'Circuito, ritmo constante' },
        { nome: 'Puxada Aberta Frente',     series: '3', reps: '15-20', descanso: '30s', tecnica: 'Circuito, ritmo constante' },
        { nome: 'Desenvolvimento Arnold',   series: '3', reps: '15-20', descanso: '30s', tecnica: 'Circuito, ritmo constante' },
    ], pos: [
        { nome: '🔷 Abdominal Polia (Corda)',   series: '3', reps: '15-20', descanso: '30s', tecnica: 'Pico de contração' },
        { nome: '🏃 Cardio — Esteira',           series: '-', reps: '20min · Moderado', descanso: '-', tecnica: '' },
    ]},
    { dia: 'Terça', foco: 'Pernas / Quadríceps', exercicios: [
        { nome: 'Agachamento Livre',   series: '4', reps: '15-20', descanso: '30s', tecnica: 'Ritmo constante' },
        { nome: 'Leg Press 45°',       series: '3', reps: '15-20', descanso: '30s', tecnica: 'Amplitude completa' },
        { nome: 'Afundo Búlgaro',      series: '3', reps: '15-20 cada', descanso: '30s', tecnica: 'Pé elevado atrás' },
    ], pos: [
        { nome: '🏃 Cardio — Escada', series: '-', reps: '25min · Moderado', descanso: '-', tecnica: '' },
    ]},
    { dia: 'Quarta', foco: 'Cardio Leve / Recuperação', exercicios: [
        { nome: 'Caminhada Rápida ou Bicicleta', series: '-', reps: '40min', descanso: '-', tecnica: '6km/h ou 135bpm' },
    ], pos: []},
    { dia: 'Quinta', foco: 'Posterior / Glúteos', exercicios: [
        { nome: 'Romeno com Barra',          series: '3', reps: '15-20', descanso: '30s', tecnica: 'Ritmo constante' },
        { nome: 'Cadeira Flexora (Deitado)', series: '3', reps: '15-20', descanso: '30s', tecnica: 'Negativa lenta' },
        { nome: 'Elevação Pélvica',           series: '3', reps: '15-20', descanso: '30s', tecnica: 'Pausa 2s no topo' },
    ], pos: [
        { nome: '🏃 Cardio — Caminhada Inclinada', series: '-', reps: '25min · 8% inclinação', descanso: '-', tecnica: '' },
    ]},
    { dia: 'Sexta', foco: 'Superiores', exercicios: [
        { nome: 'Remada Unilateral com Halter',  series: '3', reps: '15-20', descanso: '30s', tecnica: 'Circuito' },
        { nome: 'Elevação Lateral com Halteres', series: '3', reps: '15-20', descanso: '30s', tecnica: 'Leve inclinação' },
        { nome: 'Tríceps Corda na Polia',         series: '3', reps: '15-20', descanso: '30s', tecnica: 'Full ROM' },
    ], pos: [
        { nome: '🏃 Cardio — Esteira', series: '-', reps: '20min · Moderado', descanso: '-', tecnica: '' },
    ]},
    { dia: 'Sábado', foco: 'Cardio Leve / Recuperação', exercicios: [
        { nome: 'Caminhada Rápida ou Bicicleta', series: '-', reps: '40min', descanso: '-', tecnica: '5-6km/h ou 130bpm' },
    ], pos: []},
    { dia: 'Domingo', foco: 'Descanso Total', exercicios: [
        { nome: 'Sem treino', series: '-', reps: '-', descanso: '-', tecnica: 'Recuperação ativa' },
    ], pos: []},
];

const DEFINICAO = [
    { dia: 'Segunda', foco: 'Peito / Ombro / Tríceps', exercicios: [
        { nome: 'Supino Reto com Barra',          series: '4', reps: '10-12', descanso: '60s', tecnica: 'Cadência controlada' },
        { nome: 'Desenvolvimento com Barra',      series: '3', reps: '10-12', descanso: '60s', tecnica: 'Lombar apoiada' },
        { nome: 'Tríceps Corda na Polia',          series: '3', reps: '12-15', descanso: '45s', tecnica: 'Full ROM' },
    ], pos: [
        { nome: '🔷 Abdominal Polia (Corda)', series: '3', reps: '15-20', descanso: '30s', tecnica: 'Pico de contração' },
        { nome: '🏃 Cardio — Esteira',         series: '-', reps: '15min · Moderado', descanso: '-', tecnica: '' },
    ]},
    { dia: 'Terça', foco: 'Costas / Bíceps', exercicios: [
        { nome: 'Puxada Aberta Frente',      series: '4', reps: '10-12', descanso: '60s', tecnica: 'Tronco inclinado' },
        { nome: 'Remada Curvada com Barra',  series: '3', reps: '10-12', descanso: '60s', tecnica: 'Escápula ativa' },
        { nome: 'Rosca Direta Barra W',       series: '3', reps: '12-15', descanso: '45s', tecnica: 'Sem balanço' },
    ], pos: [
        { nome: '🔷 Bicicleta no Solo', series: '3', reps: '20 cada perna', descanso: '30s', tecnica: 'Movimento alternado' },
        { nome: '🏃 Cardio — Escada',   series: '-', reps: '15min · Moderado', descanso: '-', tecnica: '' },
    ]},
    { dia: 'Quarta', foco: 'Pernas / Quadríceps', exercicios: [
        { nome: 'Agachamento Livre',    series: '4', reps: '10-12', descanso: '75s', tecnica: 'Profundo (paralelo)' },
        { nome: 'Leg Press 45°',        series: '3', reps: '12-15', descanso: '60s', tecnica: 'Amplitude máxima' },
        { nome: 'Panturrilha em Pé',    series: '3', reps: '15-20', descanso: '45s', tecnica: 'Pico de contração' },
    ], pos: [
        { nome: '🔷 Crunch Invertido (banco)', series: '3', reps: '15', descanso: '30s', tecnica: 'Levanta quadril' },
        { nome: '🏃 Cardio — Caminhada Leve',    series: '-', reps: '15min', descanso: '-', tecnica: '' },
    ]},
    { dia: 'Quinta', foco: 'Posterior / Glúteos', exercicios: [
        { nome: 'Romeno com Barra',          series: '4', reps: '10-12', descanso: '60s', tecnica: 'Estiramento máximo' },
        { nome: 'Cadeira Flexora (Deitado)', series: '3', reps: '12-15', descanso: '45s', tecnica: 'Pausa no pico' },
        { nome: 'Elevação Pélvica',           series: '3', reps: '15-20', descanso: '45s', tecnica: 'Pausa 3s no topo' },
    ], pos: [
        { nome: '🔷 Roda (Ab Wheel)', series: '3', reps: '10-12', descanso: '30s', tecnica: 'Extensão total core' },
        { nome: '🏃 Cardio — Escada', series: '-', reps: '15min · Moderado', descanso: '-', tecnica: '' },
    ]},
    { dia: 'Sexta', foco: 'Cardio Leve / Recuperação', exercicios: [
        { nome: 'Caminhada Rápida ou Bicicleta', series: '-', reps: '30-40min', descanso: '-', tecnica: '5-6km/h ou 130bpm' },
    ], pos: []},
    { dia: 'Sábado', foco: 'Cardio Leve / Recuperação', exercicios: [
        { nome: 'Caminhada Rápida ou Bicicleta', series: '-', reps: '30min', descanso: '-', tecnica: '5-6km/h ou 130bpm' },
    ], pos: []},
    { dia: 'Domingo', foco: 'Descanso Total', exercicios: [
        { nome: 'Sem treino', series: '-', reps: '-', descanso: '-', tecnica: 'Recuperação ativa' },
    ], pos: []},
];

const SAUDE = [
    { dia: 'Segunda', foco: 'Superiores', exercicios: [
        { nome: 'Supino Reto com Halteres', series: '3', reps: '12-15', descanso: '60s', tecnica: 'Alongamento máximo' },
        { nome: 'Puxada Aberta Frente',      series: '3', reps: '12-15', descanso: '60s', tecnica: 'Tronco inclinado' },
        { nome: 'Desenvolvimento Arnold',    series: '3', reps: '12-15', descanso: '60s', tecnica: 'Rotação completa' },
    ], pos: [
        { nome: '🔷 Prancha Frontal Estática', series: '3', reps: '30s', descanso: '30s', tecnica: 'Isometria leve' },
    ]},
    { dia: 'Terça', foco: 'Pernas / Quadríceps', exercicios: [
        { nome: 'Agachamento Livre', series: '3', reps: '12-15', descanso: '60s', tecnica: 'Profundo (paralelo)' },
        { nome: 'Leg Press 45°',     series: '3', reps: '12-15', descanso: '60s', tecnica: 'Amplitude máxima' },
        { nome: 'Panturrilha em Pé', series: '3', reps: '15-20', descanso: '45s', tecnica: '2s de estiramento' },
    ], pos: []},
    { dia: 'Quarta', foco: 'Cardio Leve / Recuperação', exercicios: [
        { nome: 'Caminhada Rápida ou Bicicleta', series: '-', reps: '30min', descanso: '-', tecnica: '5-6km/h ou 130bpm' },
    ], pos: []},
    { dia: 'Quinta', foco: 'Posterior / Glúteos', exercicios: [
        { nome: 'Romeno com Barra',          series: '3', reps: '12-15', descanso: '60s', tecnica: 'Joelhos levemente flexionados' },
        { nome: 'Cadeira Flexora (Deitado)', series: '3', reps: '12-15', descanso: '60s', tecnica: 'Negativa lenta' },
        { nome: 'Elevação Pélvica',           series: '3', reps: '15-20', descanso: '45s', tecnica: 'Pausa 3s no topo' },
    ], pos: []},
    { dia: 'Sexta', foco: 'Descanso Total', exercicios: [
        { nome: 'Sem treino', series: '-', reps: '-', descanso: '-', tecnica: 'Recuperação ativa' },
    ], pos: []},
    { dia: 'Sábado', foco: 'Cardio Leve / Recuperação', exercicios: [
        { nome: 'Caminhada Rápida ou Bicicleta', series: '-', reps: '30min', descanso: '-', tecnica: '5-6km/h ou 130bpm' },
    ], pos: []},
    { dia: 'Domingo', foco: 'Descanso Total', exercicios: [
        { nome: 'Sem treino', series: '-', reps: '-', descanso: '-', tecnica: 'Recuperação ativa' },
    ], pos: []},
];

// Objetivo cardio/resistência — uma única versão cobre o fallback local inteiro.
const RESISTENCIA = [
    { dia: 'Segunda', foco: 'Corrida Intervalada', exercicios: [
        { nome: 'Corrida Intervalada (HIIT)', series: '-', reps: '8x400m forte / 200m trote', descanso: '90s', tecnica: 'Ritmo forte controlado' },
    ], pos: [
        { nome: '🔷 Prancha Frontal Estática', series: '3', reps: '40s', descanso: '30s', tecnica: 'Isometria core' },
    ]},
    { dia: 'Terça', foco: 'Força / Estabilidade', exercicios: [
        { nome: 'Agachamento Livre', series: '3', reps: '12-15', descanso: '60s', tecnica: 'Suporte para a corrida' },
        { nome: 'Afundo Búlgaro', series: '3', reps: '12 cada', descanso: '60s', tecnica: 'Pé elevado atrás' },
        { nome: 'Panturrilha em Pé', series: '3', reps: '15-20', descanso: '45s', tecnica: 'Amplitude completa' },
    ], pos: []},
    { dia: 'Quarta', foco: 'Corrida Longa', exercicios: [
        { nome: 'Corrida Contínua (Longão)', series: '-', reps: '50-60min', descanso: '-', tecnica: 'Ritmo confortável, dá pra conversar' },
    ], pos: []},
    { dia: 'Quinta', foco: 'Cross-training', exercicios: [
        { nome: 'Bicicleta ou Natação', series: '-', reps: '40min', descanso: '-', tecnica: 'Intensidade moderada' },
    ], pos: [
        { nome: '🔷 Elevação de Pernas Deitado', series: '3', reps: '15-20', descanso: '30s', tecnica: 'Toque os pés no chão' },
    ]},
    { dia: 'Sexta', foco: 'Corrida Fartlek', exercicios: [
        { nome: 'Fartlek (variação de ritmo)', series: '-', reps: '35min', descanso: '-', tecnica: 'Alterna forte/moderado por sensação' },
    ], pos: []},
    { dia: 'Sábado', foco: 'Cardio Leve / Recuperação', exercicios: [
        { nome: 'Caminhada Rápida ou Bicicleta Leve', series: '-', reps: '30min', descanso: '-', tecnica: '5-6km/h ou 130bpm' },
    ], pos: []},
    { dia: 'Domingo', foco: 'Descanso Total', exercicios: [
        { nome: 'Sem treino', series: '-', reps: '-', descanso: '-', tecnica: 'Recuperação ativa' },
    ], pos: []},
];

const BASE_TEMPLATES = {
    massa: treinoData,
    forca: FORCA,
    emagrecer: EMAGRECER,
    definicao: DEFINICAO,
    saude: SAUDE,
    resistencia: RESISTENCIA,
};

export const METAS = ['massa', 'forca', 'emagrecer', 'definicao', 'saude', 'resistencia'];
export const RESTRICOES = ['padrao', 'vegetariano', 'low_carb'];

async function fetchBaseTemplate(meta) {
    try {
        const { data, error } = await db.from('workout_templates').select('days').eq('meta', meta).single();
        if (error || !Array.isArray(data?.days) || data.days.length === 0) throw error || new Error('empty');
        return data.days;
    } catch {
        return BASE_TEMPLATES[meta] || BASE_TEMPLATES.saude;
    }
}

// sexo/idade não influenciam a seleção de exercícios nesta versão. Aceitos
// aqui só para manter a mesma assinatura de perfil usada na tela de onboarding.
export async function generatePlan({ peso, altura, meta, nivel }) {
    const base = await fetchBaseTemplate(meta);
    const leveled = applyLevelAdjustment(base, nivel);
    const bracket = computeImcBracket(peso, altura);
    return applyImcAdjustment(leveled, bracket);
}
