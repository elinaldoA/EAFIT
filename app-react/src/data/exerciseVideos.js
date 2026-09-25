// Vídeos curtos de execução (≈7s, sem áudio, 360p) por nome de exercício.
// Fontes: wger.de (wger.de/api/v2/video, Goulart, CC BY-SA 4.0) e Wikimedia
// Commons (crédito próprio em VIDEO_CREDITS) — cortados/recomprimidos pra
// public/videos/<slug>.mp4. Cada
// vídeo foi conferido quadro a quadro: só entra quando é o MESMO movimento.
// Têm prioridade sobre os 2 quadros do Free Exercise DB (exerciseMedia.js).
// Não entram no precache nem no cache do service worker (vídeo usa range
// request); tocam direto da rede.
export const EXERCISE_VIDEOS = {
  'Burpee': 'burpee',
  'Afundo Estático': 'afundo-estatico',
  'Agachamento Frontal': 'agachamento-frontal',
  'Agachamento no Smith': 'agachamento-smith',
  'Barra Fixa Assistida': 'barra-fixa-assistida',
  'Cadeira Adutora': 'cadeira-adutora',
  'Cadeira Flexora (Deitado)': 'flexora-deitado',
  'Crucifixo Invertido com Halteres': 'crucifixo-invertido-halteres',
  'Desenvolvimento com Halteres': 'desenvolvimento-halteres',
  'Desenvolvimento na Máquina': 'desenvolvimento-maquina',
  'Elevação Lateral com Halteres': 'elevacao-lateral-halteres',
  'Elevação Lateral na Polia': 'elevacao-lateral-polia',
  'Elevação Pélvica': 'elevacao-pelvica',
  'Encolhimento com Barra': 'encolhimento-barra',
  'Extensão de Tríceps Unilateral na Polia': 'triceps-unilateral-polia',
  'Face Pull': 'face-pull',
  'Flexora em Pé Unilateral': 'flexora-em-pe',
  'Hack Squat na Máquina': 'hack-squat',
  'Mesa Flexora (Sentado)': 'flexora-sentado',
  'Panturrilha Sentado': 'panturrilha-sentado',
  'Panturrilha em Pé': 'panturrilha-em-pe',
  'Panturrilha em Pé (carga)': 'panturrilha-em-pe',
  'Paralelas (Peito)': 'paralelas',
  'Remada Baixa na Polia': 'remada-baixa-polia',
  'Romeno com Halteres': 'romeno-halteres',
  'Remada com Barra T': 'remada-barra-t',
  'Rosca Alternada com Halteres': 'rosca-halteres',
  'Rosca Direta com Barra': 'rosca-direta-barra',
  'Rosca Martelo Alternada': 'rosca-martelo',
  'Rosca Martelo na Polia (Corda)': 'rosca-martelo-polia',
  'Rosca Scott': 'rosca-scott',
  'Rosca no Cabo (Polia Baixa)': 'rosca-polia',
  'Supino Inclinado com Barra': 'supino-inclinado-barra',
  'Supino Inclinado com Halteres': 'supino-inclinado-halteres',
  'Supino Reto com Barra': 'supino-reto-barra',
  'Supino Reto com Halteres': 'supino-reto-halteres',
  'Tríceps Coice com Halter': 'triceps-coice-halter',
  'Tríceps Francês com Halter': 'triceps-frances-halter',
  'Tríceps Francês na Polia (Corda)': 'triceps-frances-polia',
  'Tríceps Testa com Barra W': 'triceps-testa-barra-w',
  'Tríceps Testa com Halteres': 'triceps-testa-halteres',
};

export const VIDEO_CREDIT = 'Vídeo: Goulart · wger.de · CC BY-SA 4.0';

// Vídeos que não vêm do wger (licença/autor exigem o crédito certo).
const VIDEO_CREDITS = {
  burpee: 'Vídeo: Taco Fleur · Wikimedia Commons · CC BY-SA 4.0',
  'remada-barra-t': 'Vídeo: FitnessScape · Wikimedia Commons · CC BY 3.0',
};

export function videoCredit(slug) {
  return VIDEO_CREDITS[slug] || VIDEO_CREDIT;
}
