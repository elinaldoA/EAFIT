-- Campanhas de parceiros: a equipe cria no painel admin (Pessoas → Campanhas
-- de parceiros) e elas aparecem no app para embaixadores, influenciadores e
-- personais, cada um com o próprio link já marcado com a campanha.
--
-- Como o resultado é medido, por parceiro:
--   * cliques: o link é o de sempre do parceiro (?ref= ou ?personal=) com
--     &utm_campaign=<slug>; a visita anônima já grava page_visits.campaign
--     junto do ref/personal.
--   * cadastros: o app guarda a campanha do link (lib/partnerCampaign.js) e
--     manda no cadastro em user_metadata.partnerCampaign; o cadastro conta
--     para o parceiro ao qual a conta ficou vinculada (ambassador_referrals ou
--     trainer_invite_signups).
--   * ativados: desses cadastros, quantos treinaram nos 7 primeiros dias
--     (training_days(), a definição única de "treinou").
--
-- Material da campanha: promo_materials ganha campaign_id. Material com
-- campanha segue a visibilidade da campanha (e não o público do material);
-- os sem campanha continuam como antes (Material de divulgação).

-- ---------------------------------------------------------------------------
-- 1. Campanhas
-- ---------------------------------------------------------------------------
create table if not exists public.partner_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  title text not null check (length(btrim(title)) between 1 and 80),
  description text not null default '' check (length(description) <= 1000),
  -- Texto sugerido para o post; {link} vira o link do parceiro.
  caption text not null default '' check (length(caption) <= 1000),
  -- Meta ou prêmio, se houver (ex.: "10 cadastros = 1 mês de comissão em dobro").
  goal text not null default '' check (length(goal) <= 200),
  audiences text[] not null check (
    cardinality(audiences) between 1 and 3
    and audiences <@ array['embaixador', 'influenciador', 'personal']::text[]
  ),
  starts_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  -- null = rascunho (só o painel vê).
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_campaigns_published_idx on public.partner_campaigns (published_at, starts_on);

alter table public.partner_campaigns enable row level security;

drop policy if exists "admin reads partner campaigns" on public.partner_campaigns;
create policy "admin reads partner campaigns" on public.partner_campaigns
  for select using (public.is_admin());

drop policy if exists "content admin writes partner campaigns" on public.partner_campaigns;
create policy "content admin writes partner campaigns" on public.partner_campaigns
  for all using (public.admin_can('content')) with check (public.admin_can('content'));

revoke all on public.partner_campaigns from anon, authenticated;
grant select, insert, update, delete on public.partner_campaigns to authenticated;

-- Depois de publicada, o slug não muda: ele está nos links que já circulam.
create or replace function public.partner_campaigns_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.published_at is not null and new.slug is distinct from old.slug then
    raise exception 'slug_locked' using errcode = '22023',
      hint = 'O endereço da campanha não muda depois de publicada: os links já estão circulando.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists partner_campaigns_guard on public.partner_campaigns;
create trigger partner_campaigns_guard
  before update on public.partner_campaigns
  for each row execute function public.partner_campaigns_guard();

-- Quem pode ver a campanha no app: publicada, já começou, não terminou há
-- mais de 30 dias (o parceiro ainda vê o resultado) e é do seu público.
create or replace function public.can_read_partner_campaign(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.partner_campaigns c
    where c.id = p_id
      and c.published_at is not null
      and c.starts_on <= (now() at time zone 'America/Sao_Paulo')::date
      and (c.ends_on is null or c.ends_on >= (now() at time zone 'America/Sao_Paulo')::date - 30)
      and ((public.my_program_kind() is not null and public.my_program_kind() = any (c.audiences))
           or ('personal' = any (c.audiences) and public.is_trainer()))
  );
$$;

