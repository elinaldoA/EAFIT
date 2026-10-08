import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { escapeHtml, renderEmail } from './emailLayout.ts';

Deno.test('escapeHtml: neutraliza marcação e aspas', () => {
  assertEquals(escapeHtml(`<b a="1" c='2'>&</b>`), '&lt;b a=&quot;1&quot; c=&#39;2&#39;&gt;&amp;&lt;/b&gt;');
});

Deno.test('renderEmail: título, parágrafos, botão e rodapé no idioma', () => {
  const pt = renderEmail('pt', {
    subject: 'Assunto',
    preheader: 'Resumo da lista',
    eyebrow: 'Boas-vindas',
    heading: 'Bem-vindo',
    paragraphs: ['Primeiro.', 'Segundo.'],
    cta: { label: 'Abrir o app', url: 'https://eafit.com.br/app/?a=1&b=2' },
    footnote: 'Se não foi você, ignore.',
  });
  assertEquals(pt.subject, 'Assunto');
  assertStringIncludes(pt.html, '<html lang="pt-br">');
  assertStringIncludes(pt.html, 'Bem-vindo</h1>');
  assertStringIncludes(pt.html, '>Resumo da lista</div>');
  assertStringIncludes(pt.html, '>Boas-vindas</p>');
  assertStringIncludes(pt.html, 'Se o botão não funcionar');
  assertStringIncludes(pt.html, 'Primeiro.</p>');
  assertStringIncludes(pt.html, 'Segundo.</p>');
  assertStringIncludes(pt.html, 'href="https://eafit.com.br/app/?a=1&amp;b=2"');
  assertStringIncludes(pt.html, 'Você está recebendo este e-mail');
  assertEquals(
    pt.text,
    [
      'Bem-vindo',
      '',
      'Primeiro.',
      'Segundo.',
      '',
      'Abrir o app: https://eafit.com.br/app/?a=1&b=2',
      '',
      'Se não foi você, ignore.',
      '',
      '--',
      'EAFIT',
      'Precisa de ajuda? Escreva para contato.eafit@gmail.com',
      'Você está recebendo este e-mail porque tem uma conta no EAFIT.',
      'https://eafit.com.br/app/',
    ].join('\n'),
  );

  const en = renderEmail('en', { subject: 'S', heading: 'H', paragraphs: ['P'] });
  assertStringIncludes(en.html, '<html lang="en">');
  assertStringIncludes(en.html, 'You are receiving this email');
});

Deno.test('renderEmail: sem os opcionais, não sobra marcação deles', () => {
  const { html, text } = renderEmail('pt', { subject: 'S', heading: 'H', paragraphs: ['P'] });
  for (const cls of ['preheader', 'eyebrow', 'linkbox', 'rule']) assert(!html.includes(`class="${cls}"`), cls);
  assertEquals(text.split('\n').slice(0, 4), ['H', '', 'P', '']);
});

Deno.test('renderEmail: conteúdo vindo de usuário não vira HTML', () => {
  const { html } = renderEmail('pt', {
    subject: '<s>',
    heading: '<script>x</script>',
    paragraphs: ['<img src=x onerror=1>'],
    cta: { label: '<i>', url: 'https://eafit.com.br/app/"><b>' },
  });
  assert(!html.includes('<script>'));
  assert(!html.includes('<img src=x'));
  assert(!html.includes('"><b>'));
  assertStringIncludes(html, '&lt;script&gt;x&lt;/script&gt;');
});
