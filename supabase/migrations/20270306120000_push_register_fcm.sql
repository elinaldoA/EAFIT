-- Push no app Android (FCM). O token do aparelho entra na mesma tabela das
-- inscrições web, com endpoint = 'fcm:<token>' (p256dh/auth ficam 'fcm', só
-- para satisfazer o NOT NULL). Assim as Edge Functions que já leem
-- push_subscriptions e chamam sendWebPush alcançam o app: o helper
-- (functions/_shared/webpush.ts) vê o prefixo e envia por FCM
-- (functions/_shared/fcm.ts).

-- O app chama esta função em vez de upsert direto: se o aparelho trocou de
-- conta, a linha existente é de outro usuário e a política "own rows" bloquearia
-- o update. Aqui o token passa a pertencer a quem está logado agora.
create or replace function public.push_register_fcm(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_token is null or length(p_token) < 20 or length(p_token) > 4096 then
    raise exception 'invalid token';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), 'fcm:' || p_token, 'fcm', 'fcm')
  on conflict (endpoint) do update set user_id = excluded.user_id;
end;
$$;

revoke execute on function public.push_register_fcm(text) from public, anon;
grant execute on function public.push_register_fcm(text) to authenticated;

-- Token do app Android conta como Android nos painéis.
create or replace function public.push_platform(p_endpoint text)
returns text
language sql
immutable
as $$
  select case
    when p_endpoint ~* '^fcm:' then 'android'
    when p_endpoint ~* '^https://web\.push\.apple\.com/' then 'ios'
    when p_endpoint ~* '^https://(fcm\.googleapis\.com|android\.googleapis\.com)/' then 'android'
    when p_endpoint ~* '\.notify\.windows\.com/' then 'windows'
    when p_endpoint ~* 'push\.services\.mozilla\.com/' then 'firefox'
    else 'outro'
  end;
$$;
