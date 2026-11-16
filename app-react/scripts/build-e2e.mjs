// Build de produção para os testes no navegador (e2e/), em dist-e2e/ — não
// mexe no dist/ do deploy. Mantém o host do Supabase da CSP, mas com chave falsa, e o Playwright intercepta
// tudo que vai para ele na rede; assim o
// teste nunca fala com o banco de verdade, mesmo que exista um .env local.
// É um build de produção de verdade: o service worker só existe nele.
import { readFileSync } from 'node:fs';
import { build } from 'vite';

// O host vem da CSP do index.html (o navegador só deixa o app falar com ele).
const host = readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
if (!host) throw new Error('host do Supabase não encontrado na CSP do index.html');

process.env.VITE_SUPABASE_URL = host;
process.env.VITE_SUPABASE_ANON_KEY = 'e2e-anon-key';
process.env.VITE_VAPID_PUBLIC_KEY = '';

await build({ build: { outDir: 'dist-e2e', emptyOutDir: true }, logLevel: 'warn' });
console.log('build e2e pronto em dist-e2e/');
