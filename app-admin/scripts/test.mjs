// Roda o Vitest normalizando a letra do drive do diretório atual (Windows).
// Com o terminal aberto em "c:\..." (minúsculo), o Vitest carrega o setupTests
// como um segundo módulo e TODOS os testes falham com "failed to find the
// current suite". Entrar de novo na pasta com "C:" maiúsculo resolve.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  .replace(/^[a-z]:/, m => m.toUpperCase());
process.chdir(root);

const args = process.argv.slice(2);
const bin = resolve(root, 'node_modules/vitest/vitest.mjs');
const r = spawnSync(process.execPath, [bin, ...(args.length ? args : ['run'])], {
  stdio: 'inherit',
  cwd: root,
});
process.exit(r.status ?? 1);
