export const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
// Data "de hoje" no fuso de Brasília (America/Sao_Paulo). Usar toISOString()
// devolveria a data em UTC, que já vira o dia seguinte às 21:00 no horário local
// (UTC−3) — fazendo o app carimbar os dados no dia de amanhã 3h antes da meia-noite.
// O servidor (supabase/functions/send-reminders) usa exatamente este mesmo fuso.
export const TODAY_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
// Nome do dia derivado da MESMA data acima, para não divergir do TODAY_DATE
// no intervalo 21:00–00:00 (parse como meio-dia local evita salto de fuso).
export const TODAY_NAME = DAY_NAMES[new Date(TODAY_DATE + 'T12:00:00').getDay()];
export const WATER_STORAGE_KEY = `agua_${TODAY_DATE}`;

export const treinoData = [
    { dia:'Segunda', foco:'Peito / Ombro / Tríceps', exercicios:[
        { nome:'Supino Reto com Barra',          series:'4', reps:'8-10',  descanso:'90s', tecnica:'Cadência 2-0-2' },
        { nome:'Supino Inclinado com Halteres',  series:'3', reps:'10-12', descanso:'60s', tecnica:'Alongamento máximo' },
        { nome:'Crucifixo Máquina',              series:'3', reps:'12-15', descanso:'45s', tecnica:'Pico de contração' },
        { nome:'Desenvolvimento com Barra',      series:'4', reps:'8-10',  descanso:'90s', tecnica:'Lombar apoiada' },
        { nome:'Elevação Lateral com Halteres',  series:'4', reps:'12-15', descanso:'45s', tecnica:'Leve inclinação' },
        { nome:'Tríceps Corda na Polia',         series:'3', reps:'12-15', descanso:'45s', tecnica:'Full ROM' },
        { nome:'Tríceps Testa com Barra W',      series:'3', reps:'10-12', descanso:'60s', tecnica:'Cotovelos fixos' },
    ], pos:[
        { nome:'🔷 Abdominal Polia (Corda)',      series:'4', reps:'12-15',                          descanso:'45s', tecnica:'Pico de contração' },
        { nome:'🔷 Elevação de Pernas Pendurado', series:'3', reps:'até a falha (máx 20)',           descanso:'45s', tecnica:'Máximo alongamento' },
        { nome:'🔷 Prancha com Peso',             series:'3', reps:'45s',                            descanso:'45s', tecnica:'Isometria com carga' },
        { nome:'🏃 Cardio — Esteira Inclinada',   series:'-', reps:'20min · 10% inclinação / 5km/h', descanso:'-',  tecnica:'' },
    ]},
    { dia:'Terça', foco:'Costas / Bíceps', exercicios:[
        { nome:'Puxada Aberta Frente',           series:'4', reps:'8-10',  descanso:'90s', tecnica:'Tronco inclinado' },
        { nome:'Remada Curvada com Barra',       series:'4', reps:'8-10',  descanso:'90s', tecnica:'Escápula ativa' },
        { nome:'Remada Unilateral com Halter',   series:'3', reps:'10-12', descanso:'60s', tecnica:'Máximo alongamento' },
        { nome:'Pulldown Neutro (Triângulo)',     series:'3', reps:'10-12', descanso:'60s', tecnica:'Cotovelo guiado' },
        { nome:'Face Pull',                      series:'4', reps:'15-20', descanso:'45s', tecnica:'Essencial postura' },
        { nome:'Rosca Direta Barra W',           series:'3', reps:'10-12', descanso:'60s', tecnica:'Sem balanço' },
        { nome:'Rosca Martelo Alternada',        series:'3', reps:'12-15', descanso:'45s', tecnica:'Supinação no pico' },
        { nome:'Rosca Inversa com Barra',        series:'2', reps:'12-15', descanso:'45s', tecnica:'Foco antebraço' },
    ], pos:[
        { nome:'🔷 Abdominal Supra com Halter',       series:'3', reps:'15-20',                     descanso:'45s', tecnica:'Carga moderada' },
        { nome:'🔷 Bicicleta no Solo',                series:'3', reps:'20 cada perna',             descanso:'45s', tecnica:'Movimento alternado' },
        { nome:'🔷 Prancha Lateral com Elevação',     series:'3', reps:'30s cada lado',             descanso:'45s', tecnica:'Estabilidade dinâmica' },
        { nome:'🏃 Cardio — Escada',                  series:'-', reps:'20min · Moderado (130bpm)', descanso:'-',  tecnica:'' },
    ]},
    { dia:'Quarta', foco:'Pernas / Quadríceps', exercicios:[
        { nome:'Agachamento Livre',              series:'4', reps:'6-8',   descanso:'2min', tecnica:'Profundo (paralelo)' },
        { nome:'Leg Press 45°',                  series:'4', reps:'10-12', descanso:'75s',  tecnica:'Amplitude máxima' },
        { nome:'Cadeira Extensora',              series:'4', reps:'12-15', descanso:'45s',  tecnica:'Pausa 2s no pico' },
        { nome:'Afundo Búlgaro',                 series:'3', reps:'10-12', descanso:'60s',  tecnica:'Pé elevado atrás' },
        { nome:'Agachamento Sumô com Halter',    series:'3', reps:'12-15', descanso:'45s',  tecnica:'Foco adutores' },
        { nome:'Panturrilha em Pé',              series:'4', reps:'12-15', descanso:'45s',  tecnica:'2s de estiramento' },
        { nome:'Panturrilha Sentado',            series:'3', reps:'15-20', descanso:'45s',  tecnica:'Pico de contração' },
    ], pos:[
        { nome:'🔷 Crunch Invertido (banco)',  series:'4', reps:'15',                   descanso:'45s', tecnica:'Levanta quadril' },
        { nome:'🔷 Russian Twist com Halter',  series:'3', reps:'20 cada lado',         descanso:'45s', tecnica:'Rotação tronco' },
        { nome:'🔷 Prancha Frontal Estática',  series:'3', reps:'60s',                  descanso:'45s', tecnica:'Isometria máxima' },
        { nome:'🏃 Cardio — Caminhada Leve',   series:'-', reps:'10min · Resfriamento', descanso:'-',  tecnica:'' },
    ]},
    { dia:'Quinta', foco:'Superiores / Força', exercicios:[
        { nome:'Supino Reto com Halteres',       series:'4', reps:'6-8',   descanso:'2min', tecnica:'Carga alta (força)' },
        { nome:'Remada com Barra T',             series:'4', reps:'8-10',  descanso:'90s',  tecnica:'Contração escapular' },
        { nome:'Desenvolvimento Arnold',         series:'3', reps:'8-10',  descanso:'75s',  tecnica:'Rotação completa' },
        { nome:'Crucifixo Invertido',            series:'3', reps:'12-15', descanso:'45s',  tecnica:'Posterior ombro' },
        { nome:'Rosca Scott',                    series:'3', reps:'10-12', descanso:'60s',  tecnica:'Banco ajustado' },
        { nome:'Tríceps Francês com Halter',     series:'3', reps:'10-12', descanso:'60s',  tecnica:'Cotovelo estabilizado' },
        { nome:'Farmer Walk',                    series:'3', reps:'30s',   descanso:'60s',  tecnica:'Grip + Core' },
    ], pos:[
        { nome:'🔷 Abdominal na Máquina',               series:'4', reps:'12-15',           descanso:'45s', tecnica:'Carga controlada' },
        { nome:'🔷 Tesoura (Scissor Kicks)',            series:'3', reps:'20 cada perna',    descanso:'45s', tecnica:'Alonga ísquios' },
        { nome:'🔷 Prancha com Braços Estendidos',      series:'3', reps:'45s',              descanso:'45s', tecnica:'Ativa peitoral e core' },
        { nome:'🏃 Cardio — Caminhada (6km/h)',         series:'-', reps:'25min · Moderado', descanso:'-',  tecnica:'' },
    ]},
    { dia:'Sexta', foco:'Posterior / Glúteos', exercicios:[
        { nome:'Romeno com Barra',               series:'4', reps:'8-10',  descanso:'90s', tecnica:'Estiramento máximo' },
        { nome:'Stiff com Halteres',             series:'3', reps:'10-12', descanso:'60s', tecnica:'Joelhos levemente flexionados' },
        { nome:'Cadeira Flexora (Deitado)',       series:'4', reps:'12-15', descanso:'45s', tecnica:'Pausa no pico' },
        { nome:'Mesa Flexora (Sentado)',          series:'3', reps:'12-15', descanso:'45s', tecnica:'Negativa lenta' },
        { nome:'Afundo Búlgaro (foco glúteo)',   series:'3', reps:'10-12', descanso:'60s', tecnica:'Tronco inclinado' },
        { nome:'Elevação Pélvica',               series:'3', reps:'15-20', descanso:'45s', tecnica:'Pausa 3s no topo' },
        { nome:'Panturrilha em Pé (carga)',      series:'4', reps:'10-12', descanso:'45s', tecnica:'Ênfase potência' },
    ], pos:[
        { nome:'🔷 Roda (Ab Wheel)',             series:'4', reps:'10-12',                            descanso:'45s', tecnica:'Extensão total core' },
        { nome:'🔷 Elevação de Pernas Deitado',  series:'3', reps:'15-20',                            descanso:'45s', tecnica:'Toque os pés' },
        { nome:'🔷 Prancha Lateral Estática',    series:'3', reps:'45s cada lado',                    descanso:'45s', tecnica:'Estabilidade unilateral' },
        { nome:'🏃 Cardio — HIIT Esteira',       series:'-', reps:'15min · 1min corre / 2min caminha', descanso:'-',  tecnica:'' },
    ]},
    { dia:'Sábado', foco:'Cardio Leve / Recuperação', exercicios:[
        { nome:'Caminhada Rápida ou Bicicleta', series:'-', reps:'30-40min', descanso:'-', tecnica:'5-6km/h ou 130bpm' },
    ], pos:[]},
    { dia:'Domingo', foco:'Descanso Total', exercicios:[
        { nome:'Sem treino', series:'-', reps:'-', descanso:'-', tecnica:'Recuperação ativa' },
    ], pos:[]},
];

