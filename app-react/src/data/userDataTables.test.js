import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Guarda da exclusão de conta: toda coluna que aponta para auth.users nas
// migrations precisa ser apagada por supabase/functions/_shared/deleteUserData.ts
// (ou ser uma exceção explicada abaixo). Tabela nova com user_id sem entrar na
// lista deixaria dado pessoal para trás — ou travaria a exclusão do login.
const root = path.resolve(process.cwd(), '../supabase');
const migrationsDir = path.join(root, 'migrations');
const deleteSrc = fs.existsSync(path.join(root, 'functions/_shared/deleteUserData.ts'))
  ? fs.readFileSync(path.join(root, 'functions/_shared/deleteUserData.ts'), 'utf8')
  : '';

const sql = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir).sort().map(f => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n')
  : '';

// tabelas criadas e depois removidas
const dropped = new Set([...sql.matchAll(/drop table (?:if exists )?(?:public\.)?(\w+)/gi)].map(m => m[1]));

// [tabela, coluna, ação do FK] para tudo que referencia auth.users
function userForeignKeys() {
  const out = [];
  const tableRe = /create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/g;
  for (const m of sql.matchAll(tableRe)) {
    for (const c of m[2].matchAll(/^\s*(\w+)\s+uuid[^\n]*?references\s+auth\.users\s*\(id\)([^\n,]*)/gm)) {
      out.push([m[1], c[1], /set null/i.test(c[2]) ? 'set null' : /cascade/i.test(c[2]) ? 'cascade' : 'no action']);
    }
  }
  for (const m of sql.matchAll(/alter table (?:public\.)?(\w+)\s+add column (?:if not exists )?(\w+) uuid[^;]*?references auth\.users\s*\(id\)([^;]*);/gi)) {
    out.push([m[1], m[2], /set null/i.test(m[3]) ? 'set null' : /cascade/i.test(m[3]) ? 'cascade' : 'no action']);
  }
  return out.filter(([t]) => !dropped.has(t));
}

const listed = new Set([...deleteSrc.matchAll(/\['(\w+)',\s*'(\w+)'\]/g)].map(m => `${m[1]}.${m[2]}`));

// Tratadas à parte em deleteUserData (por id do pai) ou fora da regra "dado do usuário".
const HANDLED_ELSEWHERE = new Set([
  'workouts.user_id', 'workout_plans.user_id', // filhas apagadas antes, por id
  'profiles.id', // apagado por último, pela coluna id
]);
// Autoria de admin: o registro fica, sem o autor (FK vira set null na migration 20261025020000).
const ADMIN_AUTHORSHIP = new Set(['admin_audit_log.admin_id', 'scheduled_broadcasts.created_by']);

describe('exclusão de conta cobre todas as tabelas do usuário', () => {
  const fks = userForeignKeys();

  it('a extração enxerga as migrations', () => {
    expect(fks.length).toBeGreaterThan(30);
    expect(listed.size).toBeGreaterThan(30);
  });

  it('toda coluna user->auth.users está na lista de exclusão (ou é exceção explícita)', () => {
    const missing = fks
      .filter(([, , action]) => action !== 'set null')
      .map(([t, c]) => `${t}.${c}`)
      .filter(k => !listed.has(k) && !HANDLED_ELSEWHERE.has(k) && !ADMIN_AUTHORSHIP.has(k));
    expect(missing).toEqual([]);
  });

  it('colunas set null (autoria) não impedem a exclusão', () => {
    const blockers = fks
      .filter(([, , action]) => action === 'no action')
      .map(([t, c]) => `${t}.${c}`)
      .filter(k => !HANDLED_ELSEWHERE.has(k) && !listed.has(k));
    // os dois de admin ficam "no action" no CREATE TABLE e são corrigidos pela migration de FKs
    expect(blockers.sort()).toEqual([...ADMIN_AUTHORSHIP].sort());
    expect(sql).toMatch(/admin_audit_log[\s\S]*set null/);
  });

  it('a lista não aponta para tabela que não existe mais', () => {
    const created = new Set([...sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)/gi)].map(m => m[1]));
    const ghosts = [...listed].map(k => k.split('.')[0]).filter(t => !created.has(t) || dropped.has(t));
    expect(ghosts).toEqual([]);
  });
});
