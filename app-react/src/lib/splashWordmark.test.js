import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// A splash (.boot) tem fundo próprio, que segue o tema do sistema. O "EA" do Wordmark usa
// --text (tema do app) e sumia sobre o fundo escuro quando o app estava no tema claro.
describe('splash', () => {
  it('o EA do Wordmark herda a cor da splash', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).toMatch(/\.boot \.boot__name \.wordmark__ea\s*\{[^}]*color:\s*inherit/);
  });
});
