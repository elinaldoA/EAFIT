import { db } from '../lib/supabase';
import { treinoData } from './treinoData';

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

export function computeImcBracket(peso, altura) {
    const p = parseFloat(peso);
    const a = parseFloat(altura);
    if (!(p > 0) || !(a > 0)) return 'normal';
    const imc = p / ((a / 100) ** 2);
    if (imc < 18.5) return 'abaixo';
    if (imc < 25) return 'normal';
    if (imc < 30) return 'sobrepeso';
    return 'obesidade';
}

function isRestOrCardioDay(day) {
    return day.foco.includes('Cardio Leve') || day.foco.includes('Descanso');
}

function cloneDay(day) {
    return { dia: day.dia, foco: day.foco, exercicios: day.exercicios.map(e => ({ ...e })), pos: day.pos.map(p => ({ ...p })) };
}

function trimCardio(day) {
    return { ...day, pos: day.pos.filter(p => !p.nome.startsWith('🏃')) };
}

function ensureCardio(day) {
    if (day.pos.some(p => p.nome.startsWith('🏃'))) return day;
    return { ...day, pos: [...day.pos, { nome: '🏃 Cardio — Caminhada ou Bicicleta', series: '-', reps: '20min · Moderado', descanso: '-', tecnica: '' }] };
}

function reduceVolume(day) {
    return {
        ...day,
        exercicios: day.exercicios.map(ex => {
            const n = parseInt(ex.series, 10);
            if (!Number.isFinite(n)) return ex;
            return { ...ex, series: String(Math.max(2, n - 1)) };
        }),
    };
}

function lightCardioDay(dia) {
    return {
        dia,
        foco: 'Cardio Leve / Recuperação',
        exercicios: [{ nome: 'Caminhada Rápida ou Bicicleta', series: '-', reps: '30-40min', descanso: '-', tecnica: '5-6km/h ou 130bpm (baixo impacto)' }],
        pos: [],
    };
}

// Ajusta o template base por faixa de IMC, sempre preservando as 7 entradas
// (uma por dia da semana) — várias telas (heatmap, TreinoPage) assumem isso.
export function applyImcAdjustment(templateDays, bracket) {
    const days = templateDays.map(cloneDay);

    if (bracket === 'abaixo') {
        return days.map(d => (isRestOrCardioDay(d) ? d : trimCardio(d)));
    }
    if (bracket === 'sobrepeso') {
        return days.map(d => (isRestOrCardioDay(d) ? d : ensureCardio(d)));
    }
    if (bracket === 'obesidade') {
        const trainingIdx = days.map((d, i) => (isRestOrCardioDay(d) ? -1 : i)).filter(i => i >= 0);
        const toDowngrade = new Set(trainingIdx.slice(-2)); // as duas últimas sessões de treino da semana
        return days.map((d, i) => {
            if (toDowngrade.has(i)) return lightCardioDay(d.dia);
            if (trainingIdx.includes(i)) return reduceVolume(d);
            return d;
        });
    }
    return days; // normal — sem ajuste
}

export const NIVEIS = ['iniciante', 'intermediario', 'avancado'];

// Substituições de exercício por nível de experiência. Só cobre os
// levantamentos compostos onde a diferença de nível realmente importa
// (risco técnico/estabilidade) — isolados e máquinas já são acessíveis em
// qualquer nível e não precisam de variação de exercício, só de volume.
const LEVEL_EXERCISE_SUBS = {
    'Supino Reto com Barra': {
        iniciante: { nome: 'Supino Reto na Máquina', tecnica: 'Trajetória guiada, foco na execução' },
        avancado: { nome: 'Supino Reto com Barra (pausa no peito)', tecnica: 'Pausa 1s no peito, sem quicar' },
    },
    'Supino Inclinado com Halteres': {
        iniciante: { nome: 'Supino Inclinado na Máquina', tecnica: 'Trajetória guiada' },
        avancado: { nome: 'Supino Inclinado com Halteres (unilateral)', tecnica: 'Um braço por vez, core travado' },
    },
    'Desenvolvimento com Barra': {
        iniciante: { nome: 'Desenvolvimento na Máquina', tecnica: 'Trajetória guiada' },
        avancado: { nome: 'Desenvolvimento Militar em Pé', tecnica: 'Sem apoio lombar, core ativo' },
    },
    'Levantamento Terra': {
        iniciante: { nome: 'Levantamento Terra Romeno (barra guiada)', tecnica: 'Amplitude reduzida, foco na técnica' },
        avancado: { nome: 'Levantamento Terra (déficit)', tecnica: 'Pés sobre anteparo, ROM ampliado' },
    },
    'Agachamento Livre': {
        iniciante: { nome: 'Agachamento no Smith', tecnica: 'Trajetória guiada' },
        avancado: { nome: 'Agachamento Livre (pausa no fundo)', tecnica: 'Pausa 2s no fundo' },
    },
    'Remada Curvada com Barra': {
        iniciante: { nome: 'Remada Curvada na Máquina', tecnica: 'Trajetória guiada' },
        avancado: { nome: 'Remada Curvada com Barra (pegada supinada)', tecnica: 'Pegada supinada, foco lombar' },
    },
    'Puxada Aberta Frente': {
        iniciante: { nome: 'Puxada Aberta Assistida', tecnica: 'Contrapeso reduz o peso corporal' },
        avancado: { nome: 'Barra Fixa (peso corporal)', tecnica: 'Amplitude completa, sem impulso' },
    },
    'Leg Press 45°': {
        avancado: { nome: 'Leg Press 45° (unilateral)', tecnica: 'Uma perna por vez' },
    },
    'Afundo Búlgaro': {
        iniciante: { nome: 'Afundo Estático (sem banco)', tecnica: 'Passada fixa, mais estável' },
        avancado: { nome: 'Afundo Búlgaro (com salto)', tecnica: 'Excêntrica controlada + salto' },
    },
    'Romeno com Barra': {
        iniciante: { nome: 'Romeno com Halteres', tecnica: 'Carga menor, mais controle' },
        avancado: { nome: 'Romeno Unilateral com Halter', tecnica: 'Equilíbrio + core' },
    },
};

