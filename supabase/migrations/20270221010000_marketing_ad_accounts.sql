-- Marketing → Resultados → Posts promovidos: contas de anúncios da Meta que o login
-- (permissão ads_read) devolveu. Só leitura: o painel mostra gasto, alcance e cliques
-- de cada anúncio, não cria nem edita campanha.
--
-- O token aqui é o de USUÁRIO (a Marketing API não aceita token de Página), cifrado
-- pela Edge Function com MARKETING_TOKEN_KEY, como em marketing_tokens. Tabela sem
-- nenhuma policy: só a service role lê; o painel pede os dados à função `marketing`
-- (action 'ads'), que confere a área Marketing.
--
-- Depois de aplicar: acrescentar `ads_read` na configuração do Login do Facebook para
-- Empresas (se houver META_LOGIN_CONFIG_ID), implantar marketing e marketing-oauth e
-- reconectar o Facebook em Marketing → Contas.

create table if not exists public.marketing_ad_accounts (
  id text primary key,                 -- id da conta de anúncios sem o prefixo "act_"
  name text not null default '',
  currency text not null default 'BRL',
  account_status integer,              -- 1 = ativa (AdAccount.account_status da Meta)
  token_enc text not null,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now()
);

alter table public.marketing_ad_accounts enable row level security;
revoke all on public.marketing_ad_accounts from anon, authenticated;
