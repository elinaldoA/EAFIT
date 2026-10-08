-- Painel admin: operação — uso do Storage, registro de exclusões de conta,
-- lista de administradores e versões dos documentos legais.

-- ---------------------------------------------------------------------------
-- Uso do Storage por bucket (o tamanho do banco não inclui os arquivos).
-- ---------------------------------------------------------------------------
create or replace function public.admin_storage_usage()
returns table (su_bucket text, su_public boolean, su_objects bigint, su_bytes bigint)
language plpgsql
stable
security definer
set search_path = public, storage
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select b.id::text, b.public, count(o.id)::bigint,
           coalesce(sum(case when (o.metadata->>'size') ~ '^\d+$' then (o.metadata->>'size')::bigint else 0 end), 0)::bigint
    from storage.buckets b
    left join storage.objects o on o.bucket_id = b.id
    group by b.id, b.public
    order by 4 desc, 1;
end;
$$;

revoke execute on function public.admin_storage_usage() from public, anon;
grant execute on function public.admin_storage_usage() to authenticated;

-- ---------------------------------------------------------------------------
-- Exclusões de conta: prova de que o pedido foi atendido, sem guardar quem era
-- (nem id, nem e-mail — a conta deixou de existir). Só a data, quem pediu
-- (a própria pessoa ou um admin) e dois números para entender a saída: há
-- quantos dias a conta existia e quantos treinos tinha. Gravado pelas Edge
-- Functions delete-account e admin-users (service role).
-- ---------------------------------------------------------------------------
create table if not exists public.account_deletions (
  id bigint generated always as identity primary key,
  deleted_at timestamptz not null default now(),
  source text not null check (source in ('self', 'admin')),
  account_age_days int check (account_age_days is null or account_age_days >= 0),
  workouts int check (workouts is null or workouts >= 0)
);

create index if not exists account_deletions_deleted_at_idx on public.account_deletions (deleted_at desc);

alter table public.account_deletions enable row level security;

drop policy if exists "admin reads account deletions" on public.account_deletions;
create policy "admin reads account deletions" on public.account_deletions
  for select using (public.is_admin());

-- Ninguém escreve pelo app: só as Edge Functions (service role) inserem.
revoke all on public.account_deletions from anon, authenticated;
grant select on public.account_deletions to authenticated;
grant select, insert on public.account_deletions to service_role;

-- ---------------------------------------------------------------------------
-- Administradores: quem tem acesso ao painel hoje.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_admin_accounts()
returns table (ad_user uuid, ad_email text, ad_name text, ad_created timestamptz, ad_last_sign_in timestamptz)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select u.id, u.email::text,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), ''),
           u.created_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.is_admin
    order by u.created_at;
end;
$$;

revoke execute on function public.admin_list_admin_accounts() from public, anon;
grant execute on function public.admin_list_admin_accounts() to authenticated;

-- ---------------------------------------------------------------------------
-- Documentos legais: histórico de versões. O texto continua nos arquivos de
-- app-react/public/legal/ (mudar o texto exige publicar o app); aqui fica o
-- registro de qual versão entrou em vigor e quando, para saber quem aceitou
-- antes de uma mudança. O aceite é a data gravada no cadastro
-- (user_metadata.termsAcceptedAt), a mesma para Termos e Privacidade.
-- ---------------------------------------------------------------------------
create table if not exists public.legal_versions (
  id uuid primary key default gen_random_uuid(),
  doc text not null check (doc in ('termos', 'privacidade')),
  version text not null check (length(btrim(version)) between 1 and 30),
  effective_date date not null,
  summary text not null default '' check (length(summary) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (doc, version)
);

alter table public.legal_versions enable row level security;

drop policy if exists "admin reads legal versions" on public.legal_versions;
create policy "admin reads legal versions" on public.legal_versions
  for select using (public.is_admin());

-- Leitura direta só para admin (policy acima); gravação só pela função abaixo.
revoke all on public.legal_versions from anon, authenticated;
grant select on public.legal_versions to authenticated;

create or replace function public.admin_publish_legal_version(
  p_doc text,
  p_version text,
  p_effective date,
  p_summary text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version text := btrim(coalesce(p_version, ''));
  v_summary text := btrim(coalesce(p_summary, ''));
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if p_doc not in ('termos', 'privacidade') then raise exception 'invalid_doc'; end if;
  if length(v_version) not between 1 and 30 then raise exception 'invalid_version'; end if;
  if p_effective is null then raise exception 'invalid_date'; end if;
  if length(v_summary) > 500 then raise exception 'invalid_summary'; end if;
  if exists (select 1 from public.legal_versions l where l.doc = p_doc and l.version = v_version) then
    raise exception 'version_exists';
  end if;

  insert into public.legal_versions (doc, version, effective_date, summary, created_by)
  values (p_doc, v_version, p_effective, v_summary, auth.uid())
  returning id into v_id;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'publishLegalVersion',
          jsonb_build_object('doc', p_doc, 'version', v_version, 'effective_date', p_effective));
  return v_id;
end;
$$;

-- Aceite dos termos na base (sem admins). ta_before = aceitaram antes de
-- `p_since` (a entrada em vigor da versão atual), ou seja, aceitaram uma versão
-- anterior. ta_never = contas sem data de aceite (criadas antes do checkbox).
create or replace function public.admin_terms_acceptance(p_since date default null)
returns table (ta_users bigint, ta_accepted bigint, ta_before bigint, ta_never bigint)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with acc as (
      select case when (u.raw_user_meta_data->>'termsAcceptedAt') ~ '^\d{4}-\d{2}-\d{2}T'
                  then ((u.raw_user_meta_data->>'termsAcceptedAt')::timestamptz at time zone 'America/Sao_Paulo')::date
             end as d
      from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
    )
    select count(*)::bigint,
           count(acc.d)::bigint,
           count(*) filter (where p_since is not null and acc.d < p_since)::bigint,
           count(*) filter (where acc.d is null)::bigint
    from acc;
end;
$$;

revoke execute on function public.admin_publish_legal_version(text, text, date, text) from public, anon;
revoke execute on function public.admin_terms_acceptance(date) from public, anon;
grant execute on function public.admin_publish_legal_version(text, text, date, text) to authenticated;
grant execute on function public.admin_terms_acceptance(date) to authenticated;