// Reaproveita a variante "iniciante" de LEVEL_EXERCISE_SUBS (trajetória guiada
// em máquina / carga reduzida) como sugestão de substituição quando o usuário
// relata dor/desconforto forte nesse exercício — mesma variante, motivo
// diferente (reduzir demanda técnica/articular, não nível de experiência).
// Retorna null se o exercício não tiver uma variante mais simples curada.
export function getSaferAlternative(nome) {
    return LEVEL_EXERCISE_SUBS[nome]?.iniciante ?? null;
}

const SERIES_DELTA = { iniciante: -1, intermediario: 0, avancado: 1 };
const DESCANSO_DELTA_S = { iniciante: 15, intermediario: 0, avancado: -15 };

function parseDescansoSeconds(str) {
    const min = str.match(/(\d+(?:\.\d+)?)\s*min/);
    if (min) return Math.round(parseFloat(min[1]) * 60);
    const sec = str.match(/(\d+)\s*s/);
    if (sec) return parseInt(sec[1], 10);
    return null;
}

function formatDescansoSeconds(s) {
    if (s >= 120 && s % 60 === 0) return `${s / 60}min`;
    return `${s}s`;
}

function adjustSeries(series, delta) {
    const n = parseInt(series, 10);
    if (!Number.isFinite(n) || !delta) return series;
    return String(Math.min(6, Math.max(2, n + delta)));
}

function adjustDescanso(descanso, deltaSeconds) {
    const s = parseDescansoSeconds(descanso);
    if (s === null || !deltaSeconds) return descanso;
    return formatDescansoSeconds(Math.max(30, s + deltaSeconds));
}

function applyLevelToExercise(ex, nivel, allowSub) {
    const sub = allowSub ? LEVEL_EXERCISE_SUBS[ex.nome]?.[nivel] : null;
    const seriesDelta = SERIES_DELTA[nivel] ?? 0;
    const descansoDelta = DESCANSO_DELTA_S[nivel] ?? 0;
    return {
        ...ex,
        nome: sub?.nome ?? ex.nome,
        tecnica: sub?.tecnica ?? ex.tecnica,
        series: ex.series === '-' ? ex.series : adjustSeries(ex.series, seriesDelta),
        descanso: ex.descanso === '-' ? ex.descanso : adjustDescanso(ex.descanso, descansoDelta),
    };
}

// Ajusta exercícios principais e acessórios de força por nível de
// experiência: iniciante troca lifts complexos por variações guiadas e
// reduz volume; avançado troca por variações mais exigentes e aumenta
// volume. Dias de descanso/cardio leve e itens de cardio (🏃) não mudam.
export function applyLevelAdjustment(templateDays, nivel) {
    if (!nivel || nivel === 'intermediario') return templateDays.map(cloneDay);
    return templateDays.map(day => {
        if (isRestOrCardioDay(day)) return cloneDay(day);
        return {
            dia: day.dia,
            foco: day.foco,
            exercicios: day.exercicios.map(ex => applyLevelToExercise(ex, nivel, true)),
            pos: day.pos.map(ex => (ex.nome.startsWith('🏃') ? { ...ex } : applyLevelToExercise(ex, nivel, false))),
        };
    });
}

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