export const DEFAULT_WATER_GOAL = 3.5;

// Meta de água em litros: por padrão estimada a partir do peso (0.035L/kg),
// mas o usuário pode sobrescrever salvando um valor próprio no perfil.
export function getWaterGoalLiters(user) {
    const md = user?.user_metadata || {};

    const peso = parseFloat(md.peso);
    const computed = Number.isFinite(peso) && peso > 0 ? Math.round(peso * 0.035 * 10) / 10 : null;

    const raw = md.macroAgua ?? localStorage.getItem('profile_macroAgua');
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : (computed ?? DEFAULT_WATER_GOAL);
}

export const DEFAULT_WEEKLY_GOAL = 5;

export function getWeeklyGoal(user) {
    const raw = user?.user_metadata?.weeklyGoal ?? localStorage.getItem('profile_weeklyGoal');
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 && n <= 7 ? n : DEFAULT_WEEKLY_GOAL;
}

export const MUSCLE_MAP = {
    'Peito':        ['chest'],
    'Ombro':        ['shoulders'],
    'Tríceps':      ['triceps'],
    'Costas':       ['back'],
    'Bíceps':       ['biceps'],
    'Pernas':       ['quads', 'calves'],
    'Quadríceps':   ['quads'],
    'Superiores':   ['chest', 'shoulders', 'back', 'biceps', 'triceps'],
    'Força':        [],
    'Posterior':    ['hamstrings', 'back'],
    'Glúteos':      ['glutes'],
    'Cardio Leve':  [],
    'Recuperação':  [],
    'Descanso Total': [],
};

export function getMuscleGroupsForDay(day) {
    const groups = new Set();
    day.foco.split('/').map(s => s.trim()).forEach(token => {
        (MUSCLE_MAP[token] || []).forEach(g => groups.add(g));
    });
    if (day.pos.length > 0) groups.add('abs');
    return groups;
}
