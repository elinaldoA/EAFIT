-- Pré-cadastro do EAFIT Run: quem quer ser avisado quando o módulo abrir.
--
-- Três portas de entrada, todas na mesma tabela:
--   * site (eafit.com.br/corrida/) e redes sociais: visitante sem conta manda
--     e-mail pela chave anon (insert direto, como o formulário de contato);
--   * app: quem já tem conta entra com um toque no Perfil, pela função
--     join_run_waitlist() — o e-mail vem da conta, ninguém digita nada;
--   * a coluna `source` guarda de onde veio (instagram, tiktok, site, app…)
--     com a mesma regra de origem das visitas (?origem= / utm_source / referrer).
--
-- Visitante: só insere, só as colunas do formulário, nunca lê. E-mail repetido
-- é recusado pela unique (o site trata como "já está na lista"). Admin: lê,
-- marca como avisado e apaga (painel → Run → Pré-cadastro).
--
-- Contra abuso: checks de formato/tamanho, campo isca no site e o teto diário
-- de enforce_daily_insert_cap (20261023030000_anon_insert_daily_cap.sql).

create table if not exists public.run_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique
    check (length(email) <= 160 and email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  name text check (name is null or length(btrim(name)) between 2 and 80),
  goal text check (goal is null or goal in ('comecar', '5k', '10k', '21k', '42k', 'saude')),
  level text check (level is null or level in ('iniciante', 'intermediario', 'avancado')),
  source text not null default 'direto' check (source ~ '^[a-z0-9_-]{1,40}$'),
  lang text not null default 'pt' check (lang in ('pt', 'en')),
  user_id uuid references auth.users (id) on delete set null,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists run_waitlist_created_idx on public.run_waitlist (created_at desc);
create index if not exists run_waitlist_source_idx on public.run_waitlist (source);

alter table public.run_waitlist enable row level security;

drop policy if exists "anyone can join run waitlist" on public.run_waitlist;
create policy "anyone can join run waitlist" on public.run_waitlist
  for insert to anon, authenticated
  with check (user_id is null and notified_at is null);

drop policy if exists "admin reads run waitlist" on public.run_waitlist;
create policy "admin reads run waitlist" on public.run_waitlist
  for select to authenticated using (public.is_admin());

drop policy if exists "admin updates run waitlist" on public.run_waitlist;
create policy "admin updates run waitlist" on public.run_waitlist
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin deletes run waitlist" on public.run_waitlist;
create policy "admin deletes run waitlist" on public.run_waitlist
  for delete to authenticated using (public.is_admin());

revoke all on public.run_waitlist from anon, authenticated;
grant insert (email, name, goal, level, source, lang) on public.run_waitlist to anon, authenticated;
grant select, delete on public.run_waitlist to authenticated;
grant update (notified_at) on public.run_waitlist to authenticated;

drop trigger if exists run_waitlist_daily_cap on public.run_waitlist;
create trigger run_waitlist_daily_cap
  before insert on public.run_waitlist
  for each row execute function public.enforce_daily_insert_cap(1000);

-- ---------------------------------------------------------------------------
-- App: a pessoa logada entra na lista com a própria conta. Se o e-mail já
-- estava (veio antes pelo site), só liga a linha à conta. Idempotente.
-- ---------------------------------------------------------------------------
create or replace function public.join_run_waitlist(
  p_source text default 'app',
  p_goal text default null,
  p_level text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_source text := lower(regexp_replace(coalesce(p_source, ''), '[^a-zA-Z0-9_-]', '', 'g'));
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null or v_email = '' then raise exception 'no_email'; end if;

  if v_source = '' then v_source := 'app'; end if;
  v_source := left(v_source, 40);

  insert into public.run_waitlist (email, goal, level, source, user_id)
  values (
    v_email,
    case when p_goal in ('comecar', '5k', '10k', '21k', '42k', 'saude') then p_goal end,
    case when p_level in ('iniciante', 'intermediario', 'avancado') then p_level end,
    v_source,
    v_uid
  )
  on conflict (email) do update
    set user_id = excluded.user_id,
        goal = coalesce(excluded.goal, public.run_waitlist.goal),
        level = coalesce(excluded.level, public.run_waitlist.level);
end;
$$;

revoke execute on function public.join_run_waitlist(text, text, text) from public, anon;
grant execute on function public.join_run_waitlist(text, text, text) to authenticated;

-- A pessoa logada já está na lista? (some o botão do Perfil)
create or replace function public.in_run_waitlist()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.run_waitlist w
    where w.user_id = auth.uid()
       or w.email = (select lower(u.email) from auth.users u where u.id = auth.uid())
  );
$$;

revoke execute on function public.in_run_waitlist() from public, anon;
grant execute on function public.in_run_waitlist() to authenticated;
