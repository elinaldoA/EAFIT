-- Marketing: TikTok como rede conectada (Login Kit + Content Posting API).
-- Só vídeo, sem stories, comentários nem exclusão pela API. O token cifrado
-- é um JSON (acesso de 24 h + refresh de 1 ano) e token_expires_at guarda o
-- vencimento do refresh, renovado pelo cron marketing-refresh-tokens.

alter table public.marketing_accounts drop constraint if exists marketing_accounts_platform_check;
alter table public.marketing_accounts add constraint marketing_accounts_platform_check
  check (platform in ('facebook', 'instagram', 'threads', 'tiktok'));
