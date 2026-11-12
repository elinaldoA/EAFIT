// Capas dos destaques do Instagram (Marketing → Destaques). O Instagram mostra só um
// círculo no centro da imagem 1080×1920, então tudo que importa fica dentro dele.
// Só usa a API de canvas 2D (como reelRender).
import { FONT, H, W, roundRect } from './reelRender';

export const COVER_W = W;
export const COVER_H = H;
const CX = W / 2;
const CY = H / 2;
const RING = 400; // raio do anel laranja; o Instagram corta um círculo em volta
const ORANGE = '#f97316';
const WHITE = '#ffffff';

const stroke = (ctx, color, width) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
};

// Cada ícone é desenhado no centro do círculo (CX, ~CY - 30), em coordenadas absolutas.
const ICONS = {
  // Bandeira de largada: "comece aqui".
  comecar(ctx) {
    stroke(ctx, WHITE, 22);
    ctx.beginPath();
    ctx.moveTo(468, 790);
    ctx.lineTo(468, 1080);
    ctx.stroke();
    ctx.fillStyle = ORANGE;
    ctx.beginPath();
    ctx.moveTo(468, 800);
    ctx.bezierCurveTo(545, 760, 600, 850, 690, 805);
    ctx.lineTo(690, 935);
    ctx.bezierCurveTo(600, 980, 545, 890, 468, 935);
    ctx.closePath();
    ctx.fill();
  },
  // Halter.
  treinos(ctx) {
    ctx.fillStyle = WHITE;
    roundRect(ctx, 392, 918, 296, 26, 10);
    ctx.fill();
    ctx.fillStyle = ORANGE;
    roundRect(ctx, 408, 822, 48, 218, 16);
    ctx.fill();
    roundRect(ctx, 624, 822, 48, 218, 16);
    ctx.fill();
    ctx.fillStyle = WHITE;
    roundRect(ctx, 356, 866, 38, 130, 12);
    ctx.fill();
    roundRect(ctx, 686, 866, 38, 130, 12);
    ctx.fill();
  },
  // Maçã.
  nutricao(ctx) {
    ctx.fillStyle = ORANGE;
    ctx.beginPath();
    ctx.arc(496, 955, 100, 0, Math.PI * 2);
    ctx.arc(584, 955, 100, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx, WHITE, 18);
    ctx.beginPath();
    ctx.moveTo(540, 868);
    ctx.quadraticCurveTo(540, 830, 556, 800);
    ctx.stroke();
    ctx.fillStyle = WHITE;
    ctx.save();
    ctx.translate(606, 820);
    ctx.rotate(-0.45);
    ctx.beginPath();
    ctx.ellipse(0, 0, 58, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  // Barras subindo com a seta de evolução.
  evolucao(ctx) {
    const base = 1052;
    [[424, 92, WHITE], [508, 152, WHITE], [592, 232, ORANGE]].forEach(([x, h, color]) => {
      ctx.fillStyle = color;
      roundRect(ctx, x, base - h, 60, h, 12);
      ctx.fill();
    });
    stroke(ctx, ORANGE, 18);
    ctx.beginPath();
    ctx.moveTo(414, 818);
    ctx.lineTo(500, 758);
    ctx.lineTo(566, 790);
    ctx.lineTo(676, 706);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(620, 702);
    ctx.lineTo(678, 704);
    ctx.lineTo(668, 762);
    ctx.stroke();
  },
  // Treinador com selo de aprovado.
  personal(ctx) {
    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.arc(520, 828, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(520, 1062, 132, 124, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = ORANGE;
    ctx.beginPath();
    ctx.arc(656, 1010, 54, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx, WHITE, 14);
    ctx.beginPath();
    ctx.moveTo(630, 1010);
    ctx.lineTo(650, 1030);
    ctx.lineTo(684, 990);
    ctx.stroke();
  },
};

// Corrida fica de fora até o módulo ser liberado.
export const HIGHLIGHTS = [
  { key: 'comecar', label: 'Como começar', hint: 'Criar conta e instalar o app' },
  { key: 'treinos', label: 'Treinos', hint: 'Montar e acompanhar o treino' },
  { key: 'nutricao', label: 'Nutrição', hint: 'Refeições e hidratação' },
  { key: 'evolucao', label: 'Evolução', hint: 'Gráficos, cargas e conquistas' },
  { key: 'personal', label: 'Personal', hint: 'Para quem treina alunos' },
];

function background(ctx) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#17171b');
  bg.addColorStop(1, '#0e0e12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(CX, CY, 0, CX, CY, RING * 1.25);
  glow.addColorStop(0, 'rgba(249,115,22,.28)');
  glow.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

// `logo` = imagem já carregada da marca (opcional): vai pequena, dentro do círculo.
export function drawCover(ctx, key, { logo = null } = {}) {
  const icon = ICONS[key];
  if (!icon) throw new Error(`Capa desconhecida: ${key}`);
  background(ctx);
  stroke(ctx, ORANGE, 14);
  ctx.beginPath();
  ctx.arc(CX, CY, RING, 0, Math.PI * 2);
  ctx.stroke();
  // Os ícones são desenhados para um círculo de 340 px: amplia em volta do centro do ícone.
  ctx.save();
  ctx.translate(CX, CY - 30);
  ctx.scale(1.25, 1.25);
  ctx.translate(-CX, -(CY - 30));
  icon(ctx);
  ctx.restore();
  if (logo) {
    const size = 92;
    ctx.drawImage(logo, CX - size / 2, CY + 250, size, size);
  } else {
    ctx.fillStyle = WHITE;
    ctx.font = `800 40px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('EAFIT', CX, CY + 280);
  }
}
