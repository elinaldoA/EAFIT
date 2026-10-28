-- Dashboard → Localização: origem do tráfego e aparelho das visitas, por
-- país/estado (blocos "Origem" e "Aparelho" quando há um lugar selecionado).
-- Só page_visits (site e tela de acesso); o uso do app logado não tem origem.

create or replace function public.admin_geo_audience(days_back int default 30)
returns table (page text, country text, uf text, source text, device text, total bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := greatest(1, least(coalesce(days_back, 30), 366));
  since date := (now() at time zone 'America/Sao_Paulo')::date - (n - 1);
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select v.page, v.country, v.uf, v.source, v.device, count(*)::bigint
    from public.page_visits v
    where v.visited_on >= since and v.country is not null
    group by 1, 2, 3, 4, 5;
end;
$$;

revoke execute on function public.admin_geo_audience(int) from public, anon;
grant execute on function public.admin_geo_audience(int) to authenticated;
