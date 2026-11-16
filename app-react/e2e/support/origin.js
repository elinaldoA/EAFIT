import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// O app tem uma CSP (index.html) que só deixa o navegador falar com o host do
// Supabase do projeto. Os testes usam esse mesmo host (lido de lá, para nunca
// ficar fora de sincronia) e interceptam tudo que vai para ele — a chave do
// build é falsa, então mesmo uma chamada que escapasse seria recusada.
const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
const host = html.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!host) throw new Error('e2e: host do Supabase não encontrado na CSP do index.html');

export const SUPABASE_ORIGIN = `https://${host}.supabase.co`;
// supabase-js guarda a sessão em `sb-<primeiro trecho do host>-auth-token`.
export const SESSION_KEY = `sb-${host}-auth-token`;