revoke execute on function public.can_read_partner_campaign(uuid) from public, anon;
grant execute on function public.can_read_partner_campaign(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Material da campanha
-- ---------------------------------------------------------------------------
alter table public.promo_materials
  add column if not exists campaign_id uuid references public.partner_campaigns(id) on delete cascade;

create index if not exists promo_materials_campaign_idx on public.promo_materials (campaign_id) where campaign_id is not null;

grant select, insert, delete on public.promo_materials to authenticated;

create or replace function public.can_read_promo_object(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from public.promo_materials m
      where m.storage_path = p_path
        and case when m.campaign_id is null then public.can_read_promo(m.audience)
                 else public.can_read_partner_campaign(m.campaign_id) end
    );
$$;

drop policy if exists "program or admin reads promo materials" on public.promo_materials;
create policy "program or admin reads promo materials" on public.promo_materials
  for select using (
    case when campaign_id is null then public.can_read_promo(audience)
         else public.can_read_partner_campaign(campaign_id) end
  );

-- ---------------------------------------------------------------------------
-- 3. App: campanhas do parceiro logado, com o link e os números dele
--   pc_link_kind = 'ref' (embaixador/influenciador) ou 'personal'
-- ---------------------------------------------------------------------------
create or replace function public.my_partner_campaigns()
returns table (
  pc_id uuid, pc_slug text, pc_title text, pc_description text, pc_caption text, pc_goal text,
  pc_starts_on date, pc_ends_on date, pc_link_kind text, pc_code text,
  pc_visits bigint, pc_signups bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_kind text := public.my_program_kind();
  v_amb_id uuid;
  v_amb_code text;
  v_trainer_code text;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null then return; end if;
  select a.id, a.code into v_amb_id, v_amb_code
  from public.ambassadors a where a.user_id = auth.uid() and a.active limit 1;
  select t.code into v_trainer_code from public.trainers t where t.user_id = auth.uid();
  if v_amb_id is null and v_trainer_code is null then return; end if;

  return query
    with c as (
      select pc.*,
             case when v_kind is not null and v_kind = any (pc.audiences) then 'ref'
                  when v_trainer_code is not null and 'personal' = any (pc.audiences) then 'personal'
             end as link_kind
      from public.partner_campaigns pc
      where pc.published_at is not null
        and pc.starts_on <= today
        and (pc.ends_on is null or pc.ends_on >= today - 30)
    )
    select c.id, c.slug, c.title, c.description, c.caption, c.goal, c.starts_on, c.ends_on, c.link_kind,
      case when c.link_kind = 'ref' then v_amb_code else v_trainer_code end,
      (select count(*) from public.page_visits v
        where v.campaign = c.slug and v.visited_on >= c.starts_on
          and ((c.link_kind = 'ref' and v.ref = v_amb_code)
               or (c.link_kind = 'personal' and v.personal = v_trainer_code))),
      case when c.link_kind = 'ref' then
        (select count(*) from public.ambassador_referrals r join auth.users u on u.id = r.user_id
          where r.ambassador_id = v_amb_id and u.raw_user_meta_data->>'partnerCampaign' = c.slug)
      else
        (select count(*) from public.trainer_invite_signups s join auth.users u on u.id = s.user_id
          where s.trainer_id = auth.uid() and u.raw_user_meta_data->>'partnerCampaign' = c.slug)
      end
    from c
    where c.link_kind is not null
    order by (c.ends_on is not null and c.ends_on < today), c.starts_on desc, c.created_at desc;
end;
$$;

revoke execute on function public.my_partner_campaigns() from public, anon;
grant execute on function public.my_partner_campaigns() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Painel
-- ---------------------------------------------------------------------------
-- Cadastros de cada campanha (qualquer parceiro), com o vínculo resolvido.
create or replace function public.partner_campaign_signups()
returns table (cs_slug text, cs_user uuid, cs_joined date, cs_ambassador uuid, cs_trainer uuid)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.raw_user_meta_data->>'partnerCampaign', u.id,
         (u.created_at at time zone 'America/Sao_Paulo')::date,
         r.ambassador_id, s.trainer_id
  from auth.users u
  left join public.ambassador_referrals r on r.user_id = u.id
  left join public.trainer_invite_signups s on s.user_id = u.id
  where u.raw_user_meta_data ? 'partnerCampaign';
$$;

revoke execute on function public.partner_campaign_signups() from public, anon, authenticated;

-- Totais por campanha: cliques, cadastros e ativados (treinaram nos 7
-- primeiros dias).
create or replace function public.admin_partner_campaign_totals()
returns table (pt_campaign uuid, pt_visits bigint, pt_signups bigint, pt_activated bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with s as (select * from public.partner_campaign_signups()),
    td as (select t.user_id, t.day from public.training_days() t where t.user_id in (select s.cs_user from s))
    select c.id,
      (select count(*) from public.page_visits v
        where v.campaign = c.slug and v.visited_on >= c.starts_on and (v.ref is not null or v.personal is not null)),
      (select count(*) from s where s.cs_slug = c.slug),
      (select count(*) from s where s.cs_slug = c.slug
         and exists (select 1 from td where td.user_id = s.cs_user and td.day between s.cs_joined and s.cs_joined + 6))
    from public.partner_campaigns c;
end;
$$;

grant execute on function public.admin_partner_campaign_totals() to authenticated;

-- Resultado de uma campanha por parceiro (todos os parceiros ativos do
-- público, inclusive quem ainda não trouxe ninguém).
create or replace function public.admin_partner_campaign_results(p_campaign uuid)
returns table (pr_kind text, pr_name text, pr_code text, pr_visits bigint, pr_signups bigint, pr_activated bigint)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  c public.partner_campaigns;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  select * into c from public.partner_campaigns pc where pc.id = p_campaign;
  if c.id is null then return; end if;

  return query
    with s as (select * from public.partner_campaign_signups() x where x.cs_slug = c.slug),
    td as (select t.user_id, t.day from public.training_days() t where t.user_id in (select s.cs_user from s)),
    partners as (
      select a.kind as kind, a.name as name, a.code as code, a.id as amb_id, null::uuid as trainer_id
      from public.ambassadors a
      where a.active and a.kind = any (c.audiences)
      union all
      select 'personal', coalesce(nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), nullif(btrim(u.raw_user_meta_data->>'nome'), ''), u.email),
             t.code, null::uuid, t.user_id
      from public.trainers t join auth.users u on u.id = t.user_id
      where 'personal' = any (c.audiences)
    )
    select p.kind, p.name, p.code,
      (select count(*) from public.page_visits v
        where v.campaign = c.slug and v.visited_on >= c.starts_on
          and ((p.amb_id is not null and v.ref = p.code) or (p.trainer_id is not null and v.personal = p.code))),
      (select count(*) from s
        where (p.amb_id is not null and s.cs_ambassador = p.amb_id) or (p.trainer_id is not null and s.cs_trainer = p.trainer_id)),
      (select count(*) from s
        where ((p.amb_id is not null and s.cs_ambassador = p.amb_id) or (p.trainer_id is not null and s.cs_trainer = p.trainer_id))
          and exists (select 1 from td where td.user_id = s.cs_user and td.day between s.cs_joined and s.cs_joined + 6))
    from partners p
    order by 5 desc, 4 desc, 2;
end;
$$;

grant execute on function public.admin_partner_campaign_results(uuid) to authenticated;
