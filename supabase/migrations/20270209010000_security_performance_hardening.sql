-- Endurecimento apontado pelos assessores do Supabase (segurança e desempenho).
--
--  1. Funções admin_* deixam de ser executáveis pelo papel anon (e por PUBLIC):
--     todas já checam is_admin() por dentro, então o anon só recebia erro; o
--     painel admin chama como authenticated. Ficam como estão, de propósito,
--     is_admin (usada em políticas RLS), landing_stats (landing pública),
--     track_install (instalação antes do login) e trainer_invite_name (página
--     de convite do personal).
--  2. search_path fixo nas funções que estavam sem (evita sequestro por schema).
--  3. Políticas RLS: auth.uid()/auth.role()/auth.jwt() viram (select ...), para
--     o Postgres avaliar uma vez por consulta e não uma por linha. Mesma regra,
--     só mais rápida.
--  4. Índice nas chaves estrangeiras de public que ainda não tinham um (apagar
--     conta e junções deixam de varrer a tabela inteira).
--
-- Não mexe em dados nem muda o que cada pessoa pode ver ou fazer.

-- 1. anon fora das funções de admin
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname like 'admin\_%'
      and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- 2. search_path fixo
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and p.proconfig is null
      and p.proname in (
        'league_division', 'limit_nutrition_foods', 'limit_nutrition_entries',
        'trainer_clients_reset_share', 'age_band', 'experiment_pick', 'push_platform',
        'privacy_requests_touch', 'normalize_cref', 'user_sport', 'km_text',
        'experiments_check_variants', 'experiment_bucket', 'run_club_new_code',
        'challenge_series_period', 'challenge_series_title'
      )
  loop
    execute format('alter function %s set search_path = public', f.sig);
  end loop;
end $$;

-- 3. auth.uid() & cia. em (select ...) nas políticas
do $$
declare
  p record;
  fn text;
  q text;
  w text;
  sql text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ 'auth\.(uid|role|jwt)\(\)' or coalesce(with_check, '') ~ 'auth\.(uid|role|jwt)\(\)')
  loop
    q := p.qual;
    w := p.with_check;
    foreach fn in array array['uid', 'role', 'jwt'] loop
      -- o que já está embrulhado (o Postgres normaliza para "( SELECT auth.uid() AS uid)") fica como está
      if q is not null then
        q := replace(q, format('( SELECT auth.%s() AS %s)', fn, fn), '@@' || fn || '@@');
        q := replace(q, format('auth.%s()', fn), format('(select auth.%s())', fn));
        q := replace(q, '@@' || fn || '@@', format('( SELECT auth.%s() AS %s)', fn, fn));
      end if;
      if w is not null then
        w := replace(w, format('( SELECT auth.%s() AS %s)', fn, fn), '@@' || fn || '@@');
        w := replace(w, format('auth.%s()', fn), format('(select auth.%s())', fn));
        w := replace(w, '@@' || fn || '@@', format('( SELECT auth.%s() AS %s)', fn, fn));
      end if;
    end loop;
    if q is distinct from p.qual or w is distinct from p.with_check then
      sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
      if q is not null then sql := sql || format(' using (%s)', q); end if;
      if w is not null then sql := sql || format(' with check (%s)', w); end if;
      execute sql;
    end if;
  end loop;
end $$;

-- 4. índices nas chaves estrangeiras sem índice
do $$
declare
  c record;
  idx text;
begin
  for c in
    select con.conrelid::regclass as tbl,
           con.conname,
           con.conkey,
           (select string_agg(quote_ident(a.attname), ', ' order by k.ord)
              from unnest(con.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as cols
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    where con.contype = 'f'
      and cl.relnamespace = 'public'::regnamespace
      and cl.relkind = 'r'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = con.conrelid
          and i.indisvalid
          and (string_to_array(i.indkey::text, ' ')::int2[])[1:array_length(con.conkey, 1)] = con.conkey
      )
  loop
    idx := left('idx_fk_' || replace(c.tbl::text, 'public.', '') || '_' || c.conname, 63);
    execute format('create index if not exists %I on %s (%s)', idx, c.tbl, c.cols);
  end loop;
end $$;
