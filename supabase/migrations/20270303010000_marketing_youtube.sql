-- Marketing: YouTube como rede conectada (Google OAuth + YouTube Data API v3).
-- O painel publica vídeos (inclusive Shorts) no canal da EAFIT. Não há stories,
-- comentários nem métricas por aqui: só publicar e apagar.

alter table public.marketing_accounts drop constraint if exists marketing_accounts_platform_check;
alter table public.marketing_accounts add constraint marketing_accounts_platform_check
  check (platform in ('facebook', 'instagram', 'tiktok', 'youtube'));
