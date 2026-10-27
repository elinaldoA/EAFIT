import { assertEquals } from 'jsr:@std/assert@1';
import { tagAppLinks } from './emailTracking.ts';

const APP = 'https://eafit.com.br/app/';

Deno.test('tagAppLinks: marca o href do app, com e sem âncora, e deixa o texto visível', () => {
  const html = `<a href="${APP}#treino">${APP}#treino</a> <a href="${APP}">Abrir</a>`;
  assertEquals(
    tagAppLinks(html, 'boas-vindas', 'html'),
    `<a href="${APP}?origem=email&amp;utm_campaign=boas-vindas#treino">${APP}#treino</a> <a href="${APP}?origem=email&amp;utm_campaign=boas-vindas">Abrir</a>`,
  );
});

Deno.test('tagAppLinks: não mexe em páginas legais nem no descadastro', () => {
  const html = `<a href="${APP}legal/termos.html">t</a> <a href="${APP}?descadastro=abc">d</a>`;
  assertEquals(tagAppLinks(html, 'resumo', 'html'), html);
});

Deno.test('tagAppLinks: texto simples marca o endereço do app', () => {
  assertEquals(
    tagAppLinks(`Abra: ${APP}#dash\nTermos: ${APP}legal/termos.html`, 'resumo', 'text'),
    `Abra: ${APP}?origem=email&utm_campaign=resumo#dash\nTermos: ${APP}legal/termos.html`,
  );
});

Deno.test('tagAppLinks: tipo inválido não altera a mensagem', () => {
  const html = `<a href="${APP}">x</a>`;
  assertEquals(tagAppLinks(html, 'Tipo Ruim!', 'html'), html);
  assertEquals(tagAppLinks(html, 'ab', 'html'), html);
});
