import qrcode from 'qrcode-generator';

// QR Code do link de divulgação: desenhado aqui mesmo (SVG na tela, canvas
// nos cards), sem serviço externo. Correção 'M' aguenta um pouco de sujeira
// ou compressão de imagem sem deixar o código grande demais.
export function qrModules(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

// Caminho SVG em unidades de módulo (viewBox 0 0 n n).
export function qrSvgPath(text) {
  const modules = qrModules(text);
  let d = '';
  modules.forEach((row, r) => row.forEach((dark, c) => { if (dark) d += `M${c} ${r}h1v1h-1z`; }));
  return { size: modules.length, d };
}

// Desenha só os módulos escuros no quadrado (x, y, size); o fundo claro e a
// margem em volta ficam por conta de quem chama.
export function drawQr(ctx, text, x, y, size, color = '#000000') {
  const modules = qrModules(text);
  const cell = size / modules.length;
  ctx.fillStyle = color;
  modules.forEach((row, r) => row.forEach((dark, c) => {
    if (dark) ctx.fillRect(x + c * cell, y + r * cell, Math.ceil(cell), Math.ceil(cell));
  }));
}
